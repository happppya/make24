import { describe, expect, it } from 'vitest'
import { formatExpressionLhs } from '../engine/math'
import { createCard } from '../engine/deck'
import type { Card, ExprNode } from '../engine/types'
import { sanitizeSolutionTree } from './solutionTree'

function rawCard(card: Card) {
  return {
    kind: 'card',
    id: `raw-${card.id}`,
    // A submitted board must not be able to change the deck's card art or label.
    card: { ...card, label: 'HACK', spritePath: '/card-sprites/card-back-red.png' },
    value: 999,
  }
}

function rawBinary(operator: string, left: unknown, right: unknown) {
  return { kind: 'binary', id: 'raw-group', operator, left, right, value: -1, headerText: 'fake' }
}

function rawBind(kind: 'dragon' | 'rook', cards: Card[]) {
  return {
    kind: 'bind',
    id: 'raw-bind',
    bind: kind,
    cards: cards.map(rawCard),
    value: -1,
    headerText: 'fake',
  }
}

const dragonRules = {
  dragon: { enabled: true, minCards: 3, maxCards: 6, maxPerDeal: 1 },
  rook: { enabled: false, minCards: 2, maxCards: 5, maxPerDeal: 1 },
} as const

describe('solution tree sanitising', () => {
  const hand = [
    createCard(4, 'spades', 'card-1'),
    createCard(3, 'hearts', 'card-2'),
    createCard(7, 'clubs', 'card-3'),
    createCard(1, 'diamonds', 'card-4'),
  ]

  it('rebuilds the board from the dealt cards and real operators', () => {
    const tree = sanitizeSolutionTree(
      rawBinary(
        'add',
        rawBinary('add', rawCard(hand[0]!), rawCard(hand[1]!)),
        rawBinary('add', rawCard(hand[2]!), rawCard(hand[3]!))
      ),
      hand
    )

    expect(tree).not.toBeNull()
    const root = tree!
    expect(root.value).toBe(15)
    if (root.kind !== 'binary') throw new Error('expected a binary root')
    expect(root.headerText).toBe('7 + 8 = 15')
    expect(formatExpressionLhs(root)).toBe('4 + 3 + 7 + 1')

    const labels: string[] = []
    const visit = (node: ExprNode): void => {
      if (node.kind === 'card') {
        labels.push(node.card.label)
      } else if (node.kind === 'unary') {
        visit(node.operand)
      } else if (node.kind === 'bind') {
        for (const card of node.cards) visit(card)
      } else {
        visit(node.left)
        visit(node.right)
      }
    }
    visit(root)
    expect(labels.sort()).toEqual(['3', '4', '7', 'A'])
  })

  it('rejects boards that do not use every dealt card exactly once', () => {
    const pair = rawBinary('add', rawCard(hand[0]!), rawCard(hand[1]!))
    expect(sanitizeSolutionTree(pair, hand)).toBeNull()

    const duplicated = rawBinary(
      'add',
      rawCard(hand[0]!),
      rawBinary('add', rawCard(hand[0]!), rawBinary('add', rawCard(hand[1]!), rawCard(hand[2]!)))
    )
    expect(sanitizeSolutionTree(duplicated, hand)).toBeNull()
  })

  it('rejects unknown operators and malformed nodes', () => {
    const unknown = rawBinary('teleport', rawCard(hand[0]!), rawCard(hand[1]!))
    expect(sanitizeSolutionTree(unknown, hand)).toBeNull()
    expect(sanitizeSolutionTree({ kind: 'binary' }, hand)).toBeNull()
    expect(sanitizeSolutionTree(null, hand)).toBeNull()
  })

  it('accepts a genuine bind and rebuilds its product from the dealt cards', () => {
    const boundHand = [
      createCard(1, 'clubs', 'bind-1'),
      createCard(2, 'hearts', 'bind-2'),
      createCard(3, 'spades', 'bind-3'),
      createCard(4, 'diamonds', 'bind-4'),
    ]
    const tree = sanitizeSolutionTree(
      rawBind('dragon', boundHand),
      boundHand,
      dragonRules
    )

    expect(tree).not.toBeNull()
    if (tree!.kind !== 'bind') throw new Error('expected a bind root')
    expect(tree!.value).toBe(24)
    expect(tree!.headerText).toBe('1 × 2 × 3 × 4 = 24')
    expect(formatExpressionLhs(tree!)).toBe('1 × 2 × 3 × 4')
  })

  it('refuses to let a locked bind be split into loose cards', () => {
    const boundHand = [
      createCard(1, 'clubs', 'split-1'),
      createCard(2, 'hearts', 'split-2'),
      createCard(3, 'spades', 'split-3'),
      createCard(4, 'diamonds', 'split-4'),
    ]
    const loose = rawBinary(
      'add',
      rawBinary('add', rawCard(boundHand[0]!), rawCard(boundHand[1]!)),
      rawBinary('add', rawCard(boundHand[2]!), rawCard(boundHand[3]!))
    )
    expect(sanitizeSolutionTree(loose, boundHand, dragonRules)).toBeNull()
  })

  it('rejects made-up binds, wrong bind kinds and binds when the rule is off', () => {
    const boundHand = [
      createCard(1, 'clubs', 'fake-1'),
      createCard(2, 'hearts', 'fake-2'),
      createCard(3, 'spades', 'fake-3'),
      createCard(4, 'diamonds', 'fake-4'),
    ]
    // 1, 2 and 4 are not a consecutive run.
    expect(
      sanitizeSolutionTree(
        rawBind('dragon', [boundHand[0]!, boundHand[1]!, boundHand[3]!]),
        boundHand,
        dragonRules
      )
    ).toBeNull()
    // The same cards are a dragon, not a rook.
    expect(sanitizeSolutionTree(rawBind('rook', boundHand), boundHand, dragonRules)).toBeNull()
    // Default tables keep binds off.
    expect(sanitizeSolutionTree(rawBind('dragon', boundHand), boundHand)).toBeNull()
  })
})
