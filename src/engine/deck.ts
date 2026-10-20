import type { Card, CardPoolMode, GameSettings, Rank, Suit } from './types'
import { constantById, pickConstant, type ConstantChoice } from './constants'

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

export function getCardLabel(rank: Rank): string {
  switch (rank) {
    case 1:
      return 'A'
    case 11:
      return 'J'
    case 12:
      return 'Q'
    case 13:
      return 'K'
    default:
      return String(rank)
  }
}

export function getCardSpritePath(rank: Rank, suit: Suit): string {
  switch (rank) {
    case 1:
      return `/card-sprites/ace-of-${suit}-large.png`
    case 11:
      return `/card-sprites/jack-of-${suit}.png`
    case 12:
      return `/card-sprites/queen-of-${suit}.png`
    case 13:
      return `/card-sprites/king-of-${suit}.png`
    default:
      return `/card-sprites/${rank}-of-${suit}.png`
  }
}

export function createCard(rank: Rank, suit: Suit, id: string): Card {
  return {
    id,
    rank,
    suit,
    value: rank,
    label: getCardLabel(rank),
    spritePath: getCardSpritePath(rank, suit),
  }
}

export function buildDeckPool(poolMode: CardPoolMode): Array<{ rank: Rank; suit: Suit }> {
  const numDecks =
    poolMode === '1-deck' ? 1 : poolMode === '2-decks' ? 2 : poolMode === '3-decks' ? 3 : 1
  const pool: Array<{ rank: Rank; suit: Suit }> = []
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        pool.push({ rank, suit })
      }
    }
  }
  return pool
}

export function dealHand(
  numCards: number,
  poolMode: CardPoolMode,
  rng: () => number = Math.random
): Card[] {
  const count = Math.max(1, Math.floor(numCards))
  const hand: Card[] = []

  if (poolMode === 'unlimited') {
    for (let i = 0; i < count; i++) {
      const rank = RANKS[Math.floor(rng() * RANKS.length)]!
      const suit = SUITS[Math.floor(rng() * SUITS.length)]!
      hand.push(createCard(rank, suit, `card-${i + 1}`))
    }
    return hand
  }

  let pool = buildDeckPool(poolMode)
  // If numCards exceeds the finite pool size, replenish so dealing never crashes
  while (pool.length < count) {
    pool = pool.concat(buildDeckPool(poolMode))
  }

  // Fisher-Yates partial shuffle
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const temp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = temp
    const chosen = pool[i]!
    hand.push(createCard(chosen.rank, chosen.suit, `card-${i + 1}`))
  }

  return hand
}

/** Range the host's exact-target chooser accepts, for solo and online tables. */
export const MANUAL_TARGET_MIN = -99_999
export const MANUAL_TARGET_MAX = 99_999

type TargetSettings = Pick<
  GameSettings,
  'targetPreset' | 'customMin' | 'customMax' | 'manualTarget'
> & { targetConstant?: ConstantChoice }

/** The catalogued constant a constant-mode round is aiming at, if any. */
export function resolveConstantTarget(
  settings: TargetSettings,
  rng: () => number = Math.random
) {
  if (settings.targetPreset !== 'constant') return null
  if (settings.targetConstant === undefined || settings.targetConstant === 'random') {
    return pickConstant(rng)
  }
  return constantById(settings.targetConstant) ?? pickConstant(rng)
}

export function generateTargetNumber(
  settings: TargetSettings,
  rng: () => number = Math.random
): number {
  switch (settings.targetPreset) {
    case 'just-24':
      return 24
    case 'small': {
      return 1 + Math.floor(rng() * 100) // 1..100 inclusive
    }
    case 'big': {
      return 100 + Math.floor(rng() * (10000 - 100 + 1)) // 100..10000 inclusive
    }
    case 'custom': {
      const min = Math.min(settings.customMin, settings.customMax)
      const max = Math.max(settings.customMin, settings.customMax)
      const intMin = Math.ceil(min)
      const intMax = Math.floor(max)
      if (intMax <= intMin) return intMin
      return intMin + Math.floor(rng() * (intMax - intMin + 1))
    }
    case 'manual': {
      return Number.isFinite(settings.manualTarget) ? settings.manualTarget : 24
    }
    case 'constant': {
      return resolveConstantTarget(settings, rng)?.value ?? Math.PI
    }
  }
}
