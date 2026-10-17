#!/usr/bin/env node
/**
 * Regenerates the screenshots the tutorial overlay annotates.
 *
 * The tutorial shows the real interface rather than a redrawn imitation, so the
 * images have to come from the running game. This drives a headless Chromium
 * (Edge or Chrome, whichever is installed) over the DevTools protocol: it plays
 * a couple of moves, grabs the board and the HUD, then prints the on-screen box
 * of every element a callout points at as percentages, so the pins stay put
 * when the image is scaled.
 *
 * Usage: npm run dev (one terminal), then node scripts/capture-tutorial.mjs
 * Override the app URL with a first argument or APP_URL, the port with CDP_PORT.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const APP_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:5199/'
const PORT = Number(process.env.CDP_PORT ?? 9333)
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tutorial')
const VIEWPORT = { width: 1440, height: 900 }

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function findBrowser() {
  const found = BROWSERS.find((path) => existsSync(path))
  if (!found) {
    throw new Error(
      `No Chromium browser found. Set CHROME_PATH to one of:\n  ${BROWSERS.join('\n  ')}`
    )
  }
  return found
}

async function waitForJson(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch {
      /* browser not listening yet */
    }
    await sleep(150)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })
    this.ws.on('message', (raw) => {
      const message = JSON.parse(String(raw))
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      if (message.error) entry.reject(new Error(`${message.error.message} (${message.error.code})`))
      else entry.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'Evaluation failed')
    }
    return result.result?.value
  }

  close() {
    this.ws.close()
  }
}

async function waitFor(cdp, expression, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await cdp.eval(`Boolean(${expression})`)) return
    await sleep(120)
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}

