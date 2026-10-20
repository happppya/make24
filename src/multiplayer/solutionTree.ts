import {
  bindExactValue,
  bindHeaderText,
  bindKey,
  createDefaultBindRules,
  findBindFormations,
  type BindFormation,
} from '../engine/binds'
import { decimalIsFinite, toDecimal } from '../engine/decimal'
import { OPERATOR_CATALOG, applyBinaryOperator, applyUnaryOperator } from '../engine/math'
import type {
  BinaryOperator,
  BindKind,
  BindRulesConfig,
  Card,
  CardLeafNode,
  ExprNode,
  UnaryOperator,
} from '../engine/types'

const MAX_NODES = 64
const MAX_DEPTH = 24

interface Budget {
  nodes: number
}

interface BindContext {
  expected: Map<string, BindFormation>
  used: Set<string>
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
export function sanitizeSolutionTree(
  raw: unknown,
  hand: Card[],
  bindRules: BindRulesConfig = createDefaultBindRules()
): ExprNode | null {
  const handById = new Map(hand.map((card) => [card.id, card]))
  const usedCards = new Set<string>()
  const budget: Budget = { nodes: 0 }
  const binds: BindContext = {
    expected: new Map(
      findBindFormations(hand, bindRules).map((formation) => [
        bindKey(formation.kind, formation.cards),
        formation,
      ])
    ),
    used: new Set(),
  }
  const tree = build(raw, handById, usedCards, budget, binds, 0)
  if (!tree || usedCards.size !== hand.length) return null
  // Bound cards are locked: every formation the deal created must survive as a
  // bind node, so a client cannot split one apart to dodge its product.
  if (binds.used.size !== binds.expected.size) return null
  return tree
}

function build(
  raw: unknown,
  handById: Map<string, Card>,
  usedCards: Set<string>,
  budget: Budget,
  binds: BindContext,
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
      exactValue: String(card.value),
    }
  }

  if (raw.kind === 'bind') {
    if (raw.bind !== 'dragon' && raw.bind !== 'rook') return null
    if (!Array.isArray(raw.cards) || raw.cards.length < 2 || raw.cards.length > 10) {
      return null
    }
    const cards: CardLeafNode[] = []
    const seen = new Set<string>()
    for (const rawCard of raw.cards) {
      if (!isRecord(rawCard) || rawCard.kind !== 'card' || !isRecord(rawCard.card)) return null
      if (typeof rawCard.card.id !== 'string') return null
      const card = handById.get(rawCard.card.id)
      if (!card || usedCards.has(card.id) || seen.has(card.id)) return null
      seen.add(card.id)
      usedCards.add(card.id)
      cards.push({
        kind: 'card',
        id: `board-${card.id}`,
        card: { ...card },
        value: card.value,
        exactValue: String(card.value),
      })
    }

    const kind = raw.bind as BindKind
    const key = bindKey(kind, cards.map((card) => card.card))
    if (!binds.expected.has(key) || binds.used.has(key)) return null
    binds.used.add(key)
    const exactValue = bindExactValue(cards.map((card) => card.card))
    return {
      kind: 'bind',
      id: `board-group-${budget.nodes}`,
      bind: kind,
      cards,
      value: Number(exactValue),
      exactValue,
      headerText: bindHeaderText(cards.map((card) => card.card), Number(exactValue)),
    }
  }

  if (raw.kind === 'unary') {
    const operator = operatorFor(raw.operator, 'unary')
    if (!operator) return null
    const operand = build(raw.operand, handById, usedCards, budget, binds, depth + 1)
    if (!operand) return null
    const result = applyUnaryOperator(
      operator as UnaryOperator,
      operand.exactValue ?? String(operand.value)
    )
    if (!result.ok || !decimalIsFinite(toDecimal(result.exactValue))) return null
    return {
      kind: 'unary',
      id: `board-group-${budget.nodes}`,
      operator: operator as UnaryOperator,
      operand,
      value: result.value,
      exactValue: result.exactValue,
      headerText: result.headerText,
    }
  }

  if (raw.kind === 'binary') {
    const operator = operatorFor(raw.operator, 'binary')
    if (!operator) return null
    const left = build(raw.left, handById, usedCards, budget, binds, depth + 1)
    const right = build(raw.right, handById, usedCards, budget, binds, depth + 1)
    if (!left || !right) return null
    const result = applyBinaryOperator(
      operator as BinaryOperator,
      left.exactValue ?? String(left.value),
      right.exactValue ?? String(right.value)
    )
    if (!result.ok || !decimalIsFinite(toDecimal(result.exactValue))) return null
    return {
      kind: 'binary',
      id: `board-group-${budget.nodes}`,
      operator: operator as BinaryOperator,
      left,
      right,
      value: result.value,
      exactValue: result.exactValue,
      headerText: result.headerText,
    }
  }

  return null
}
