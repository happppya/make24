import { assetUrl } from '../assetUrl'

/** Human labels and tiny formatters shared by the screens. */

export function lobbyModeLabel(mode: string): string {
  switch (mode) {
    case 'first-to-solve':
      return 'FIRST TO SOLVE'
    case 'best-30s':
      return 'BEST 30s'
    case 'best-1m':
      return 'BEST 1m'
    case 'best-3m':
      return 'BEST 3m'
    case 'best-5m':
      return 'BEST 5m'
    case 'best-10m':
      return 'BEST 10m'
    default:
      return mode.toUpperCase()
  }
}

export function lobbyPhaseLabel(phaseName: string): string {
  switch (phaseName) {
    case 'lobby':
      return 'IN LOBBY'
    case 'playing':
      return 'ROUND LIVE'
    case 'round-end':
      return 'BETWEEN ROUNDS'
    case 'game-over':
      return 'FINISHED'
    default:
      return phaseName.toUpperCase()
  }
}

export function pointsLabel(points: number): string {
  return `${points} ${points === 1 ? 'pt' : 'pts'}`
}

export function formatTimer(seconds: number | null): string {
  if (seconds === null) return '∞'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function spriteUrl(name: string): string {
  return assetUrl(`card-sprites/${name}`)
}

/** 1–9 for the first nine operator slots, 0 for the tenth. */
export function opKeyLabel(index: number): string {
  return index === 9 ? '0' : String(index + 1)
}

/** Physical digit key -> operator slot index (Digit1..Digit9, Digit0 last). */
export function opSlotFromCode(code: string): number | null {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  if (!match) return null
  const digit = Number(match[1])
  return digit === 0 ? 9 : digit - 1
}