/** Clicks through `document.querySelector`, so it works without a synthetic pointer. */
async function click(cdp, selector, index = 0) {
  const clicked = await cdp.eval(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    if (!el) return false
    el.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Nothing to click for ${selector}[${index}]`)
  await sleep(360)
}

const SELECTORS = {
  ribbon: '.equation-ribbon',
  target: '.blind-card',
  accuracy: '.pixel-chip--mult',
  accuracyMeter: '.accuracy-meter',
  cost: '.cost-block',
  tabs: '.workspace-stack',
  rail: '.op-rail',
  actions: '.board-actions',
  pan: '.board-pan',
  felt: '.felt-table',
  sidebar: '.table-sidebar',
  sidebarActions: '.sidebar-actions',
  group: '.expr-node--root',
  settings: '.lobby-settings',
  mode: '#setting-mode',
  cards: '#setting-num-cards',
  targetPreset: '#setting-target',
  approx: '#setting-approx',
  firstTo: '#setting-first-to',
  operators: '.operator-toggles',
  players: '.lobby-players',
}

async function measure(cdp) {
  const entries = Object.entries(SELECTORS)
  const expression = `(() => {
    const out = {}
    const boxes = ${JSON.stringify(entries)}
    for (const [key, selector] of boxes) {
      const el = document.querySelector(selector)
      if (!el) continue
      const r = el.getBoundingClientRect()
      out[key] = { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    return out
  })()`
  return cdp.eval(expression)
}

/** Where on an element a callout dot sits, inset far enough to stay inside it. */
const ANCHORS = {
  tl: (b) => ({ x: b.x + 12, y: b.y + 12 }),
  tr: (b) => ({ x: b.x + b.w - 12, y: b.y + 12 }),
  bl: (b) => ({ x: b.x + 12, y: b.y + b.h - 12 }),
  br: (b) => ({ x: b.x + b.w - 12, y: b.y + b.h - 12 }),
  left: (b) => ({ x: b.x + 12, y: b.y + b.h / 2 }),
  right: (b) => ({ x: b.x + b.w - 12, y: b.y + b.h / 2 }),
  top: (b) => ({ x: b.x + b.w / 2, y: b.y + 12 }),
  bottom: (b) => ({ x: b.x + b.w / 2, y: b.y + b.h - 12 }),
  center: (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }),
  // Outside variants sit beside the element, clear of its text.
  outleft: (b) => ({ x: b.x - 16, y: b.y + b.h / 2 }),
  outright: (b) => ({ x: b.x + b.w + 16, y: b.y + b.h / 2 }),
  outtop: (b) => ({ x: b.x + b.w / 2, y: b.y - 16 }),
}

function pinsFor(boxes, anchors, frame) {
  const pins = {}
  for (const [key, anchor] of Object.entries(anchors)) {
    const box = boxes[key]
    if (!box) continue
    const point = (ANCHORS[anchor] ?? ANCHORS.center)(box)
    pins[key] = {
      x: Number((((point.x - frame.x) / frame.w) * 100).toFixed(2)),
      y: Number((((point.y - frame.y) / frame.h) * 100).toFixed(2)),
    }
  }
  return pins
}

async function shoot(cdp, file, clip) {
  const params = { format: 'png', captureBeyondViewport: false }
  if (clip) params.clip = { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: clip.scale }
  const { data } = await cdp.send('Page.captureScreenshot', params)
  await writeFile(join(OUT_DIR, file), Buffer.from(data, 'base64'))
  console.log(`  wrote public/tutorial/${file}`)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = spawn(
    findBrowser(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(tmpdir(), 'make24-tutorial-capture')}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  let browserCdp
  let pageCdp
  try {
    const version = await waitForJson(`http://127.0.0.1:${PORT}/json/version`)
    // Newer Chromium requires PUT for this endpoint; the plain GET form is gone.
    const target = await (
      await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
    ).json()

    pageCdp = new Cdp(target.webSocketDebuggerUrl)
    await pageCdp.ready
    await pageCdp.send('Page.enable')
    await pageCdp.send('Runtime.enable')
    await pageCdp.send('Emulation.setDeviceMetricsOverride', {
      ...VIEWPORT,
      deviceScaleFactor: 1,
      mobile: false,
    })

    console.log(`Capturing from ${APP_URL}`)

    // ---- Scene 1: a round in progress, two cards merged, a binary armed ----
    await pageCdp.send('Page.navigate', { url: APP_URL })
    await waitFor(pageCdp, `document.querySelector('[data-testid="enter-singleplayer"]')`)
    await sleep(500)
    await click(pageCdp, '[data-testid="enter-singleplayer"]')
    await click(pageCdp, '[data-testid="start-round-btn"]')
    await waitFor(pageCdp, `document.querySelectorAll('.expr-node--root').length >= 3`)
    await sleep(500)
    await click(pageCdp, '.expr-node--root', 0)
    await click(pageCdp, '[data-testid="op-add"]')
    await click(pageCdp, '.expr-node--root', 1)
    await sleep(400)
    await click(pageCdp, '[data-testid="op-mult"]')
    await sleep(1300) // let the floating "+10" cue clear

    const boardBoxes = await measure(pageCdp)
    const frame = { x: 0, y: 0, w: VIEWPORT.width, h: VIEWPORT.height }
    await shoot(pageCdp, 'board.png')

    // ---- Scene 1b: fold the rest in so the HUD can show a real cost -------
    await click(pageCdp, '.expr-node--root', 2) // completes the armed multiply
    await click(pageCdp, '[data-testid="op-add"]')
    await click(pageCdp, '.expr-node--root', 1)
    await sleep(1300)

    const hudBoxes = await measure(pageCdp)
    // Crop to the readouts the cost section talks about: target, accuracy, cost.
    const hudBottom = hudBoxes.cost
      ? hudBoxes.cost.y + hudBoxes.cost.h
      : hudBoxes.sidebar.y + hudBoxes.sidebar.h
    const hudPad = 34
    const hudClip = hudBoxes.sidebar && {
      x: Math.max(0, hudBoxes.sidebar.x - hudPad),
      y: Math.max(0, hudBoxes.sidebar.y - hudPad),
      w: Math.min(VIEWPORT.width - hudBoxes.sidebar.x + hudPad, hudBoxes.sidebar.w + hudPad * 2),
      h: Math.min(
        VIEWPORT.height - hudBoxes.sidebar.y + hudPad,
        hudBottom - hudBoxes.sidebar.y + hudPad
      ),
      scale: 2,
    }
    if (hudClip) await shoot(pageCdp, 'hud.png', hudClip)

    // ---- Scene 2: the settings panel, seated at a table so the host can edit ----
    await pageCdp.send('Page.navigate', { url: APP_URL })
    await waitFor(pageCdp, `document.querySelector('[data-testid="enter-singleplayer"]')`)
    await sleep(500)
    await click(pageCdp, '[data-testid="enter-multiplayer"]')
    await waitFor(pageCdp, `document.querySelector('[data-testid="mp-join-btn"]')`)
    await click(pageCdp, '[data-testid="mp-join-btn"]')
    await waitFor(
      pageCdp,
      `document.querySelector('[data-testid="mp-status"]')?.classList.contains('mp-status--connected')`
    )
    await sleep(900)
    const lobbyBoxes = await measure(pageCdp)
    const settingsClip = lobbyBoxes.settings && {
      x: Math.max(0, lobbyBoxes.settings.x - 12),
      y: Math.max(0, lobbyBoxes.settings.y - 12),
      w: Math.min(VIEWPORT.width - lobbyBoxes.settings.x + 12, lobbyBoxes.settings.w + 24),
      h: Math.min(VIEWPORT.height - lobbyBoxes.settings.y + 12, lobbyBoxes.settings.h + 24),
      scale: 1.5,
    }
    if (settingsClip) await shoot(pageCdp, 'settings.png', settingsClip)

    // ---- Annotation coordinates, as percentages of each image ----
    const round2 = (value) => Number(value.toFixed(2))
    const report = {
      board: {
        size: `${VIEWPORT.width}x${VIEWPORT.height}`,
        pins: pinsFor(
          boardBoxes,
          {
            group: 'tl',
            rail: 'bl',
            actions: 'left',
            pan: 'right',
            tabs: 'right',
            ribbon: 'right',
          },
          frame
        ),
      },
    }
    if (hudClip) {
      report.hud = {
        crop: { x: round2(hudClip.x), y: round2(hudClip.y), w: round2(hudClip.w), h: round2(hudClip.h) },
        pins: pinsFor(
          hudBoxes,
          { target: 'outright', accuracyMeter: 'outright', cost: 'outright' },
          hudClip
        ),
      }
    }
    if (settingsClip) {
      report.settings = {
        crop: {
          x: round2(settingsClip.x),
          y: round2(settingsClip.y),
          w: round2(settingsClip.w),
          h: round2(settingsClip.h),
        },
        pins: pinsFor(
          lobbyBoxes,
          {
            mode: 'right',
            cards: 'right',
            targetPreset: 'right',
            approx: 'right',
            firstTo: 'right',
            operators: 'br',
          },
          settingsClip
        ),
      }
    }
    console.log('\nAnnotation coordinates:')
    console.log(JSON.stringify(report, null, 2))

    browserCdp = new Cdp(version.webSocketDebuggerUrl)
    await browserCdp.ready
    await browserCdp.send('Browser.close')
  } finally {
    pageCdp?.close()
    browserCdp?.close()
    await sleep(300)
    if (!browser.killed) browser.kill()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
