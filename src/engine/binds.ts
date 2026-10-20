import { decimalString, toDecimal } from './decimal'
import { formatNumber } from './math'
import type {
  BindKind,
  BindRulesConfig,
  Card,
  CardLeafNode,
  ExprNode,
  Rank,
} from './types'

export const DRAGON_REQUIRED_MIN = 2
export const DRAGON_REQUIRED_MAX = 6
export const DRAGON_REQUIRED_DEFAULT = 3
export const ROOK_REQUIRED_MIN = 2
export const ROOK_REQUIRED_MAX = 5
export const ROOK_REQUIRED_DEFAULT = 2
export const MAX_BINDS_LIMIT = 6
export const MAX_BINDS_DEFAULT = 2

export const BIND_LABELS: Record<BindKind, string> = {
  dragon: 'Dragon',
  rook: 'Rook',
}

/**
 * Fresh tables keep binds off so the classic deal is unchanged. Lobbies and
 * bind-themed puzzles switch them on explicitly.
 */
export function createDefaultBindRules(): BindRulesConfig {
  return {
    dragon: { enabled: false, required: DRAGON_REQUIRED_DEFAULT },
    rook: { enabled: false, required: ROOK_REQUIRED_DEFAULT },
    maxBinds: MAX_BINDS_DEFAULT,
  }
}

export interface BindFormation {
  kind: BindKind
  /** Cards in display order: rank order for dragons, hand order for rooks. */
  cards: Card[]
  value: number
  exactValue: string
}

/** A bind's exact product, in the same order its cards are shown. */
export function bindExactValue(cards: readonly Pick<Card, 'value'>[]): string {
  return decimalString(
    cards.reduce((product, card) => product.mul(card.value), toDecimal(1))
  )
}

/** Numeric mirror of the bind product for older consumers. */
export function bindValue(cards: readonly Pick<Card, 'value'>[]): number {
  return Number(bindExactValue(cards))
}

export function bindHeaderText(cards: readonly Pick<Card, 'value'>[], value = bindValue(cards)): string {
  return `${cards.map((card) => card.value).join(' × ')} = ${formatNumber(value)}`
}

/** Stable identity for one formation, used to validate submitted boards. */
export function bindKey(kind: BindKind, cards: readonly Pick<Card, 'id'>[]): string {
  return `${kind}:${cards
    .map((card) => card.id)
    .sort()
    .join(',')}`
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)))
}

/**
 * Finds the opening bind groups for a dealt hand.
 *
 * Dragons are considered first and use one card of every rank in the longest
 * consecutive runs. Rooks then use every remaining copy of a rank. The shared
 * cap stops the engine once enough binds have been formed.
 */
export function findBindFormations(hand: readonly Card[], rules: BindRulesConfig): BindFormation[] {
  if (!Array.isArray(hand) || hand.length === 0) return []
  const maxBinds = clampInt(rules.maxBinds, 0, MAX_BINDS_LIMIT)
  if (maxBinds === 0) return []

  const remaining = [...hand]
  const chosen: BindFormation[] = []

  if (rules.dragon.enabled) {
    const required = clampInt(rules.dragon.required, DRAGON_REQUIRED_MIN, DRAGON_REQUIRED_MAX)
    for (const formation of dragonCandidates(remaining, required)) {
      if (chosen.length >= maxBinds) break
      chosen.push(formation)
    }
    removeFormationCards(remaining, chosen)
  }

  if (rules.rook.enabled && chosen.length < maxBinds) {
    const required = clampInt(rules.rook.required, ROOK_REQUIRED_MIN, ROOK_REQUIRED_MAX)
    for (const formation of rookCandidates(remaining, required)) {
      if (chosen.length >= maxBinds) break
      chosen.push(formation)
    }
  }

  return chosen
}

