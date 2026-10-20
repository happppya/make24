import { OPERATOR_CATALOG, applyBinaryOperator, applyUnaryOperator } from '../engine/math'
import type { BinaryOperator, Card, ExprNode, UnaryOperator } from '../engine/types'

const MAX_NODES = 64
const MAX_DEPTH = 24

interface Budget {
  nodes: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function operatorFor(
  raw: unknown,
  arity: 'unary' | 'binary'
): UnaryOperator | BinaryOperator | null {
  const meta = OPERATOR_CATALOG.find((operator) => operator.id === raw && operator.arity === arity)
  return meta ? (meta.id as UnaryOperator | BinaryOperator) : null
}

/**
 * Rebuilds a submitted card board from the round's actual hand.
 *
 * The client sends the expression tree only so the table can show it as cards.
 * Every leaf is resolved against a dealt card (never the claimed label/art),
 * and every operator is re-applied to get canonical values and headers. The
 * result is null unless the tree is a well-formed, finite expression that uses
 * each dealt card exactly once.
 */
export function sanitizeSolutionTree(raw: unknown, hand: Card[]): ExprNode | null {
  const handById = new Map(hand.map((card) => [card.id, card]))
  const usedCards = new Set<string>()
  const budget: Budget = { nodes: 0 }
  const tree = build(raw, handById, usedCards, budget, 0)
  if (!tree || usedCards.size !== hand.length) return null
  return tree
}

function build(
  raw: unknown,
  handById: Map<string, Card>,
  usedCards: Set<string>,
  budget: Budget,
  depth: number
): ExprNode | null {
  if (!isRecord(raw) || depth > MAX_DEPTH || budget.nodes >= MAX_NODES) return null
  budget.nodes += 1

  if (raw.kind === 'card') {
    if (!isRecord(raw.card) || typeof raw.card.id !== 'string') return null
    const card = handById.get(raw.card.id)
    if (!card || usedCards.has(card.id)) return null
    usedCards.add(card.id)
    return {
      kind: 'card',
      id: `board-${card.id}`,
      card: { ...card },
      value: card.value,
    }
  }

  if (raw.kind === 'unary') {
    const operator = operatorFor(raw.operator, 'unary')
    if (!operator) return null
    const operand = build(raw.operand, handById, usedCards, budget, depth + 1)
    if (!operand) return null
    const result = applyUnaryOperator(operator as UnaryOperator, operand.value)
    if (!result.ok || !Number.isFinite(result.value)) return null
    return {
      kind: 'unary',
      id: `board-group-${budget.nodes}`,
      operator: operator as UnaryOperator,
      operand,
      value: result.value,
      headerText: result.headerText,
    }
  }

  if (raw.kind === 'binary') {
    const operator = operatorFor(raw.operator, 'binary')
    if (!operator) return null
    const left = build(raw.left, handById, usedCards, budget, depth + 1)
    const right = build(raw.right, handById, usedCards, budget, depth + 1)
    if (!left || !right) return null
    const result = applyBinaryOperator(operator as BinaryOperator, left.value, right.value)
    if (!result.ok || !Number.isFinite(result.value)) return null
    return {
      kind: 'binary',
      id: `board-group-${budget.nodes}`,
      operator: operator as BinaryOperator,
      left,
      right,
      value: result.value,
      headerText: result.headerText,
    }
  }

  return null
}
