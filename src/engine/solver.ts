import { applyBinaryOperator, calculateScore, checkTargetAcceptance, formatExpressionLhs, formatFullEquation } from './math'
import type { BinaryOperator, Card, ExprNode } from './types'

const BASIC_OPS: BinaryOperator[] = ['add', 'sub', 'mult', 'div']

/**
 * Finds up to `limit` valid solutions for a hand using enabled binary operators
 * (defaults to basic + powers if enabled) so that simulated multiplayer players
 * or the round-end summary can showcase valid equations.
 */
export function findSampleSolutions(
  hand: Card[],
  target: number,
  approximationPercent: number,
  allowedBinaryOps: BinaryOperator[] = BASIC_OPS,
  limit = 3
): Array<{ equation: string; lhs: string; finalValue: number; score: number; errorPercent: number }> {
  const ops = allowedBinaryOps.length > 0 ? allowedBinaryOps : BASIC_OPS
  const initialNodes: ExprNode[] = hand.map((card) => ({
    kind: 'card',
    id: `solve-${card.id}`,
    card,
    value: card.value,
  }))

  const results: Array<{
    equation: string
    lhs: string
    finalValue: number
    score: number
    errorPercent: number
  }> = []
  const seenLhs = new Set<string>()
  let steps = 0
  const maxSteps = 5500

  function search(nodes: ExprNode[]): void {
    if (results.length >= limit || steps > maxSteps) return
    steps++

    if (nodes.length === 1) {
      const root = nodes[0]!
      const check = checkTargetAcceptance(root.value, target, approximationPercent)
      if (check.acceptable) {
        const lhs = formatExpressionLhs(root)
        if (!seenLhs.has(lhs)) {
          seenLhs.add(lhs)
          results.push({
            equation: formatFullEquation(root),
            lhs,
            finalValue: root.value,
            score: calculateScore(root),
            errorPercent: check.errorPercent,
          })
        }
      }
      return
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        // Avoid duplicate commutative pairs when i > j
        const a = nodes[i]!
        const b = nodes[j]!
        const remaining: ExprNode[] = []
        for (let k = 0; k < nodes.length; k++) {
          if (k !== i && k !== j) remaining.push(nodes[k]!)
        }

        for (const op of ops) {
          if ((op === 'add' || op === 'mult') && i > j) continue
          const res = applyBinaryOperator(op, a.value, b.value)
          if (!res.ok) continue
          const combined: ExprNode = {
            kind: 'binary',
            id: `s-${steps}`,
            operator: op,
            left: a,
            right: b,
            value: res.value,
            headerText: res.headerText,
          }
          remaining.push(combined)
          search(remaining)
          remaining.pop()
          if (results.length >= limit || steps > maxSteps) return
        }
      }
    }
  }

  if (hand.length <= 5) {
    search(initialNodes)
  }

  results.sort((x, y) => x.score - y.score)
  return results
}