function dragonCandidates(cards: readonly Card[], required: number): BindFormation[] {
  const byRank = new Map<Rank, Card[]>()
  for (const card of cards) {
    const group = byRank.get(card.rank)
    if (group) group.push(card)
    else byRank.set(card.rank, [card])
  }

  const ranks = [...byRank.keys()].sort((a, b) => a - b)
  const runs: Rank[][] = []
  let run: Rank[] = []
  for (const rank of ranks) {
    if (run.length > 0 && rank === run[run.length - 1]! + 1) {
      run.push(rank)
    } else {
      if (run.length > 0) runs.push(run)
      run = [rank]
    }
  }
  if (run.length > 0) runs.push(run)

  return runs
    .filter((sequence) => sequence.length >= required)
    .map((sequence) => {
      // One card per rank: duplicate ranks stay free for a possible rook.
      const picked = sequence.map((rank) => byRank.get(rank)![0]!)
      const exactValue = bindExactValue(picked)
      return { kind: 'dragon' as const, cards: picked, value: Number(exactValue), exactValue }
    })
    .sort((a, b) => b.cards.length - a.cards.length || a.cards[0]!.rank - b.cards[0]!.rank)
}

function rookCandidates(cards: readonly Card[], required: number): BindFormation[] {
  const byRank = new Map<Rank, Card[]>()
  for (const card of cards) {
    const group = byRank.get(card.rank)
    if (group) group.push(card)
    else byRank.set(card.rank, [card])
  }

  return [...byRank.entries()]
    .filter(([, group]) => group.length >= required)
    .map(([, group]) => {
      const exactValue = bindExactValue(group)
      return {
        kind: 'rook' as const,
        cards: [...group],
        value: Number(exactValue),
        exactValue,
      }
    })
    .sort((a, b) => b.cards.length - a.cards.length || a.cards[0]!.rank - b.cards[0]!.rank)
}

function removeFormationCards(remaining: Card[], formations: readonly BindFormation[]): void {
  const spent = new Set(formations.flatMap((formation) => formation.cards.map((card) => card.id)))
  for (let i = remaining.length - 1; i >= 0; i -= 1) {
    if (spent.has(remaining[i]!.id)) remaining.splice(i, 1)
  }
}

/**
 * Builds the starting board: each formation becomes one free bind group at the
 * position of its earliest-dealt card, and every unbound card stays a leaf.
 */
export function createBoundGroups(
  hand: readonly Card[],
  rules: BindRulesConfig
): ExprNode[] {
  const formations = findBindFormations(hand, rules)
  if (formations.length === 0) {
    return hand.map((card) => cardLeaf(card))
  }

  const formationByFirstCard = new Map<string, BindFormation>()
  const members = new Set<string>()
  for (const formation of formations) {
    let firstIndex = Infinity
    for (const card of formation.cards) {
      firstIndex = Math.min(firstIndex, hand.findIndex((dealt) => dealt.id === card.id))
    }
    const firstCard = hand[firstIndex]
    if (firstCard) formationByFirstCard.set(firstCard.id, formation)
    for (const card of formation.cards) members.add(card.id)
  }

  const groups: ExprNode[] = []
  for (const card of hand) {
    const formation = formationByFirstCard.get(card.id)
    if (formation) {
      const cards = formation.cards.map((member) => cardLeaf(member))
      groups.push({
        kind: 'bind',
        id: `bind-${formation.kind}-${card.id}`,
        bind: formation.kind,
        cards,
        value: formation.value,
        exactValue: formation.exactValue,
        headerText: bindHeaderText(formation.cards, formation.value),
      })
      continue
    }
    if (!members.has(card.id)) groups.push(cardLeaf(card))
  }
  return groups
}

function cardLeaf(card: Card): CardLeafNode {
  return {
    kind: 'card',
    id: `leaf-${card.id}`,
    card: { ...card },
    value: card.value,
    exactValue: String(card.value),
  }
}

/** Compact labels for the lobby summary and puzzle cards. */
export function bindRuleLabels(rules: BindRulesConfig): string[] {
  const labels: string[] = []
  if (rules.dragon.enabled) {
    labels.push(`${BIND_LABELS.dragon} ${clampInt(rules.dragon.required, DRAGON_REQUIRED_MIN, DRAGON_REQUIRED_MAX)}+`)
  }
  if (rules.rook.enabled) {
    labels.push(`${BIND_LABELS.rook} ${clampInt(rules.rook.required, ROOK_REQUIRED_MIN, ROOK_REQUIRED_MAX)}+`)
  }
  return labels
}
