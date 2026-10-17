import { describe, expect, it, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import {
  applyBinaryOperator,
  applyUnaryOperator,
  calculateScore,
  calculateScoreBreakdown,
  checkTargetAcceptance,
  costOfUnaryOn,
  formatExpressionLhs,
  formatFullEquation,
  realFactorial,
  realGamma,
  realInverseGamma,
} from './engine/math'
import { buildDeckPool, createCard, dealHand, generateTargetNumber } from './engine/deck'
import {
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARD_SPACING_X,
  DEFAULT_CARD_SPACING_Y,
  WORKSPACE_COUNT,
  applyOperatorInWorkspace,
  createAllWorkspaces,
  createWorkspace,
  evaluateWorkspaceSolution,
  getGroupPosition,
  redoWorkspace,
  resetGroupIdCounter,
  resetWorkspaceToHand,
  selectGroupInWorkspace,
  setGroupPosition,
  setWorkspacePan,
  tidyWorkspaceGroups,
  undoWorkspace,
  ungroupInWorkspace,
} from './engine/workspace'
import type { Card, ExprNode } from './engine/types'

describe('Make 24 Remastered — Math & Operators Engine', () => {
  it('evaluates basic binary operators and respects selection order for non-commutative ops', () => {
    expect(applyBinaryOperator('add', 4, 3)).toEqual({
      ok: true,
      value: 7,
      headerText: '4 + 3 = 7',
    })
    // Spec: selecting 3 then selecting 5 with subtraction results in 3 - 5
    expect(applyBinaryOperator('sub', 3, 5)).toEqual({
      ok: true,
      value: -2,
      headerText: '3 - 5 = -2',
    })
    expect(applyBinaryOperator('mult', 6, 4).value).toBe(24)
    expect(applyBinaryOperator('div', 12, 4).value).toBe(3)
    expect(applyBinaryOperator('div', 5, 0).ok).toBe(false)
  })

  it('evaluates powers and roots as binary operators', () => {
    const powRes = applyBinaryOperator('pow', 5, 3)
    expect(powRes.ok).toBe(true)
    expect(powRes.value).toBe(125)

    // 5 root 3 produces 5 ^ (1/3), 8 root 3 produces 2
    const rootRes = applyBinaryOperator('root', 8, 3)
    expect(rootRes.ok).toBe(true)
    expect(rootRes.value).toBe(2)

    const root5_3 = applyBinaryOperator('root', 5, 3)
    expect(root5_3.ok).toBe(true)
    expect(root5_3.value).toBeCloseTo(Math.pow(5, 1 / 3), 8)
  })

  it('evaluates real factorials and gamma via Lanczos approximation and blocks undefined poles', () => {
    expect(realFactorial(4)).toBe(24)
    expect(realGamma(5)).toBe(24)
    // 0.5! = Gamma(1.5) = 0.5 * sqrt(pi)
    expect(realFactorial(0.5)).toBeCloseTo(0.5 * Math.sqrt(Math.PI), 6)
    // Undefined at negative integers for factorial (-1, -2) and non-positive integers for gamma (0, -1)
    expect(realFactorial(-1)).toBeNull()
    expect(realGamma(0)).toBeNull()
    expect(realGamma(-2)).toBeNull()

    const fact4 = applyUnaryOperator('fact', 4)
    expect(fact4).toEqual({
      ok: true,
      value: 24,
      headerText: '4! = 24',
    })
  })

  it('inverts gamma on its principal branch and rejects values below its minimum', () => {
    // Γ(5) = 24, Γ(6) = 120, Γ(4) = 6, Γ(2) = Γ(1) = 1 (principal branch picks 2)
    expect(realInverseGamma(24)).toBe(5)
    expect(realInverseGamma(120)).toBe(6)
    expect(realInverseGamma(6)).toBe(4)
    expect(realInverseGamma(1)).toBe(2)
    expect(realGamma(realInverseGamma(20)!)).toBeCloseTo(20, 5)

    // Γ bottoms out at ≈0.8856, so anything at or below it — and any
    // non-positive input — has no solution on that branch
    expect(realInverseGamma(0.5)).toBeNull()
    expect(realInverseGamma(0)).toBeNull()
    expect(realInverseGamma(-2)).toBeNull()

    expect(applyUnaryOperator('invgamma', 24)).toEqual({
      ok: true,
      value: 5,
      headerText: 'Γ⁻¹(24) = 5',
    })
    expect(applyUnaryOperator('invgamma', 0.5).ok).toBe(false)
  })

  it('evaluates trig operators in degrees', () => {
    const sin90 = applyUnaryOperator('sin', 90)
    expect(sin90).toEqual({
      ok: true,
      value: 1,
      headerText: 'sin(90 deg) = 1',
    })
    expect(applyUnaryOperator('cos', 0).value).toBe(1)
    expect(applyUnaryOperator('cos', 60).value).toBeCloseTo(0.5, 7)
    expect(applyUnaryOperator('tan', 45).value).toBe(1)
    expect(applyUnaryOperator('tan', 90).ok).toBe(false)
  })

  it('evaluates inverse and bit-shifting operators', () => {
    const inv4 = applyUnaryOperator('inv', 4)
    expect(inv4.ok).toBe(true)
    expect(inv4.value).toBe(0.25)
    expect(applyUnaryOperator('inv', 0).ok).toBe(false)

    // Spec: LSHIFT(5,3) shifts the bits of 5 = 101 to the left by 3 slots = 40
    const lshiftRes = applyBinaryOperator('lshift', 5, 3)
    expect(lshiftRes).toEqual({
      ok: true,
      value: 40,
      headerText: 'LSHIFT(5, 3) = 40',
    })

    const rshiftRes = applyBinaryOperator('rshift', 40, 3)
    expect(rshiftRes.value).toBe(5)
    expect(applyBinaryOperator('lshift', 2.5, 1).ok).toBe(false)
  })

  it('checks target acceptance with inclusive approximation percent and 0 target edge case', () => {
    // Exact target 24 with 0% approximation
    expect(checkTargetAcceptance(24, 24, 0).acceptable).toBe(true)
    expect(checkTargetAcceptance(23.9, 24, 0).acceptable).toBe(false)

    // Spec: if field is 1 and target is 100, accepts any end value within 1% error of 100 (99..101 inclusive)
    const band99 = checkTargetAcceptance(99, 100, 1)
    expect(band99.acceptable).toBe(true)
    expect(band99.minAcceptable).toBe(99)
    expect(band99.maxAcceptable).toBe(101)
    expect(checkTargetAcceptance(101, 100, 1).acceptable).toBe(true)
    expect(checkTargetAcceptance(98.99, 100, 1).acceptable).toBe(false)

    // Spec: A target of 0 just has 0 tolerable error
    expect(checkTargetAcceptance(0, 0, 10).acceptable).toBe(true)
    expect(checkTargetAcceptance(0.01, 0, 10).acceptable).toBe(false)
  })
})

/** Unwraps a node the tests know is unary, without a cast in every assertion. */
function unaryOperandOf(node: ExprNode): ExprNode {
  if (node.kind !== 'unary') throw new Error('expected a unary node')
  return node.operand
}

describe('Make 24 Remastered — Scoring & Equation Formatting', () => {
  let sampleCards: Card[]

  beforeEach(() => {
    resetGroupIdCounter()
    sampleCards = [
      createCard(4, 'spades', 'c1'),
      createCard(3, 'hearts', 'c2'),
      createCard(7, 'clubs', 'c3'),
      createCard(1, 'diamonds', 'c4'),
    ]
  })

  it('computes binary and escalating unary scores and resets unary chain across binary ops', () => {
    const ws = createWorkspace(0, [sampleCards[0]!])
    const leafId = ws.groups[0]!.id

    // Select card 4
    selectGroupInWorkspace(ws, leafId)
    // Apply 1st unary: o(x) -> 10 pts
    applyOperatorInWorkspace(ws, 'sin')
    expect(calculateScore(ws.groups[0]!)).toBe(10)

    // Apply 2nd consecutive unary: o(o(x)) -> 10 + 20 = 30 pts
    applyOperatorInWorkspace(ws, 'cos')
    expect(calculateScore(ws.groups[0]!)).toBe(30)

    // Apply 3rd consecutive unary: o(o(o(x))) -> 10 + 20 + 30 = 60 pts
    applyOperatorInWorkspace(ws, 'tan')
    expect(calculateScore(ws.groups[0]!)).toBe(60)
  })

  it('adds 200-point penalty each time factorial and inverse gamma are nested together', () => {
    const ws = createWorkspace(0, [sampleCards[1]!]) // card 3
    selectGroupInWorkspace(ws, ws.groups[0]!.id)

    // Γ⁻¹(3) -> 1st unary = 10
    applyOperatorInWorkspace(ws, 'invgamma')
    expect(calculateScore(ws.groups[0]!)).toBe(10)

    // factorial(Γ⁻¹(3)) -> 2nd unary (20) + 200 nested penalty + 10 = 230
    applyOperatorInWorkspace(ws, 'fact')
    expect(calculateScore(ws.groups[0]!)).toBe(230)

    // Γ⁻¹(factorial(Γ⁻¹(3))) -> 3rd unary (30) + 200 nested penalty + 230 = 460
    applyOperatorInWorkspace(ws, 'invgamma')
    expect(calculateScore(ws.groups[0]!)).toBe(460)

    // Factorial and plain gamma together are merely consecutive unaries: 10 + 20
    const plain = createWorkspace(0, [sampleCards[1]!])
    selectGroupInWorkspace(plain, plain.groups[0]!.id)
    applyOperatorInWorkspace(plain, 'gamma')
    applyOperatorInWorkspace(plain, 'fact')
    expect(calculateScore(plain.groups[0]!)).toBe(30)
  })

  it('resets consecutive unary chain when combined with a binary operator', () => {
    const ws = createWorkspace(0, [sampleCards[0]!, sampleCards[1]!]) // 4, 3
    // Apply fact on 4 -> 10 pts
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'fact')
    expect(calculateScore(ws.groups[0]!)).toBe(10)

    // Combine (4!) + 3 -> binary costs 10 -> total 20
    applyOperatorInWorkspace(ws, 'add')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)
    expect(ws.groups.length).toBe(1)
    expect(calculateScore(ws.groups[0]!)).toBe(20)

    // Now apply unary on the binary result: since binary reset the chain, this outer unary is layer 1 (10 pts),
    // and the inner 4! after the binary reset is also layer 1 (10 pts) -> 10 (outer unary) + 10 (binary) + 10 (inner unary) = 30
    applyOperatorInWorkspace(ws, 'sin')
    expect(calculateScore(ws.groups[0]!)).toBe(30)
  })

  it('formats standard math equations with proper parentheses', () => {
    const ws = createWorkspace(0, [sampleCards[0]!, sampleCards[1]!, sampleCards[2]!]) // 4, 3, 7
    // Select 4, + 3 -> (4 + 3) = 7
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'add')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)

    // Multiply by 7 -> (4 + 3) * 7 = 49
    applyOperatorInWorkspace(ws, 'mult')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)

    const root = ws.groups[0]!
    expect(formatExpressionLhs(root)).toBe('(4 + 3) * 7')
    expect(formatFullEquation(root)).toBe('(4 + 3) * 7 = 49')
  })

  it('itemises the cost of consecutive unary operators', () => {
    const ws = createWorkspace(0, [sampleCards[0]!])
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'sin')
    applyOperatorInWorkspace(ws, 'cos')
    applyOperatorInWorkspace(ws, 'tan')

    const root = ws.groups[0]!
    expect(calculateScoreBreakdown(root)).toEqual({
      total: 60,
      binaryOperators: 0,
      binaryCost: 0,
      unaryOperators: 3,
      unaryCost: 60,
      nestingCount: 0,
      nestingCost: 0,
    })
    expect(calculateScoreBreakdown(root).total).toBe(calculateScore(root))
  })

  it('reports what the next unary operator actually adds to the score', () => {
    const ws = createWorkspace(0, [sampleCards[0]!])
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    const empty = calculateScore(ws.groups[0]!)

    // First unary: a fresh layer one costs 10
    applyOperatorInWorkspace(ws, 'sin')
    const firstNode = ws.groups[0]!
    const afterFirst = calculateScore(firstNode)
    expect(costOfUnaryOn('sin', unaryOperandOf(firstNode))).toBe(afterFirst - empty)
    expect(costOfUnaryOn('sin', unaryOperandOf(firstNode))).toBe(10)

    // Second stacked unary: it is the new layer one and pushes the first down,
    // so the board jumps by 20 rather than 10
    applyOperatorInWorkspace(ws, 'cos')
    const secondNode = ws.groups[0]!
    expect(costOfUnaryOn('cos', unaryOperandOf(secondNode))).toBe(
      calculateScore(secondNode) - afterFirst
    )
    expect(costOfUnaryOn('cos', unaryOperandOf(secondNode))).toBe(20)

    // A binary op resets the chain, so the unary above it is layer one again
    const pair = createWorkspace(0, [sampleCards[0]!, sampleCards[1]!])
    selectGroupInWorkspace(pair, pair.groups[0]!.id)
    applyOperatorInWorkspace(pair, 'add')
    selectGroupInWorkspace(pair, pair.groups[1]!.id)
    const merged = calculateScore(pair.groups[0]!)
    applyOperatorInWorkspace(pair, 'fact')
    const wrapped = pair.groups[0]!
    expect(costOfUnaryOn('fact', unaryOperandOf(wrapped))).toBe(
      calculateScore(wrapped) - merged
    )
    expect(costOfUnaryOn('fact', unaryOperandOf(wrapped))).toBe(10)
  })

  it('folds the 200-point pairing into the cost of the operator that creates it', () => {
    const ws = createWorkspace(0, [sampleCards[1]!]) // card 3
    selectGroupInWorkspace(ws, ws.groups[0]!.id)

    applyOperatorInWorkspace(ws, 'invgamma')
    const baseScore = calculateScore(ws.groups[0]!)
    applyOperatorInWorkspace(ws, 'fact')
    const nested = ws.groups[0]!

    expect(costOfUnaryOn('fact', unaryOperandOf(nested))).toBe(
      calculateScore(nested) - baseScore
    )
    expect(costOfUnaryOn('fact', unaryOperandOf(nested))).toBe(220)

    // Reversing the pair costs the same, and plain gamma carries no penalty
    const reverse = createWorkspace(0, [sampleCards[1]!])
    selectGroupInWorkspace(reverse, reverse.groups[0]!.id)
    applyOperatorInWorkspace(reverse, 'fact')
    const beforeReverse = calculateScore(reverse.groups[0]!)
    applyOperatorInWorkspace(reverse, 'invgamma')
    const reversed = reverse.groups[0]!
    expect(costOfUnaryOn('invgamma', unaryOperandOf(reversed))).toBe(
      calculateScore(reversed) - beforeReverse
    )
    expect(costOfUnaryOn('invgamma', unaryOperandOf(reversed))).toBe(220)

    const plain = createWorkspace(0, [sampleCards[1]!])
    selectGroupInWorkspace(plain, plain.groups[0]!.id)
    applyOperatorInWorkspace(plain, 'fact')
    // Stacking plain gamma on that factorial is a mere layer two, no pairing
    const factorialNode = plain.groups[0]!
    const factorialScore = calculateScore(factorialNode)
    applyOperatorInWorkspace(plain, 'gamma')
    expect(costOfUnaryOn('gamma', factorialNode)).toBe(
      calculateScore(plain.groups[0]!) - factorialScore
    )
    expect(costOfUnaryOn('gamma', factorialNode)).toBe(20)
  })

  it('separates the nested factorial/inverse-gamma penalty from the unary layers', () => {
    const ws = createWorkspace(0, [sampleCards[1]!]) // card 3
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'invgamma') // Γ⁻¹(3) -> 10
    applyOperatorInWorkspace(ws, 'fact') // + 20 layer + 200 nested pair
    applyOperatorInWorkspace(ws, 'invgamma') // + 30 layer + 200 nested pair

    const root = ws.groups[0]!
    expect(calculateScoreBreakdown(root)).toEqual({
      total: 460,
      binaryOperators: 0,
      binaryCost: 0,
      unaryOperators: 3,
      unaryCost: 60,
      nestingCount: 2,
      nestingCost: 400,
    })
    expect(calculateScoreBreakdown(root).total).toBe(calculateScore(root))
  })

  it('counts each binary operator separately from the unary layers around it', () => {
    const ws = createWorkspace(0, [sampleCards[0]!, sampleCards[1]!, sampleCards[2]!]) // 4, 3, 7
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'fact') // 4! -> layer 1
    applyOperatorInWorkspace(ws, 'add') // binary, resets the chain
    selectGroupInWorkspace(ws, ws.groups[1]!.id)
    applyOperatorInWorkspace(ws, 'sin') // outer unary -> layer 1
    applyOperatorInWorkspace(ws, 'mult')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)

    const root = ws.groups[0]!
    expect(calculateScoreBreakdown(root)).toEqual({
      total: 40,
      binaryOperators: 2,
      binaryCost: 20,
      unaryOperators: 2,
      unaryCost: 20,
      nestingCount: 0,
      nestingCost: 0,
    })
    expect(calculateScoreBreakdown(root).total).toBe(calculateScore(root))
  })
})

