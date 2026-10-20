import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMultiplayerServer, type MultiplayerServer } from '../../server/server'
import { PuzzleLeaderboardStore } from '../../server/puzzleLeaderboard'
import { createPuzzle, puzzleLeaderboardKey, validatePuzzleAttempt } from '../engine/puzzles'

const NOW = Date.UTC(2026, 9, 19, 12)

let server: MultiplayerServer | null = null
let tempDir: string | null = null

afterEach(async () => {
  await server?.close()
  server = null
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

function tempFile(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'make24-puzzles-'))
  return join(tempDir, 'boards.json')
}

function entry(name: string, score: number, at = NOW) {
  return {
    playerName: name,
    score,
    equation: '1 + 2 = 3',
    lhs: '1 + 2',
    finalValue: 3,
    submittedAt: at,
  }
}

describe('puzzle leaderboard store', () => {
  it('sorts lowest scores first, keeps a name’s best, and reloads from disk', () => {
    const file = tempFile()
    const store = new PuzzleLeaderboardStore({ filePath: file })
    const key = 'daily:2026-10-19'

    store.submit(key, entry('Ada', 40))
    store.submit(key, entry('Bo', 20))
    store.submit(key, entry('Cy', 30))
    store.submit(key, entry('Ada', 35))
    store.submit(key, entry('ada', 90))

    expect(store.top(key).map((row) => [row.playerName, row.score])).toEqual([
      ['Bo', 20],
      ['Cy', 30],
      ['Ada', 35],
    ])

    const reloaded = new PuzzleLeaderboardStore({ filePath: file })
    expect(reloaded.top(key).map((row) => [row.playerName, row.score])).toEqual([
      ['Bo', 20],
      ['Cy', 30],
      ['Ada', 35],
    ])
  })

  it('reports whether a submission improved the board', () => {
    const store = new PuzzleLeaderboardStore({ filePath: null })
    const key = 'weekly:2026-W43'
    expect(store.submit(key, entry('Ada', 90))).toMatchObject({ improved: true, rank: 1 })
    expect(store.submit(key, entry('Ada', 120))).toMatchObject({ improved: false, rank: 1 })
    expect(store.submit(key, entry('Ada', 70))).toMatchObject({ improved: true, rank: 1 })
  })
})

describe('puzzle leaderboard HTTP API', () => {
  it('accepts a validated solution and serves it back while the puzzle is current', async () => {
    const puzzle = createPuzzle('daily', new Date(NOW))
    const attempt = validatePuzzleAttempt(puzzle, puzzle.referenceSolution)
    expect(attempt.ok).toBe(true)
    if (!attempt.ok) return

    const file = tempFile()
    server = await createMultiplayerServer({
      port: 0,
      now: () => NOW,
      puzzleLeaderboardPath: file,
    })
    const base = `http://127.0.0.1:${server.port}`
    const url = `${base}/puzzles/daily/${puzzle.key}/leaderboard`

    const initial = await fetch(url)
    expect(initial.status).toBe(200)
    expect(await initial.json()).toMatchObject({ entries: [] })

    const posted = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerName: 'Ada', expression: puzzle.referenceSolution }),
    })
    expect(posted.status).toBe(200)
    const body = (await posted.json()) as {
      entries: Array<{ playerName: string; score: number; equation: string }>
      rank: number
    }
    expect(body.rank).toBe(1)
    expect(body.entries[0]).toMatchObject({
      playerName: 'Ada',
      score: attempt.score,
      equation: attempt.equation,
    })

    const readBack = await fetch(url)
    expect((await readBack.json()) as { entries: unknown[] }).toMatchObject({
      entries: [{ playerName: 'Ada', score: attempt.score }],
    })

    const health = await fetch(`${base}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ ok: true, puzzles: 1 })
  })

  it('rejects stale puzzle keys and boards that do not use every card', async () => {
    const puzzle = createPuzzle('daily', new Date(NOW))
    server = await createMultiplayerServer({
      port: 0,
      now: () => NOW,
      puzzleLeaderboardPath: tempFile(),
    })
    const base = `http://127.0.0.1:${server.port}`

    const stale = await fetch(`${base}/puzzles/daily/2026-10-18/leaderboard`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerName: 'Ada', expression: puzzle.referenceSolution }),
    })
    expect(stale.status).toBe(409)

    const incomplete = await fetch(`${base}/puzzles/daily/${puzzle.key}/leaderboard`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerName: 'Ada',
        expression: { kind: 'card', card: puzzle.hand[0] },
      }),
    })
    expect(incomplete.status).toBe(400)
  })

  it('rejects malformed and oversized submissions without crashing the server', async () => {
    const puzzle = createPuzzle('daily', new Date(NOW))
    server = await createMultiplayerServer({
      port: 0,
      now: () => NOW,
      puzzleLeaderboardPath: tempFile(),
    })
    const base = `http://127.0.0.1:${server.port}`
    const url = `${base}/puzzles/daily/${puzzle.key}/leaderboard`

    const missingName = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expression: puzzle.referenceSolution }),
    })
    expect(missingName.status).toBe(400)

    const oversized = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerName: 'Ada', expression: 'x'.repeat(40_000) }),
    })
    expect(oversized.status).toBe(413)

    const stillAlive = await fetch(`${base}/health`)
    expect(stillAlive.status).toBe(200)
  })

  it('persists a submitted board keyed by kind and period', async () => {
    const file = tempFile()
    server = await createMultiplayerServer({
      port: 0,
      now: () => NOW,
      puzzleLeaderboardPath: file,
    })
    const puzzle = createPuzzle('weekly', new Date(NOW))
    await fetch(`${`http://127.0.0.1:${server.port}`}/puzzles/weekly/${puzzle.key}/leaderboard`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerName: 'Ada', expression: puzzle.referenceSolution }),
    })

    const reloaded = new PuzzleLeaderboardStore({ filePath: file })
    expect(reloaded.top(puzzleLeaderboardKey(puzzle))).toHaveLength(1)
  })
})
