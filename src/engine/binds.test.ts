import { describe, expect, it } from 'vitest'
import {
  createBoundGroups,
  createDefaultBindRules,
  findBindFormations,
} from './binds'
import { createCard } from './deck'
import { calculateScoreBreakdown, formatExpressionLhs } from './math'
import {
  applyOperatorInWorkspace,
  countCardsInNode,
  createWorkspace,
  resetWorkspaceToHand,
  selectGroupInWorkspace,
  ungroupInWorkspace,
} from './workspace'
import type { BindRulesConfig, Card, Rank, Suit } from './types'

function card(rank: Rank, id: string, suit: Suit = 'clubs'): Card {
  return createCard(rank, suit, id)
}

function rules(overrides: Partial<BindRulesConfig> = {}): BindRulesConfig {
  const base = createDefaultBindRules()
  return {
    ...base,
    ...overrides,
    dragon: { ...base.dragon, enabled: true, ...overrides.dragon },
    rook: { ...base.rook, enabled: true, ...overrides.rook },
  }
}

describe('dragon binds', () => {
  it('stays off until the lobby enables it', () => {
    const hand = [card(1, 'a'), card(2, 'b'), card(3, 'c')]
    expect(findBindFormations(hand, createDefaultBindRules())).toEqual([])
  })

  it('groups a consecutive run into one product', () => {
    const hand = [card(1, 'a'), card(2, 'b'), card(3, 'c'), card(9, 'd')]
    const formations = findBindFormations(hand, rules({ dragon: { enabled: true, required: 3 } }))

    expect(formations).toHaveLength(1)
    expect(formations[0]!.kind).toBe('dragon')
    expect(formations[0]!.cards.map((c) => c.rank)).toEqual([1, 2, 3])
    expect(formations[0]!.value).toBe(6)

    const groups = createBoundGroups(hand, rules({ dragon: { enabled: true, required: 3 } }))
    expect(groups.map((group) => group.kind)).toEqual(['bind', 'card'])
    expect(groups[0]!.kind === 'bind' && groups[0]!.value).toBe(6)
  })

  it('takes the whole run when it is longer than the requirement', () => {
    const hand = [card(2, 'a'), card(3, 'b'), card(4, 'c'), card(5, 'd')]
    const formations = findBindFormations(hand, rules({ dragon: { enabled: true, required: 3 } }))

    expect(formations).toHaveLength(1)
    expect(formations[0]!.cards.map((c) => c.rank)).toEqual([2, 3, 4, 5])
    expect(formations[0]!.value).toBe(120)
  })

  it('does not wrap from king back to ace', () => {
    const hand = [card(13, 'a'), card(1, 'b'), card(2, 'c')]
    const formations = findBindFormations(hand, rules({ dragon: { enabled: true, required: 3 } }))
    expect(formations).toEqual([])
  })

  it('uses only one card per rank when duplicates are dealt', () => {
    const hand = [card(1, 'a'), card(1, 'b'), card(2, 'c'), card(3, 'd')]
    const formations = findBindFormations(hand, rules({ dragon: { enabled: true, required: 3 } }))

    expect(formations).toHaveLength(1)
    expect(formations[0]!.cards.map((c) => c.id)).toEqual(['a', 'c', 'd'])
  })
})

