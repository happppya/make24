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
})
