/**
 * Tiny synthesized sound engine.
 *
 * No audio assets: every cue is built from oscillators + short noise bursts so
 * the game keeps its chunky arcade feel without shipping megabytes of samples.
 * The AudioContext is created lazily on the first user gesture (browser autoplay
 * policy), and every call is a no-op when WebAudio is unavailable.
 */

export type SfxName =
  | 'click'
  | 'select'
  | 'place'
  | 'merge'
  | 'ungroup'
  | 'error'
  | 'hit'
  | 'deal'
  | 'fanfare'
  | 'tick'

const STORAGE_KEY = 'make24-sfx-enabled'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = readPref()

function readPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.32
      master.connect(ctx.destination)
    } catch {
      ctx = null
      master = null
    }
  }
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume()
  }
  return ctx
}

export function isSfxEnabled(): boolean {
  return enabled
}

export function setSfxEnabled(next: boolean): void {
  enabled = next
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      /* storage may be blocked; the in-memory flag still works */
    }
  }
  if (next) getContext()
}

export function toggleSfx(): boolean {
  setSfxEnabled(!enabled)
  return enabled
}

/** Play a one-shot cue. Safe to call anywhere, including during SSR/tests. */
export function playSfx(name: SfxName): void {
  if (!enabled) return
  const audio = getContext()
  if (!audio || !master) return

  switch (name) {
    case 'click':
      tone(audio, { type: 'square', from: 300, to: 210, duration: 0.05, gain: 0.22 })
      break
    case 'select':
      tone(audio, { type: 'square', from: 520, to: 620, duration: 0.06, gain: 0.2 })
      break
    case 'place':
      tone(audio, { type: 'square', from: 380, to: 560, duration: 0.09, gain: 0.22 })
      tone(audio, { type: 'square', from: 560, to: 760, duration: 0.1, gain: 0.16, delay: 0.06 })
      break
    case 'merge':
      tone(audio, { type: 'triangle', from: 180, to: 90, duration: 0.16, gain: 0.34 })
      noise(audio, { duration: 0.09, gain: 0.16, highpass: 900 })
      break
    case 'ungroup':
      tone(audio, { type: 'sawtooth', from: 640, to: 180, duration: 0.16, gain: 0.16 })
      noise(audio, { duration: 0.06, gain: 0.1, highpass: 1600 })
      break
    case 'error':
      tone(audio, { type: 'sawtooth', from: 190, to: 110, duration: 0.2, gain: 0.22 })
      tone(audio, { type: 'square', from: 150, to: 88, duration: 0.18, gain: 0.14, delay: 0.04 })
      break
    case 'hit':
      ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
        tone(audio, {
          type: 'triangle',
          from: freq,
          to: freq * 1.005,
          duration: 0.22,
          gain: 0.2,
          delay: i * 0.075,
        })
      )
      noise(audio, { duration: 0.3, gain: 0.08, highpass: 2600 })
      break
    case 'deal':
      noise(audio, { duration: 0.05, gain: 0.16, highpass: 1400 })
      tone(audio, { type: 'square', from: 620, to: 420, duration: 0.05, gain: 0.1 })
      break
    case 'fanfare':
      ;[392, 523.25, 659.25, 783.99].forEach((freq, i) =>
        tone(audio, {
          type: 'square',
          from: freq,
          to: freq,
          duration: i === 3 ? 0.5 : 0.16,
          gain: 0.18,
          delay: i * 0.13,
        })
      )
      break
    case 'tick':
      tone(audio, { type: 'square', from: 900, to: 900, duration: 0.035, gain: 0.12 })
      break
  }
}

interface ToneOptions {
  type: OscillatorType
  from: number
  to: number
  duration: number
  gain: number
  delay?: number
}

function tone(audio: AudioContext, opts: ToneOptions): void {
  if (!master) return
  const start = audio.currentTime + (opts.delay ?? 0)
  const osc = audio.createOscillator()
  const env = audio.createGain()
  osc.type = opts.type
  osc.frequency.setValueAtTime(opts.from, start)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), start + opts.duration)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), start + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration)
  osc.connect(env)
  env.connect(master)
  osc.start(start)
  osc.stop(start + opts.duration + 0.02)
}

interface NoiseOptions {
  duration: number
  gain: number
  highpass: number
}

function noise(audio: AudioContext, opts: NoiseOptions): void {
  if (!master) return
  const frames = Math.max(1, Math.floor(audio.sampleRate * opts.duration))
  const buffer = audio.createBuffer(1, frames, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  }
  const source = audio.createBufferSource()
  source.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = opts.highpass
  const env = audio.createGain()
  env.gain.value = opts.gain
  source.connect(filter)
  filter.connect(env)
  env.connect(master)
  source.start()
}