describe('Make 24 Remastered — Deck Pool, 5 Workspaces & Undo/Redo', () => {
  it('builds deck pools for 1, 2, 3 decks and assigns J=11, Q=12, K=13, A=1', () => {
    expect(buildDeckPool('1-deck').length).toBe(52)
    expect(buildDeckPool('2-decks').length).toBe(104)
    expect(buildDeckPool('3-decks').length).toBe(156)

    const ace = createCard(1, 'spades', 'a')
    const jack = createCard(11, 'hearts', 'j')
    const queen = createCard(12, 'diamonds', 'q')
    const king = createCard(13, 'clubs', 'k')
    expect(ace.value).toBe(1)
    expect(jack.value).toBe(11)
    expect(queen.value).toBe(12)
    expect(king.value).toBe(13)

    const dealt = dealHand(4, '1-deck')
    expect(dealt.length).toBe(4)
  })

  it('generates targets according to preset settings', () => {
    expect(
      generateTargetNumber({
        targetPreset: 'just-24',
        customMin: 1,
        customMax: 50,
        manualTarget: 99,
      })
    ).toBe(24)

    const small = generateTargetNumber(
      {
        targetPreset: 'small',
        customMin: 1,
        customMax: 50,
        manualTarget: 99,
      },
      () => 0.5
    )
    expect(small).toBeGreaterThanOrEqual(1)
    expect(small).toBeLessThanOrEqual(100)

    expect(
      generateTargetNumber({
        targetPreset: 'manual',
        customMin: 1,
        customMax: 50,
        manualTarget: 360,
      })
    ).toBe(360)
  })

  it('maintains 5 independent workspaces and supports full z/y undo and redo', () => {
    const hand = [
      createCard(8, 'spades', 'c1'),
      createCard(3, 'hearts', 'c2'),
      createCard(1, 'clubs', 'c3'),
      createCard(1, 'diamonds', 'c4'),
    ]
    const workspaces = createAllWorkspaces(hand)
    expect(workspaces.length).toBe(WORKSPACE_COUNT)

    const ws0 = workspaces[0]!
    const ws1 = workspaces[1]!

    // Mutate workspace 0: 8 * 3 = 24, then + 1 = 25, then - 1 = 24
    selectGroupInWorkspace(ws0, ws0.groups[0]!.id)
    applyOperatorInWorkspace(ws0, 'mult')
    selectGroupInWorkspace(ws0, ws0.groups[1]!.id)
    expect(ws0.groups.length).toBe(3)
    expect(ws0.groups[0]!.value).toBe(24)

    // Workspace 1 remains untouched with 4 cards
    expect(ws1.groups.length).toBe(4)

    // Undo in workspace 0 restores 4 groups
    expect(undoWorkspace(ws0)).toBe(true)
    expect(ws0.groups.length).toBe(4)

    // Redo in workspace 0 re-applies the 8 * 3 = 24 stack
    expect(redoWorkspace(ws0)).toBe(true)
    expect(ws0.groups.length).toBe(3)
    expect(ws0.groups[0]!.value).toBe(24)

    // Finish combining all cards in ws0
    applyOperatorInWorkspace(ws0, 'add')
    selectGroupInWorkspace(ws0, ws0.groups[1]!.id)
    applyOperatorInWorkspace(ws0, 'sub')
    selectGroupInWorkspace(ws0, ws0.groups[1]!.id)

    const evalRes = evaluateWorkspaceSolution(ws0, 24, 0)
    expect(evalRes.isSingleGroup).toBe(true)
    expect(evalRes.acceptable).toBe(true)
    expect(evalRes.finalValue).toBe(24)
    expect(evalRes.score).toBe(30) // 3 binary ops * 10

    // Reset workspace back to dealt hand
    expect(resetWorkspaceToHand(ws0, hand)).toBe(true)
    expect(ws0.groups.length).toBe(4)
  })

  it('supports ungrouping binary and unary groups and tracks group positions & pan state', () => {
    const hand = [
      createCard(6, 'spades', 'c1'),
      createCard(4, 'hearts', 'c2'),
      createCard(2, 'clubs', 'c3'),
    ]
    const ws = createWorkspace(0, hand)
    const id0 = ws.groups[0]!.id
    const id1 = ws.groups[1]!.id

    // Drag card 0 to a custom position and pan workspace
    setGroupPosition(ws, id0, 310, 225)
    setWorkspacePan(ws, -45, 60)
    expect(getGroupPosition(ws, id0)).toEqual({ x: 310, y: 225 })
    expect(ws.panX).toBe(-45)
    expect(ws.panY).toBe(60)

    // Cannot ungroup a single leaf card
    selectGroupInWorkspace(ws, id0)
    expect(ungroupInWorkspace(ws).changed).toBe(false)

    // Combine card 0 (6) and card 1 (4) with addition -> binary group (6 + 4 = 10)
    applyOperatorInWorkspace(ws, 'add')
    selectGroupInWorkspace(ws, id1)
    expect(ws.groups.length).toBe(2)
    const binaryGroupId = ws.groups[0]!.id
    expect(ws.groups[0]!.kind).toBe('binary')

    // Apply unary factorial on the binary group -> unary group (10!)
    applyOperatorInWorkspace(ws, 'fact')
    expect(ws.groups[0]!.kind).toBe('unary')

    // First ungroup unwraps the unary operator back to the binary group (6 + 4 = 10)
    const ungroupUnaryRes = ungroupInWorkspace(ws)
    expect(ungroupUnaryRes.changed).toBe(true)
    expect(ws.groups.length).toBe(2)
    expect(ws.groups[0]!.id).toBe(binaryGroupId)
    expect(ws.groups[0]!.kind).toBe('binary')

    // Second ungroup splits the binary group back into the two original cards (6 and 4)
    const ungroupBinaryRes = ungroupInWorkspace(ws)
    expect(ungroupBinaryRes.changed).toBe(true)
    expect(ws.groups.length).toBe(3)
    expect(ws.groups[0]!.id).toBe(id0)
    expect(ws.groups[1]!.id).toBe(id1)

    // Regression: split halves must land on visibly different spots. Identical
    // coordinates previously made ungrouped cards look like they had vanished.
    const leftPos = getGroupPosition(ws, id0, 0)
    const rightPos = getGroupPosition(ws, id1, 1)
    expect(leftPos).not.toEqual(rightPos)
    expect(rightPos.x - leftPos.x).toBeGreaterThan(80)
    expect(Math.abs(rightPos.y - leftPos.y)).toBeGreaterThan(0)
  })

  it('deals six cards per row and wraps the rest onto a centred second row', () => {
    const hand = Array.from({ length: 10 }, (_, i) => createCard(2, 'spades', `wrap-${i}`))
    const ws = createWorkspace(0, hand)
    const spots = ws.groups.map((group) => getGroupPosition(ws, group.id))
    const firstRow = spots.slice(0, DEFAULT_CARDS_PER_ROW)
    const secondRow = spots.slice(DEFAULT_CARDS_PER_ROW)

    // Row one holds exactly six cards on one baseline, at the usual spacing
    expect(firstRow).toHaveLength(6)
    expect(new Set(firstRow.map((p) => p.y)).size).toBe(1)
    expect(firstRow[5]!.x - firstRow[0]!.x).toBe(DEFAULT_CARD_SPACING_X * 5)

    // The overflow forms a shorter second row below it
    expect(secondRow).toHaveLength(4)
    expect(new Set(secondRow.map((p) => p.y)).size).toBe(1)
    expect(secondRow[0]!.y).toBeGreaterThan(firstRow[0]!.y)

    // Both rows are horizontally centred on the same axis
    const firstCentre = (firstRow[0]!.x + firstRow[5]!.x) / 2
    const secondCentre = (secondRow[0]!.x + secondRow[3]!.x) / 2
    expect(Math.abs(firstCentre - secondCentre)).toBeLessThan(1)

    // A single overflow card sits on that centre line too, not pushed to the left
    const seven = createWorkspace(0, hand.slice(0, 7))
    const overflow = getGroupPosition(seven, seven.groups[6]!.id)
    expect(Math.abs(overflow.x - firstCentre)).toBeLessThan(1)
    expect(overflow.y).toBe(secondRow[0]!.y)
  })

  it('tidies scattered groups into an even grid centred on the workspace origin', () => {
    const hand = Array.from({ length: 4 }, (_, i) => createCard(5, 'hearts', `tidy-${i}`))
    const ws = createWorkspace(0, hand)
    const ids = ws.groups.map((group) => group.id)

    // Scatter everything far from home first (and leave a stale entry behind)
    ids.forEach((id, i) => setGroupPosition(ws, id, 900 + i * 700, -400 + i * 300))
    ws.positions['leaf-gone'] = { x: 5000, y: 5000 }

    expect(tidyWorkspaceGroups(ws, { columns: 4 })).toBe(true)

    const block = (4 - 1) * DEFAULT_CARD_SPACING_X
    ids.forEach((id, i) => {
      const pos = getGroupPosition(ws, id)
      expect(pos.x).toBe(Math.round((i * DEFAULT_CARD_SPACING_X) - block / 2))
      expect(pos.y).toBe(0) // a single row sits on the origin line
    })

    // One tidy row is symmetric about the origin, and stale ids are dropped
    expect(getGroupPosition(ws, ids[0]!).x).toBe(-getGroupPosition(ws, ids[3]!).x)
    expect(ws.positions['leaf-gone']).toBeUndefined()
  })

  it('wraps a tidied board onto further rows and centres each of them', () => {
    const hand = Array.from({ length: 4 }, (_, i) => createCard(6, 'clubs', `wrap-tidy-${i}`))
    const ws = createWorkspace(0, hand)
    const ids = ws.groups.map((group) => group.id)

    expect(tidyWorkspaceGroups(ws, { columns: 3 })).toBe(true)

    const expected = [
      { x: -DEFAULT_CARD_SPACING_X, y: -DEFAULT_CARD_SPACING_Y / 2 },
      { x: 0, y: -DEFAULT_CARD_SPACING_Y / 2 },
      { x: DEFAULT_CARD_SPACING_X, y: -DEFAULT_CARD_SPACING_Y / 2 },
      { x: -DEFAULT_CARD_SPACING_X, y: DEFAULT_CARD_SPACING_Y / 2 },
    ]
    ids.forEach((id, i) => {
      const pos = getGroupPosition(ws, id)
      expect(pos.x).toBe(Math.round(expected[i]!.x))
      expect(pos.y).toBe(Math.round(expected[i]!.y))
    })
  })

  it('does nothing when the board is already tidy, and undoes back to the scattered layout', () => {
    const hand = Array.from({ length: 4 }, (_, i) => createCard(7, 'spades', `undo-tidy-${i}`))
    const ws = createWorkspace(0, hand)
    const ids = ws.groups.map((group) => group.id)
    ids.forEach((id, i) => setGroupPosition(ws, id, 40 + i * 60, -20 * i))
    const scattered = ids.map((id) => ({ ...getGroupPosition(ws, id) }))

    expect(tidyWorkspaceGroups(ws, { columns: 2 })).toBe(true)
    const undoDepth = ws.undoStack.length

    // Second pass is a no-op: no movement, no extra history entry
    expect(tidyWorkspaceGroups(ws, { columns: 2 })).toBe(false)
    expect(ws.undoStack.length).toBe(undoDepth)

    expect(undoWorkspace(ws)).toBe(true)
    ids.forEach((id, i) => {
      expect(getGroupPosition(ws, id)).toEqual(scattered[i])
    })
  })
})