describe('rook binds', () => {
  it('groups every copy of a rank into one product', () => {
    const hand = [card(5, 'a'), card(5, 'b'), card(5, 'c'), card(9, 'd')]
    const formations = findBindFormations(hand, rules({ dragon: { enabled: false, required: 3 }, rook: { enabled: true, required: 2 } }))

    expect(formations).toHaveLength(1)
    expect(formations[0]!.kind).toBe('rook')
    expect(formations[0]!.cards.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(formations[0]!.value).toBe(125)
  })

  it('prefers the rank with the most copies, then the lower rank', () => {
    const hand = [
      card(9, 'a'),
      card(9, 'b'),
      card(4, 'c'),
      card(4, 'd'),
      card(4, 'e'),
    ]
    const formations = findBindFormations(hand, rules({ dragon: { enabled: false, required: 3 }, rook: { enabled: true, required: 2 }, maxBinds: 2 }))

    expect(formations.map((formation) => formation.cards.length)).toEqual([3, 2])
    expect(formations[0]!.cards[0]!.rank).toBe(4)
    expect(formations[1]!.cards[0]!.rank).toBe(9)
  })
})

describe('bind priority and limits', () => {
  it('tries dragons before rooks', () => {
    const hand = [card(1, 'a'), card(1, 'b'), card(2, 'c'), card(3, 'd'), card(1, 'e')]
    const formations = findBindFormations(
      hand,
      rules({ dragon: { enabled: true, required: 3 }, rook: { enabled: true, required: 2 }, maxBinds: 1 })
    )

    expect(formations).toHaveLength(1)
    expect(formations[0]!.kind).toBe('dragon')
    expect(formations[0]!.cards.map((c) => c.rank)).toEqual([1, 2, 3])
  })

  it('fills the remaining bind slots with rooks after a dragon', () => {
    const hand = [card(1, 'a'), card(1, 'b'), card(1, 'c'), card(2, 'd'), card(3, 'e')]
    const formations = findBindFormations(
      hand,
      rules({ dragon: { enabled: true, required: 3 }, rook: { enabled: true, required: 2 }, maxBinds: 2 })
    )

    expect(formations.map((formation) => formation.kind)).toEqual(['dragon', 'rook'])
    expect(formations[0]!.cards.map((c) => c.id)).toEqual(['a', 'd', 'e'])
    expect(formations[1]!.cards.map((c) => c.id)).toEqual(['b', 'c'])
  })

  it('honours a zero bind cap and disabled individual rules', () => {
    const hand = [card(1, 'a'), card(1, 'b'), card(2, 'c'), card(3, 'd')]
    expect(
      findBindFormations(hand, rules({ dragon: { enabled: true, required: 3 }, maxBinds: 0 }))
    ).toEqual([])
    expect(
      findBindFormations(
        hand,
        rules({ dragon: { enabled: false, required: 3 }, rook: { enabled: true, required: 2 } })
      ).map((formation) => formation.kind)
    ).toEqual(['rook'])
  })
})

describe('bind scoring and locking', () => {
  it('charges nothing for a bind and formats its product', () => {
    const hand = [card(1, 'a'), card(2, 'b'), card(3, 'c'), card(9, 'd')]
    const group = createBoundGroups(hand, rules({ dragon: { enabled: true, required: 3 } }))[0]!

    expect(group.kind).toBe('bind')
    expect(calculateScoreBreakdown(group).total).toBe(0)
    expect(formatExpressionLhs(group)).toBe('1 × 2 × 3')
  })

  it('starts every workspace with the same locked bind groups', () => {
    const hand = [card(1, 'a'), card(2, 'b'), card(3, 'c'), card(9, 'd')]
    const bindRules = rules({ dragon: { enabled: true, required: 3 } })
    const ws = createWorkspace(0, hand, bindRules)

    expect(ws.groups.map((group) => group.kind)).toEqual(['bind', 'card'])
    const bind = ws.groups[0]!
    expect(countCardsInNode(bind)).toBe(3)

    selectGroupInWorkspace(ws, bind.id)
    const split = ungroupInWorkspace(ws)
    expect(split.changed).toBe(false)
    expect(split.error).toContain('locked')
    expect(ws.groups).toHaveLength(2)

    resetWorkspaceToHand(ws, hand, bindRules)
    expect(ws.groups.map((group) => group.kind)).toEqual(['bind', 'card'])
  })

  it('lets operators use a bind as one group, then unwraps back to the lock', () => {
    const hand = [card(1, 'a'), card(2, 'b'), card(3, 'c'), card(9, 'd')]
    const bindRules = rules({ dragon: { enabled: true, required: 3 } })
    const ws = createWorkspace(0, hand, bindRules)
    selectGroupInWorkspace(ws, ws.groups[0]!.id)

    expect(applyOperatorInWorkspace(ws, 'fact').changed).toBe(true)
    expect(ws.groups[0]!.kind).toBe('unary')
    expect(ws.groups[0]!.value).toBe(720)
    expect(calculateScoreBreakdown(ws.groups[0]!).total).toBe(10)

    // Splitting the unary wrapper reveals the bind again; the bind itself stays locked.
    expect(ungroupInWorkspace(ws, ws.groups[0]!.id).changed).toBe(true)
    expect(ws.groups[0]!.kind).toBe('bind')
    expect(ungroupInWorkspace(ws, ws.groups[0]!.id).changed).toBe(false)
  })
})

describe('bound groups', () => {
  it('keeps the dealt order and returns plain cards when nothing binds', () => {
    const hand = [card(7, 'a'), card(9, 'b'), card(11, 'c')]
    const groups = createBoundGroups(hand, createDefaultBindRules())
    expect(groups.map((group) => group.kind)).toEqual(['card', 'card', 'card'])
    expect(groups.map((group) => group.id)).toEqual(['leaf-a', 'leaf-b', 'leaf-c'])
  })

  it('places a bind where its first card was dealt', () => {
    const hand = [card(9, 'a'), card(1, 'b'), card(2, 'c'), card(3, 'd'), card(4, 'e')]
    const groups = createBoundGroups(hand, rules({ dragon: { enabled: true, required: 3 } }))

    expect(groups).toHaveLength(2)
    expect(groups[0]!.kind).toBe('card')
    expect(groups[1]!.kind).toBe('bind')
    if (groups[1]!.kind === 'bind') {
      expect(groups[1]!.cards.map((c) => c.card.id)).toEqual(['b', 'c', 'd', 'e'])
      expect(groups[1]!.value).toBe(24)
      expect(groups[1]!.headerText).toBe('1 × 2 × 3 × 4 = 24')
    }
  })
})
