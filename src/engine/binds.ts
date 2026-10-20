import { decimalString, toDecimal } from './decimal'
import { formatNumber } from './math'
import type {
  BindKind,
  BindRule,
  BindRulesConfig,
  Card,
  CardLeafNode,
  ExprNode,
  Rank,
} from './types'

export const MAX_PER_DEAL_LIMIT = 6

/** Allowed card counts for each kind's opening group. */
export const BIND_CARD_LIMITS: Record<BindKind, { min: number; max: number }> = {
  dragon: { min: 2, max: 6 },
  rook: { min: 2, max: 5 },
}

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
    dragon: { enabled: false, minCards: 3, maxCards: 6, maxPerDeal: 2 },
    rook: { enabled: false, minCards: 2, maxCards: 5, maxPerDeal: 2 },
  }
}

/** One kind's clamped card range and per-deal cap. */
export interface BindLimits {
  minCards: number
  maxCards: number
  maxPerDeal: number
}

/**
 * Clamps one bind rule to what the engine can honour. `maxCards` is never below
 * `minCards`, so a table can never ask for an impossible range.
 */
export function resolveBindLimits(
  kind: BindKind,
  rule: Pick<BindRule, 'minCards' | 'maxCards' | 'maxPerDeal'>
): BindLimits {
  const limits = BIND_CARD_LIMITS[kind]
  const minCards = clampInt(rule.minCards, limits.min, limits.max)
  return {
    minCards,
    maxCards: clampInt(rule.maxCards, minCards, limits.max),
    maxPerDeal: clampInt(rule.maxPerDeal, 0, MAX_PER_DEAL_LIMIT),
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
 * consecutive runs. Rooks then use every remaining copy of a rank. Each kind
 * has its own card range and its own per-deal cap, so a cap of 0 switches that
 * kind off without disabling the other one.
 */
export function findBindFormations(hand: readonly Card[], rules: BindRulesConfig): BindFormation[] {
  if (!Array.isArray(hand) || hand.length === 0) return []

  const remaining = [...hand]
  const chosen: BindFormation[] = []

  if (rules.dragon.enabled) {
    const limits = resolveBindLimits('dragon', rules.dragon)
    if (limits.maxPerDeal > 0) {
      for (const formation of dragonCandidates(remaining, limits)) {
        if (chosen.length >= limits.maxPerDeal) break
        chosen.push(formation)
      }
      removeFormationCards(remaining, chosen)
    }
  }

  if (rules.rook.enabled) {
    const limits = resolveBindLimits('rook', rules.rook)
    for (const formation of rookCandidates(remaining, limits)) {
      if (chosen.length >= limits.maxPerDeal) break
      chosen.push(formation)
    }
  }

  return chosen
}

function dragonCandidates(cards: readonly Card[], limits: BindLimits): BindFormation[] {
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
    .filter((sequence) => sequence.length >= limits.minCards)
    .map((sequence) => {
      // One card per rank: duplicate ranks stay free for a possible rook. Runs
      // longer than the cap bind their lowest ranks and leave the rest loose.
      const picked = sequence
        .slice(0, limits.maxCards)
        .map((rank) => byRank.get(rank)![0]!)
      const exactValue = bindExactValue(picked)
      return { kind: 'dragon' as const, cards: picked, value: Number(exactValue), exactValue }
    })
    .sort((a, b) => b.cards.length - a.cards.length || a.cards[0]!.rank - b.cards[0]!.rank)
}

function rookCandidates(cards: readonly Card[], limits: BindLimits): BindFormation[] {
  const byRank = new Map<Rank, Card[]>()
  for (const card of cards) {
    const group = byRank.get(card.rank)
    if (group) group.push(card)
    else byRank.set(card.rank, [card])
  }

  return [...byRank.entries()]
    .filter(([, group]) => group.length >= limits.minCards)
    .map(([, group]) => {
      // Stacks larger than the cap use their earliest-dealt copies.
      const picked = group.slice(0, limits.maxCards)
      const exactValue = bindExactValue(picked)
      return {
        kind: 'rook' as const,
        cards: picked,
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

/** Compact labels for the lobby summary and puzzle cards, e.g. `Dragon 3–6 ×2`. */
export function bindRuleLabels(rules: BindRulesConfig): string[] {
  const labels: string[] = []
  for (const kind of ['dragon', 'rook'] as const) {
    const rule = rules[kind]
    if (!rule.enabled) continue
    const limits = resolveBindLimits(kind, rule)
    if (limits.maxPerDeal === 0) continue
    const span =
      limits.minCards === limits.maxCards
        ? `${limits.minCards}`
        : `${limits.minCards}–${limits.maxCards}`
    labels.push(`${BIND_LABELS[kind]} ${span} ×${limits.maxPerDeal}`)
  }
  return labels
}