describe('Make 24 Remastered — Playable UI Flow (App.vue)', () => {
  it('navigates from Title -> Lobby -> Live Gameplay -> card stacking -> Round End', async () => {
    const wrapper = mount(App)

    // Title screen renders Singleplayer & Multiplayer buttons
    const spBtn = wrapper.find('[data-testid="enter-singleplayer"]')
    expect(spBtn.exists()).toBe(true)
    await spBtn.trigger('click')

    // Lobby screen renders settings and start match CTA
    const startBtn = wrapper.find('[data-testid="start-round-btn"]')
    expect(startBtn.exists()).toBe(true)
    await startBtn.trigger('click')

    // Live gameplay renders 5 workspace tabs and 4 dealt cards
    expect(wrapper.find('[data-testid="workspace-tab-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="workspace-tab-5"]').exists()).toBe(true)

    const rootGroups = wrapper.findAll('.expr-node--root')
    expect(rootGroups.length).toBe(4)

    // Select first card, apply unary factorial, verify group header appears
    await rootGroups[0]!.trigger('click')
    const factBtn = wrapper.find('[data-testid="op-fact"]')
    expect(factBtn.exists()).toBe(true)
    await factBtn.trigger('click')

    expect(wrapper.find('.group-header-eq').exists()).toBe(true)

    // Press Undo button to revert unary operator (card 0 remains selected from before the unary op)
    await wrapper.find('[data-testid="undo-btn"]').trigger('click')
    expect(wrapper.find('.group-header-eq').exists()).toBe(false)

    // Combine first two cards with addition (card 0 is already selected)
    await wrapper.find('[data-testid="op-add"]').trigger('click')
    expect(wrapper.find('[data-testid="pending-operator-banner"]').exists()).toBe(true)
    const groupsAfterUndo = wrapper.findAll('.expr-node--root')
    await groupsAfterUndo[1]!.trigger('click')

    // Now 3 groups remain on the board in workspace 1
    expect(wrapper.findAll('.expr-node--root').length).toBe(3)

    // Clicking a nested leaf card inside the merged group selects/toggles the root merged group
    const nestedLeafCards = wrapper.findAll('.expr-node--root')[0]!.findAll('.playing-card')
    expect(nestedLeafCards.length).toBe(2)
    // Click nested card to deselect merged group
    await nestedLeafCards[0]!.trigger('click')
    expect(wrapper.findAll('.expr-node--selected').length).toBe(0)
    // Click nested card again to re-select the merged group!
    await nestedLeafCards[1]!.trigger('click')
    expect(wrapper.findAll('.expr-node--selected').length).toBe(1)

    // Ungroup the selected merged group via the Ungroup button and verify 4 cards return
    const ungroupBtn = wrapper.find('[data-testid="ungroup-btn"]')
    expect(ungroupBtn.attributes('disabled')).toBeUndefined()
    await ungroupBtn.trigger('click')
    expect(wrapper.findAll('.expr-node--root').length).toBe(4)

    // Switch to Workspace 2 and verify it still has all 4 untouched cards
    await wrapper.find('[data-testid="workspace-tab-2"]').trigger('click')
    expect(wrapper.findAll('.expr-node--root').length).toBe(4)

    // Finish round and verify transition to Round End screen
    await wrapper.find('[data-testid="finish-round-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="next-round-btn"]').exists()).toBe(true)
  })

  it('selects a board group from the keyboard, not only the pointer', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    const roots = wrapper.findAll('.expr-node--root')
    expect(roots.length).toBeGreaterThan(0)
    // Each piece on the board is a focusable control so the game can be played
    // without a mouse: tab to a card, Enter to pick it up.
    expect(roots[0]!.attributes('role')).toBe('button')
    expect(roots[0]!.attributes('tabindex')).toBe('0')

    await roots[0]!.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(wrapper.findAll('.expr-node--selected').length).toBe(1)
    expect(roots[0]!.attributes('aria-pressed')).toBe('true')

    // Space toggles it back off, like a click on the already-selected piece.
    await roots[0]!.trigger('keydown', { key: ' ' })
    await nextTick()
    expect(wrapper.findAll('.expr-node--selected').length).toBe(0)

    wrapper.unmount()
  })

  it('applies operators from the digit hotkeys (1–0 binary, Shift+1–0 unary)', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    await wrapper.findAll('.expr-node--root')[0]!.trigger('click')

    // Shift+1 -> first unary operator (factorial) wraps the selected card
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true })
    )
    await nextTick()
    expect(wrapper.find('.group-header-eq').exists()).toBe(true)

    // Undo, then plain 1 -> first binary operator (add) waits for a right operand
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ' }))
    await nextTick()
    expect(wrapper.find('.group-header-eq').exists()).toBe(false)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1' }))
    await nextTick()
    expect(wrapper.find('[data-testid="pending-operator-banner"]').exists()).toBe(true)

    // Buttons advertise the same bindings: 1–6 binary, ⇧1–2 unary by default
    const binaryKeys = wrapper.findAll('.btn-op:not(.btn-op--unary) .op-key').map((n) => n.text())
    const unaryKeys = wrapper.findAll('.btn-op--unary .op-key').map((n) => n.text())
    expect(binaryKeys).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(unaryKeys).toEqual(['⇧1', '⇧2', '⇧3'])

    wrapper.unmount()
  })

  it('opens the player guide from the title screen', async () => {
    const wrapper = mount(App)
    const trigger = wrapper.find('[data-testid="open-tutorial"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text().toLowerCase()).toContain('tutorial')

    await trigger.trigger('click')

    const overlay = wrapper.find('[data-testid="tutorial-overlay"]')
    expect(overlay.exists()).toBe(true)
    expect(overlay.find('[role="dialog"]').exists()).toBe(true)
    // The title screen is inert underneath, so focus cannot wander behind the guide.
    expect(wrapper.find('.screen-title').attributes('inert')).toBeDefined()

    // Every mechanic gets a section, and the index names them all.
    const sections = wrapper.findAll('[data-testid="tutorial-scroll"] section')
    expect(sections.map((s) => s.attributes('data-section'))).toEqual([
      'target',
      'expression',
      'board',
      'workspaces',
      'cost',
      'rules',
      'keys',
    ])
    expect(wrapper.findAll('[data-testid="tutorial-scroll"] .rail-link')).toHaveLength(0)
    expect(wrapper.findAll('.rail-link')).toHaveLength(7)

    // Each screenshot carries alt text and one legend entry per numbered pin.
    const figures = wrapper.findAll('[data-testid="tutorial-scroll"] figure')
    expect(figures).toHaveLength(3)
    for (const figure of figures) {
      const img = figure.find('img')
      expect(img.attributes('src')).toMatch(/^\/tutorial\/[a-z-]+\.png$/)
      expect((img.attributes('alt') ?? '').length).toBeGreaterThan(40)
      const pins = figure.findAll('.shot__pin')
      expect(pins.length).toBeGreaterThan(0)
      expect(figure.findAll('.shot__legend-item')).toHaveLength(pins.length)
      // Pins are placed by percentage, so they survive any display width.
      pins.forEach((pin) => {
        expect(pin.attributes('style')).toMatch(/left: [\d.]+%; top: [\d.]+%/)
      })
    }

    // The index jumps between sections without leaving the guide.
    await wrapper.find('[data-testid="tutorial-nav-keys"]').trigger('click')
    expect(wrapper.find('[data-testid="tutorial-nav-keys"]').attributes('aria-current')).toBe('true')
    expect(wrapper.find('[data-testid="tutorial-overlay"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('closes the guide with Esc or its close button and restores focus', async () => {
    // Focus only moves inside a document, so this test needs a mounted tree.
    const wrapper = mount(App, { attachTo: document.body })
    const trigger = wrapper.find('[data-testid="open-tutorial"]')

    await trigger.trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('[data-testid="tutorial-close"]').element)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }))
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="tutorial-overlay"]').exists()).toBe(false)
    // Focus only lands back on the trigger if the title screen is live again.
    expect(document.activeElement).toBe(trigger.element)

    // The close button does the same after reopening.
    await trigger.trigger('click')
    await wrapper.find('[data-testid="tutorial-close"]').trigger('click')
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="tutorial-overlay"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)

    wrapper.unmount()
  })
})

