import { describe, expect, it, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

// jsdom's WebSocket shim cannot carry the table server's frames (its Event class
// clashes with undici's), so the selector tests stay offline: the browser is
// asserted from rendered state, and the socket paths are covered by the
// node-environment transport tests.
vi.mock('./multiplayer/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./multiplayer/session')>()
  return { ...actual, openLobbyBrowser: vi.fn(async () => {}) }
})
import App from './App.vue'
import ScorePanel from './components/ScorePanel.vue'
import {
  accuracyPenaltyFor,
  applyBinaryOperator,
  applyUnaryOperator,
  OPERATOR_CATALOG,
  calculateBoardBreakdown,
  calculateScore,
  calculateScoreBreakdown,
  checkTargetAcceptance,
  cleanFloat,
  costOfBinaryOn,
  costOfUnaryOn,
  formatExpressionLhs,
  formatFullEquation,
  formatNumber,
  getEnabledOperators,
  realFactorial,
  realGamma,
  realInverseGamma,
} from './engine/math'
import { buildDeckPool, createCard, dealHand, generateTargetNumber } from './engine/deck'
import {
  CONSTANT_CATALOG,
  constantById,
  constantByValue,
} from './engine/constants'
import {
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARD_SLOT_HEIGHT,
  DEFAULT_CARD_SLOT_WIDTH,
  DEFAULT_CARD_SPACING_X,
  DEFAULT_CARD_SPACING_Y,
  WORKSPACE_COUNT,
  applyOperatorInWorkspace,
  createAllWorkspaces,
  createWorkspace,
  evaluateWorkspaceSolution,
  getGroupPosition,
  getGroupStackRank,
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
import { fittedFontSize, formatPercent, formatScore, opKeyLabel } from './app/labels'
import { PARTICLE_BURST_COUNTS } from './app/particles'
import { createDefaultSettings } from './multiplayer/room'
import { leaveRoom, multiplayer as multiplayerSession } from './multiplayer/session'
import type { LobbyPlayer, RoomState } from './multiplayer/protocol'

describe('Make 24 Remastered — Math & Operators Engine', () => {
  it('evaluates basic binary operators and respects selection order for non-commutative ops', () => {
    expect(applyBinaryOperator('add', 4, 3)).toEqual({
      ok: true,
      value: 7,
      exactValue: '7',
      headerText: '4 + 3 = 7',
    })
    // Spec: selecting 3 then selecting 5 with subtraction results in 3 - 5
    expect(applyBinaryOperator('sub', 3, 5)).toEqual({
      ok: true,
      value: -2,
      exactValue: '-2',
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
      exactValue: '24',
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
      exactValue: '5',
      headerText: 'Γ⁻¹(24) = 5',
    })
    expect(applyUnaryOperator('invgamma', 0.5).ok).toBe(false)
  })

  it('evaluates trig operators in degrees', () => {
    const sin90 = applyUnaryOperator('sin', 90)
    expect(sin90).toEqual({
      ok: true,
      value: 1,
      exactValue: '1',
      headerText: 'sin(90 deg) = 1',
    })
    expect(applyUnaryOperator('cos', 0).value).toBe(1)
    expect(applyUnaryOperator('cos', 60).value).toBeCloseTo(0.5, 7)
    expect(applyUnaryOperator('tan', 45).value).toBe(1)
    expect(applyUnaryOperator('tan', 90).ok).toBe(false)
  })

  it('evaluates inverse and binary-computing operators', () => {
    const inv4 = applyUnaryOperator('inv', 4)
    expect(inv4.ok).toBe(true)
    expect(inv4.value).toBe(0.25)
    expect(applyUnaryOperator('inv', 0).ok).toBe(false)

    // Spec: LSHIFT(5,3) shifts the bits of 5 = 101 to the left by 3 slots = 40
    const lshiftRes = applyBinaryOperator('lshift', 5, 3)
    expect(lshiftRes).toEqual({
      ok: true,
      value: 40,
      exactValue: '40',
      headerText: 'LSHIFT(5, 3) = 40',
    })
    expect(applyBinaryOperator('lshift', 2.5, 1).ok).toBe(false)

    // Bitwise operators use two's-complement whole numbers.
    expect(applyBinaryOperator('bitand', 12, 10)).toEqual({
      ok: true,
      value: 8,
      exactValue: '8',
      headerText: 'AND(12, 10) = 8',
    })
    expect(applyBinaryOperator('bitor', 12, 10).value).toBe(14)
    expect(applyBinaryOperator('bitxor', 12, 10).value).toBe(6)
    expect(applyBinaryOperator('bitand', -1, 6).value).toBe(6)
    expect(applyBinaryOperator('bitxor', -1, 5).value).toBe(-6)
    for (const op of ['bitand', 'bitor', 'bitxor'] as const) {
      expect(applyBinaryOperator(op, 2.5, 1).ok).toBe(false)
      expect(applyBinaryOperator(op, 1, 2.5).ok).toBe(false)
    }

    expect(applyUnaryOperator('bitnot', 5)).toEqual({
      ok: true,
      value: -6,
      exactValue: '-6',
      headerText: 'NOT(5) = -6',
    })
    expect(applyUnaryOperator('bitnot', -1).value).toBe(0)
    expect(applyUnaryOperator('bitnot', 1.5).ok).toBe(false)
  })

  it('concatenates digits in selection order', () => {
    expect(applyBinaryOperator('concat', 6, 10)).toEqual({
      ok: true,
      value: 610,
      exactValue: '610',
      headerText: '6 || 10 = 610',
    })
    // Order matters: the first selection is the left operand.
    expect(applyBinaryOperator('concat', 10, 6).value).toBe(106)
    expect(applyBinaryOperator('concat', 0, 5).value).toBe(5)
    expect(applyBinaryOperator('concat', 5, 0).value).toBe(50)
  })

  it('refuses concatenations that are not exact, non-negative whole numbers', () => {
    const rejected: Array<[number, number]> = [
      [6.5, 10],
      [-6, 10],
      [6, -10],
      [1e21, 2],
      [999999999, 999999999],
    ]
    for (const [a, b] of rejected) {
      const res = applyBinaryOperator('concat', a, b)
      expect(res.ok).toBe(false)
      expect(res.error).toBeTruthy()
    }
  })

  it('keeps concat behind its own operator group', () => {
    const allOff = {
      basic: false,
      powers: false,
      factorial: false,
      trig: false,
      inverse: false,
      computing: false,
      concat: false,
      analysis: false,
      combinatorics: false,
      operators: {},
    }
    expect(getEnabledOperators(allOff)).toHaveLength(0)
    expect(getEnabledOperators({ ...allOff, concat: true }).map((op) => op.id)).toEqual(['concat'])
    expect(getEnabledOperators({ ...allOff, basic: true, concat: true }).map((op) => op.id)).toEqual([
      'add',
      'sub',
      'mult',
      'div',
      'concat',
    ])
  })

  it('evaluates analysis operators and rejects their undefined domains', () => {
    const exp = applyUnaryOperator('exp', 2)
    expect(exp.ok).toBe(true)
    expect(exp.value).toBeCloseTo(Math.E ** 2, 12)
    expect(exp.headerText).toBe(`e^(2) = ${formatNumber(Math.E ** 2)}`)
    expect(applyUnaryOperator('exp', 1000).ok).toBe(false)

    expect(applyUnaryOperator('ln', Math.E).value).toBeCloseTo(1, 12)
    expect(applyUnaryOperator('ln', 0).ok).toBe(false)
    expect(applyUnaryOperator('ln', -1).ok).toBe(false)

    const log = applyBinaryOperator('log', 2, 8)
    expect(log.ok).toBe(true)
    expect(log.value).toBeCloseTo(3, 12)
    expect(log.headerText).toBe('log(2, 8) = 3')
    expect(applyBinaryOperator('log', 10, 1000).value).toBeCloseTo(3, 12)
    expect(applyBinaryOperator('log', 1, 8).ok).toBe(false)
    expect(applyBinaryOperator('log', 0, 8).ok).toBe(false)
    expect(applyBinaryOperator('log', 2, 0).ok).toBe(false)
  })

  it('evaluates combinatorics operators with whole, in-range arguments', () => {
    expect(applyBinaryOperator('comb', 5, 2)).toMatchObject({
      ok: true,
      value: 10,
      headerText: 'COMB(5, 2) = 10',
    })
    expect(applyBinaryOperator('comb', 0, 0).value).toBe(1)
    expect(applyBinaryOperator('comb', 3, 5).ok).toBe(false)
    expect(applyBinaryOperator('comb', 5.5, 2).ok).toBe(false)

    expect(applyBinaryOperator('perm', 5, 2)).toMatchObject({
      ok: true,
      value: 20,
      headerText: 'PERM(5, 2) = 20',
    })
    expect(applyBinaryOperator('perm', 5, 0).value).toBe(1)
    expect(applyBinaryOperator('perm', 2, 5).ok).toBe(false)

    expect(applyBinaryOperator('stirling2', 5, 2)).toMatchObject({
      ok: true,
      value: 15,
      headerText: 'STR2(5, 2) = 15',
    })
    expect(applyBinaryOperator('stirling2', 0, 0).value).toBe(1)
    expect(applyBinaryOperator('stirling2', 4, 0).value).toBe(0)
    expect(applyBinaryOperator('stirling2', 2, 4).value).toBe(0)
    expect(applyBinaryOperator('stirling2', 4, -1).ok).toBe(false)

    expect(applyUnaryOperator('dfact', 6)).toMatchObject({
      ok: true,
      value: 48,
      headerText: '6!! = 48',
    })
    expect(applyUnaryOperator('dfact', 7).value).toBe(105)
    expect(applyUnaryOperator('dfact', 0).value).toBe(1)
    expect(applyUnaryOperator('dfact', 2.5).ok).toBe(false)
    expect(applyUnaryOperator('dfact', -2).ok).toBe(false)

    expect(applyUnaryOperator('subfact', 4)).toMatchObject({
      ok: true,
      value: 9,
      headerText: '!4 = 9',
    })
    expect(applyUnaryOperator('subfact', 0).value).toBe(1)
    expect(applyUnaryOperator('subfact', 5).value).toBe(44)
    expect(applyUnaryOperator('subfact', 2.5).ok).toBe(false)
    expect(applyUnaryOperator('subfact', -1).ok).toBe(false)

    // Combinatorics still guards its BigInt result range, while the Decimal
    // engine carries larger double-factorials and derangements exactly.
    expect(applyBinaryOperator('comb', 1000, 500).ok).toBe(false)
    expect(applyUnaryOperator('dfact', 30)).toMatchObject({
      ok: true,
      exactValue: '42849873690624000',
    })
    expect(applyUnaryOperator('subfact', 30)).toMatchObject({
      ok: true,
      exactValue: '97581073836835777732377428235481',
    })
  })

  it('prints analysis and combinatorics operators in readable equation form', () => {
    const exponential = createWorkspace(0, [createCard(2, 'spades', 'exp-2')])
    selectGroupInWorkspace(exponential, exponential.groups[0]!.id)
    applyOperatorInWorkspace(exponential, 'exp')
    expect(formatExpressionLhs(exponential.groups[0]!)).toBe('e^(2)')

    const logarithm = createWorkspace(0, [
      createCard(2, 'spades', 'log-2'),
      createCard(8, 'hearts', 'log-8'),
    ])
    selectGroupInWorkspace(logarithm, logarithm.groups[0]!.id)
    applyOperatorInWorkspace(logarithm, 'log')
    selectGroupInWorkspace(logarithm, logarithm.groups[1]!.id)
    expect(formatExpressionLhs(logarithm.groups[0]!)).toBe('log(2, 8)')

    const choose = createWorkspace(0, [
      createCard(5, 'spades', 'comb-5'),
      createCard(2, 'hearts', 'comb-2'),
    ])
    selectGroupInWorkspace(choose, choose.groups[0]!.id)
    applyOperatorInWorkspace(choose, 'comb')
    selectGroupInWorkspace(choose, choose.groups[1]!.id)
    expect(formatExpressionLhs(choose.groups[0]!)).toBe('COMB(5, 2)')

    const doubleFact = createWorkspace(0, [createCard(6, 'clubs', 'dfact-6')])
    selectGroupInWorkspace(doubleFact, doubleFact.groups[0]!.id)
    applyOperatorInWorkspace(doubleFact, 'dfact')
    expect(formatExpressionLhs(doubleFact.groups[0]!)).toBe('6!!')

    const derangement = createWorkspace(0, [createCard(4, 'diamonds', 'subfact-4')])
    selectGroupInWorkspace(derangement, derangement.groups[0]!.id)
    applyOperatorInWorkspace(derangement, 'subfact')
    expect(formatExpressionLhs(derangement.groups[0]!)).toBe('!4')

    // Nested factorial stays distinct from the new double-factorial operator.
    const nestedFactorial = createWorkspace(0, [createCard(3, 'hearts', 'nested-3')])
    selectGroupInWorkspace(nestedFactorial, nestedFactorial.groups[0]!.id)
    applyOperatorInWorkspace(nestedFactorial, 'fact')
    applyOperatorInWorkspace(nestedFactorial, 'fact')
    expect(formatExpressionLhs(nestedFactorial.groups[0]!)).toBe('(3!)!')
  })

  it('enables operators individually as well as by group', () => {
    const allOff = {
      basic: false,
      powers: false,
      factorial: false,
      trig: false,
      inverse: false,
      computing: false,
      concat: false,
      analysis: false,
      combinatorics: false,
      operators: {},
    }

    expect(getEnabledOperators(allOff)).toHaveLength(0)
    expect(
      getEnabledOperators({ ...allOff, analysis: true }).map((op) => op.id)
    ).toEqual(['exp', 'ln', 'log'])
    expect(
      getEnabledOperators({
        ...allOff,
        analysis: true,
        operators: { ln: false, exp: true },
      }).map((op) => op.id)
    ).toEqual(['exp', 'log'])
    expect(
      getEnabledOperators({ ...allOff, operators: { exp: true, comb: true } }).map(
        (op) => op.id
      )
    ).toEqual(['exp', 'comb'])
    expect(
      getEnabledOperators({ ...allOff, combinatorics: true }).map((op) => op.id)
    ).toEqual(['comb', 'perm', 'stirling2', 'dfact', 'subfact'])
  })

  it('groups LSHIFT and the bitwise operators under binary computing, without RSHIFT', () => {
    const allOff = {
      basic: false,
      powers: false,
      factorial: false,
      trig: false,
      inverse: false,
      computing: false,
      concat: false,
      analysis: false,
      combinatorics: false,
      operators: {},
    }
    const computing = getEnabledOperators({ ...allOff, computing: true })
    expect(computing.map((op) => op.id)).toEqual(['lshift', 'bitand', 'bitor', 'bitxor', 'bitnot'])
    expect(computing.every((op) => op.category === 'computing')).toBe(true)
    expect((OPERATOR_CATALOG.map((op) => op.id) as string[]).includes('rshift')).toBe(false)
  })

  it('prints computing operators in word form inside equations', () => {
    const hand = [
      createCard(12, 'spades', 'bits-12'),
      createCard(10, 'hearts', 'bits-10'),
      createCard(2, 'clubs', 'bits-2'),
    ]
    const ws = createWorkspace(0, hand)
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'bitand')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)
    expect(formatExpressionLhs(ws.groups[0]!)).toBe('AND(12, 10)')

    applyOperatorInWorkspace(ws, 'bitnot')
    expect(formatExpressionLhs(ws.groups[0]!)).toBe('NOT(AND(12, 10))')
    expect(formatFullEquation(ws.groups[0]!)).toBe('NOT(AND(12, 10)) = -9')

    // A word-form call reads as one term beside ordinary arithmetic.
    applyOperatorInWorkspace(ws, 'add')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)
    expect(formatExpressionLhs(ws.groups[0]!)).toBe('NOT(AND(12, 10)) + 2')
  })

  it('leaves operators beyond the tenth without a digit badge', () => {
    expect(opKeyLabel(0)).toBe('1')
    expect(opKeyLabel(9)).toBe('0')
    expect(opKeyLabel(10)).toBe('')
  })

  it('shows five decimal places by default and can reveal 32', () => {
    expect(formatNumber(Math.PI)).toBe('3.14159')
    expect(cleanFloat(Math.PI)).toBe(Math.PI)
    expect(formatNumber(0.000123456789012345)).toBe('0.00012')
    expect(formatNumber(1.23456789012345e-7)).toBe('1.23457e-7')
    // Floating noise still snaps away, and width is a separate display choice.
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    // At full width a double's binary noise is visible; the engine never invents
    // digits that the caller did not supply.
    expect(formatNumber(0.1 + 0.2, 32)).toBe('0.30000000000000004')
    expect(formatNumber('0.1', 32)).toBe('0.1')
    expect(cleanFloat(0.1 + 0.2)).toBe(0.3)

    expect(
      formatNumber('1.2345678901234567890123456789012345', 32)
    ).toBe('1.23456789012345678901234567890123')
    expect(formatNumber('0.3333333333333333333333333333333333', 5)).toBe('0.33333')
    expect(formatNumber('0.3333333333333333333333333333333333', 32)).toBe(
      '0.33333333333333333333333333333333'
    )

    // HUD scores and percentages stay short enough for their columns.
    expect(formatScore(38.5)).toBe('38.5')
    expect(formatScore(38)).toBe('38')
    expect(formatScore(null)).toBe('—')
    expect(formatPercent(19.047619047619047)).toBe('19.05%')
  })

  it('fits an oversized target number into its card', () => {
    expect(fittedFontSize(46, 230, 230)).toBeNull()
    expect(fittedFontSize(46, 230, 460)).toBe(23)
    expect(fittedFontSize(46, 100, 1000)).toBe(8)
    expect(fittedFontSize(46, 144, 773)).toBe(8)
    expect(fittedFontSize(46, 0, 1000)).toBeNull()
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

function demoLeaf(rank: 3 | 9 | 10, id: string): ExprNode {
  const card = createCard(rank, 'spades', id)
  return { kind: 'card', id, card, value: card.value }
}

function demoBinary(
  operator: 'add' | 'sub' | 'mult',
  left: ExprNode,
  right: ExprNode,
  value: number,
  id: string
): ExprNode {
  return { kind: 'binary', id, operator, left, right, value, headerText: '' }
}

/** A one-group workspace, for scoring a hand-built board end to end. */
function boardWithRoot(root: ExprNode) {
  const ws = createWorkspace(0, [])
  ws.groups = [root]
  return ws
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

  it('scores concat as a binary operator and brackets binary operands', () => {
    const six = createCard(6, 'spades', 'c-six')
    const ten = createCard(10, 'hearts', 'c-ten')
    const ws = createWorkspace(0, [six, ten])
    const [first, second] = ws.groups

    selectGroupInWorkspace(ws, first!.id)
    applyOperatorInWorkspace(ws, 'concat')
    selectGroupInWorkspace(ws, second!.id)

    const merged = ws.groups[0]!
    expect(merged.kind).toBe('binary')
    expect(merged.value).toBe(610)
    expect(calculateScore(merged)).toBe(10)
    expect(formatExpressionLhs(merged)).toBe('6 || 10')

    // Arithmetic used as a concat operand is always bracketed, so the order of
    // the digits is never ambiguous.
    const nested: ExprNode = {
      kind: 'binary',
      id: 'concat-nested',
      operator: 'concat',
      left: { kind: 'card', id: 'leaf-6', card: six, value: 6 },
      right: {
        kind: 'binary',
        id: 'sum',
        operator: 'add',
        left: { kind: 'card', id: 'leaf-4', card: createCard(4, 'clubs', 'c-four'), value: 4 },
        right: { kind: 'card', id: 'leaf-3', card: createCard(3, 'diamonds', 'c-three'), value: 3 },
        value: 7,
        headerText: '4 + 3 = 7',
      },
      value: 67,
      headerText: '6 || 7 = 67',
    }
    expect(formatExpressionLhs(nested)).toBe('6 || (4 + 3)')
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
      forbiddenCount: 0,
      forbiddenCost: 0,
      accuracyCost: 0,
    })
    expect(calculateScoreBreakdown(root).total).toBe(calculateScore(root))
  })

  it('costs every group while the board is still being solved', () => {
    const ws = createWorkspace(0, [sampleCards[0]!, sampleCards[1]!, sampleCards[2]!]) // 4, 3, 7
    expect(calculateBoardBreakdown(ws.groups)).toMatchObject({
      total: 0,
      binaryOperators: 0,
      unaryOperators: 0,
      forbiddenCount: 0,
    })

    // 4! costs 10 even though three untouched groups remain on the board.
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'fact')
    expect(ws.groups.length).toBe(3)
    expect(calculateBoardBreakdown(ws.groups)).toMatchObject({
      total: 10,
      unaryOperators: 1,
      unaryCost: 10,
    })

    // Merging 4! with 3 adds the binary 10 while two groups still remain.
    applyOperatorInWorkspace(ws, 'add')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)
    expect(ws.groups.length).toBe(2)
    expect(calculateBoardBreakdown(ws.groups)).toMatchObject({
      total: 20,
      binaryOperators: 1,
      binaryCost: 10,
      unaryOperators: 1,
      unaryCost: 10,
    })

    // Forbidden moves are counted per group too.
    const forbiddenBoard = createWorkspace(0, [
      createCard(1, 'spades', 'board-one'),
      createCard(5, 'hearts', 'board-five'),
    ])
    selectGroupInWorkspace(forbiddenBoard, forbiddenBoard.groups[0]!.id)
    applyOperatorInWorkspace(forbiddenBoard, 'pow')
    selectGroupInWorkspace(forbiddenBoard, forbiddenBoard.groups[1]!.id)
    expect(calculateBoardBreakdown(forbiddenBoard.groups)).toMatchObject({
      forbiddenCount: 1,
      forbiddenCost: 200,
      total: 210,
    })

    // Accuracy only joins the bill once the board is a finished solution.
    const accuracy = { errorPercent: 10, approximationPercent: 20, mode: 'balanced' as const }
    expect(calculateBoardBreakdown(ws.groups, accuracy)).toMatchObject({
      accuracyCost: 15,
      total: 35,
    })
  })

  it('weights accuracy against operation cost according to the scoring mode', () => {
    // 81 within a 20% band of 100: 19% error, one binary operator.
    // An exact 100 board costs three binary operators (30 points).
    const cheapInaccurate = boardWithRoot(
      demoBinary('mult', demoLeaf(9, 'nine-a'), demoLeaf(9, 'nine-b'), 81, 'eighty-one')
    )
    const exactExpensive = boardWithRoot(
      demoBinary(
        'add',
        demoBinary('mult', demoLeaf(10, 'ten-a'), demoLeaf(10, 'ten-b'), 100, 'hundred'),
        demoBinary('sub', demoLeaf(3, 'three-a'), demoLeaf(3, 'three-b'), 0, 'zero'),
        100,
        'exact-hundred'
      )
    )

    expect(accuracyPenaltyFor(19, 20, 'cost-first')).toBe(1.9)
    expect(accuracyPenaltyFor(19, 20, 'balanced')).toBe(28.5)
    expect(accuracyPenaltyFor(19, 20, 'accuracy-first')).toBe(95)
    // Without an approximation band there is nothing to trade off.
    expect(accuracyPenaltyFor(19, 0, 'accuracy-first')).toBe(0)

    const costFirst = evaluateWorkspaceSolution(cheapInaccurate, 100, 20, 'cost-first')
    const balancedCheap = evaluateWorkspaceSolution(cheapInaccurate, 100, 20, 'balanced')
    const accurateCheap = evaluateWorkspaceSolution(cheapInaccurate, 100, 20, 'accuracy-first')
    const balancedExact = evaluateWorkspaceSolution(exactExpensive, 100, 20, 'balanced')

    expect(costFirst.score).toBe(11.9)
    expect(balancedCheap.score).toBe(38.5)
    expect(accurateCheap.score).toBe(105)
    expect(balancedExact.score).toBe(30)

    // Cost-first still rewards cheaper operations, balanced makes a full-band
    // error worth one binary operator, and accuracy-first lets precision win.
    expect(costFirst.score!).toBeLessThan(balancedExact.score!)
    expect(balancedExact.score!).toBeLessThan(balancedCheap.score!)
    expect(balancedExact.score!).toBeLessThan(accurateCheap.score!)

    const cheapBreakdown = calculateScoreBreakdown(cheapInaccurate.groups[0]!, {
      errorPercent: 19,
      approximationPercent: 20,
      mode: 'balanced',
    })
    expect(cheapBreakdown.binaryCost).toBe(10)
    expect(cheapBreakdown.accuracyCost).toBe(28.5)
    expect(cheapBreakdown.total).toBe(38.5)
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

  it('penalises 1 raised to a power as a configurable forbidden move', () => {
    const one = createCard(1, 'spades', 'pow-one')
    const five = createCard(5, 'hearts', 'pow-five')
    const ws = createWorkspace(0, [one, five])
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'pow')
    selectGroupInWorkspace(ws, ws.groups[1]!.id)
    const tree = ws.groups[0]!
    expect(tree.value).toBe(1)

    // Default house rules: the binary costs 10 and the forbidden move 200.
    expect(calculateScoreBreakdown(tree)).toMatchObject({
      binaryCost: 10,
      forbiddenCount: 1,
      forbiddenCost: 200,
      total: 210,
    })

    // The host can reprice the move...
    const priced = {
      moves: { factorialInvgamma: true, oneToPower: true },
      penalty: 35,
    }
    expect(calculateScoreBreakdown(tree, undefined, priced).total).toBe(45)
    if (tree.kind !== 'binary') throw new Error('expected a power tree')
    expect(costOfBinaryOn('pow', tree.left, priced)).toBe(45)
    expect(
      costOfBinaryOn('pow', tree.left, {
        moves: { factorialInvgamma: true, oneToPower: false },
        penalty: 35,
      })
    ).toBe(10)

    // ...or switch it off, leaving only the operator cost.
    expect(
      calculateScoreBreakdown(tree, undefined, {
        moves: { factorialInvgamma: true, oneToPower: false },
        penalty: 200,
      }).total
    ).toBe(10)

    // A negative or missing penalty can never turn a forbidden move into a rebate.
    const enabled = { moves: { factorialInvgamma: true, oneToPower: true } }
    expect(calculateScoreBreakdown(tree, undefined, { ...enabled, penalty: -50 }).total).toBe(10)
    expect(calculateScoreBreakdown(tree, undefined, { ...enabled, penalty: NaN }).total).toBe(10)

    // A power with any other base is ordinary play.
    const normal = createWorkspace(0, [createCard(2, 'clubs', 'pow-two'), five])
    selectGroupInWorkspace(normal, normal.groups[0]!.id)
    applyOperatorInWorkspace(normal, 'pow')
    selectGroupInWorkspace(normal, normal.groups[1]!.id)
    expect(calculateScoreBreakdown(normal.groups[0]!)).toMatchObject({
      forbiddenCount: 0,
      total: 10,
    })
  })

  it('makes the factorial/inverse-gamma pairing a configurable forbidden move', () => {
    const ws = createWorkspace(0, [sampleCards[1]!]) // card 3
    selectGroupInWorkspace(ws, ws.groups[0]!.id)
    applyOperatorInWorkspace(ws, 'invgamma')
    applyOperatorInWorkspace(ws, 'fact')
    const tree = ws.groups[0]!

    expect(calculateScoreBreakdown(tree).total).toBe(230)

    // Switching the move off leaves the ordinary 10 + 20 unary ladder.
    expect(
      calculateScoreBreakdown(tree, undefined, {
        moves: { factorialInvgamma: false, oneToPower: true },
        penalty: 200,
      })
    ).toMatchObject({ forbiddenCount: 0, forbiddenCost: 0, total: 30 })

    // A cheaper penalty applies to the existing pairing too.
    const cheap = {
      moves: { factorialInvgamma: true, oneToPower: true },
      penalty: 25,
    }
    expect(calculateScoreBreakdown(tree, undefined, cheap)).toMatchObject({
      forbiddenCount: 1,
      forbiddenCost: 25,
      total: 55,
    })
    expect(costOfUnaryOn('fact', unaryOperandOf(tree), cheap)).toBe(45)
  })

  it('separates the forbidden-move penalty from the unary layers', () => {
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
      forbiddenCount: 2,
      forbiddenCost: 400,
      accuracyCost: 0,
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
      forbiddenCount: 0,
      forbiddenCost: 0,
      accuracyCost: 0,
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

  it('ships a catalogue of famous constants with names and explanations', () => {
    expect(CONSTANT_CATALOG.length).toBeGreaterThanOrEqual(23)
    expect(new Set(CONSTANT_CATALOG.map((constant) => constant.id)).size).toBe(
      CONSTANT_CATALOG.length
    )
    expect(new Set(CONSTANT_CATALOG.map((constant) => constant.value)).size).toBe(
      CONSTANT_CATALOG.length
    )

    for (const constant of CONSTANT_CATALOG) {
      expect(Number.isFinite(constant.value)).toBe(true)
      expect(constant.symbol.length).toBeGreaterThan(0)
      expect(constant.name.length).toBeGreaterThan(1)
      expect(constant.description.length).toBeGreaterThan(20)
    }

    expect(constantById('pi')?.value).toBe(Math.PI)
    expect(constantById('e')?.value).toBe(Math.E)
    expect(constantById('euler-gamma')?.value).toBeCloseTo(0.5772156649015329, 12)
    expect(constantById('not-a-constant')).toBeNull()
    expect(constantByValue(Math.PI)?.id).toBe('pi')
  })

  it('deals a chosen or random famous constant as the target', () => {
    const base = {
      customMin: 1,
      customMax: 50,
      manualTarget: 99,
    }

    expect(
      generateTargetNumber({ ...base, targetPreset: 'constant', targetConstant: 'e' })
    ).toBe(Math.E)
    expect(
      generateTargetNumber({ ...base, targetPreset: 'constant', targetConstant: 'pi' })
    ).toBe(Math.PI)

    const random = generateTargetNumber(
      { ...base, targetPreset: 'constant', targetConstant: 'random' },
      () => 0.5
    )
    expect(CONSTANT_CATALOG.some((constant) => constant.value === random)).toBe(true)
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
    expect(Math.abs(rightPos.x - leftPos.x)).toBeGreaterThan(80)
    expect(Math.abs(rightPos.y - leftPos.y)).toBeGreaterThan(0)
  })

  it('fans ungrouped halves to a random side so repeated splits do not drift right', () => {
    const hand = [createCard(6, 'spades', 'fan-1'), createCard(4, 'hearts', 'fan-2')]

    // Merge both cards, park the group at a known spot, then split it again.
    const splitAt = (randomValue: number) => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(randomValue)
      const ws = createWorkspace(0, hand)
      const ids = ws.groups.map((group) => group.id)
      setGroupPosition(ws, ids[0]!, 300, 200)
      selectGroupInWorkspace(ws, ids[0]!)
      applyOperatorInWorkspace(ws, 'add')
      selectGroupInWorkspace(ws, ids[1]!)
      expect(ungroupInWorkspace(ws).changed).toBe(true)
      random.mockRestore()
      return {
        left: getGroupPosition(ws, ids[0]!, 0),
        right: getGroupPosition(ws, ids[1]!, 1),
      }
    }

    // A high roll fans the pair right, leaving the left operand near the parent.
    const rightFan = splitAt(0.9)
    expect(rightFan.left.x).toBeGreaterThan(250)
    expect(rightFan.right.x - 300).toBeGreaterThan(100)
    expect(rightFan.right.x - rightFan.left.x).toBeGreaterThan(100)

    // A low roll fans the same split left, or every split would walk the board
    // further right than the last.
    const leftFan = splitAt(0.1)
    expect(300 - leftFan.left.x).toBeGreaterThan(100)
    expect(leftFan.right.x).toBeGreaterThan(250)
    expect(leftFan.right.x - leftFan.left.x).toBeGreaterThan(100)
  })

  it('keeps a left-fanning split heading left when its landing spot is occupied', () => {
    const hand = [
      createCard(6, 'spades', 'avoid-1'),
      createCard(4, 'hearts', 'avoid-2'),
      createCard(2, 'clubs', 'avoid-3'),
    ]
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const ws = createWorkspace(0, hand)
    const ids = ws.groups.map((group) => group.id)
    setGroupPosition(ws, ids[0]!, 300, 200)
    // Park the third card exactly where the left half would otherwise land.
    setGroupPosition(ws, ids[2]!, 141, 240)

    selectGroupInWorkspace(ws, ids[0]!)
    applyOperatorInWorkspace(ws, 'add')
    selectGroupInWorkspace(ws, ids[1]!)
    expect(ungroupInWorkspace(ws).changed).toBe(true)
    random.mockRestore()

    // Stepping around the neighbour must not reverse the fan into the parent.
    const fannedLeft = getGroupPosition(ws, ids[0]!, 0)
    expect(fannedLeft.x).toBeLessThan(100)
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

    // The dealt cards themselves, not just their top-left corners, are centred
    // on the workspace origin.
    expect(
      Math.abs(firstRow[0]!.x + firstRow[5]!.x + DEFAULT_CARD_SLOT_WIDTH)
    ).toBeLessThan(1)
    // The two-row block as a whole is vertically centred on the origin.
    expect(Math.abs(firstRow[0]!.y + secondRow[0]!.y + DEFAULT_CARD_SLOT_HEIGHT)).toBeLessThan(
      1.5
    )

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

  it('centres a tidied grid by the card boxes, not their top-left corners', () => {
    const hand = Array.from({ length: 4 }, (_, i) => createCard(8, 'spades', `box-tidy-${i}`))
    const ws = createWorkspace(0, hand)
    const ids = ws.groups.map((group) => group.id)
    const slotSizes = Object.fromEntries(
      ids.map((id) => [id, { width: DEFAULT_CARD_SLOT_WIDTH, height: DEFAULT_CARD_SLOT_HEIGHT }])
    )

    expect(tidyWorkspaceGroups(ws, { columns: 4, slotSizes })).toBe(true)

    const boxes = ids.map((id) => {
      const pos = getGroupPosition(ws, id)
      return {
        minX: pos.x,
        maxX: pos.x + DEFAULT_CARD_SLOT_WIDTH,
        minY: pos.y,
        maxY: pos.y + DEFAULT_CARD_SLOT_HEIGHT,
      }
    })
    const minX = Math.min(...boxes.map((box) => box.minX))
    const maxX = Math.max(...boxes.map((box) => box.maxX))
    const minY = Math.min(...boxes.map((box) => box.minY))
    const maxY = Math.max(...boxes.map((box) => box.maxY))

    expect(Math.abs(minX + maxX)).toBeLessThan(1)
    // An odd card height leaves the exact centre on a half pixel, so one pixel
    // of integer rounding is expected.
    expect(Math.abs(minY + maxY)).toBeLessThanOrEqual(1)
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

  it('stacks the most recently selected or handled group on top', () => {
    const hand = Array.from({ length: 4 }, (_, i) => createCard(3, 'clubs', `stack-${i}`))
    const ws = createWorkspace(0, hand)
    const ids = ws.groups.map((group) => group.id)

    // The deal itself is a stack: the last card dealt sits on top.
    expect(ws.stackOrder).toEqual(ids)
    expect(getGroupStackRank(ws, ids[3]!)).toBe(3)
    expect(getGroupStackRank(ws, ids[0]!)).toBe(0)

    // Selecting a card lifts it above everything else...
    selectGroupInWorkspace(ws, ids[0]!)
    expect(getGroupStackRank(ws, ids[0]!)).toBe(3)
    // ...and selecting another card takes that top spot from it.
    selectGroupInWorkspace(ws, ids[1]!)
    expect(getGroupStackRank(ws, ids[1]!)).toBe(3)
    expect(getGroupStackRank(ws, ids[0]!)).toBe(2)

    // Merging leaves the fused group on top and forgets its absorbed operand.
    applyOperatorInWorkspace(ws, 'add')
    selectGroupInWorkspace(ws, ids[0]!)
    expect(ws.groups.length).toBe(3)
    const merged = ws.groups.find((group) => group.kind === 'binary')!
    expect(ws.stackOrder.at(-1)).toBe(merged.id)
    expect(ws.stackOrder).not.toContain(ids[0])

    // Splitting the fused group lifts both halves above the untouched cards.
    selectGroupInWorkspace(ws, ids[2]!)
    expect(ungroupInWorkspace(ws, merged.id).changed).toBe(true)
    const splitIds = ws.groups.slice(0, 2).map((group) => group.id)
    expect(ws.stackOrder.at(-2)).toBe(splitIds[0])
    expect(ws.stackOrder.at(-1)).toBe(splitIds[1])

    // Undo restores any group the order had pruned, without losing the live ones.
    expect(undoWorkspace(ws)).toBe(true)
    expect(new Set(ws.stackOrder)).toEqual(new Set(ws.groups.map((group) => group.id)))
    expect(ws.stackOrder).toHaveLength(ws.groups.length)
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

  it('shows the running score while the board is still being solved', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    const total = () => wrapper.find('[data-testid="cost-total"]').text()
    expect(total()).toContain('0')

    // A unary on one card costs 10 while the other three groups stay untouched.
    await wrapper.findAll('.expr-node--root')[0]!.trigger('click')
    await wrapper.find('[data-testid="op-fact"]').trigger('click')
    expect(wrapper.findAll('.expr-node--root').length).toBe(4)
    expect(total()).toContain('10')

    // Merging that group adds the binary cost, still with two groups left.
    await wrapper.find('[data-testid="op-add"]').trigger('click')
    await wrapper.findAll('.expr-node--root')[1]!.trigger('click')
    expect(wrapper.findAll('.expr-node--root').length).toBe(3)
    expect(total()).toContain('20')

    wrapper.unmount()
  })

  it('offers forbidden moves and their penalty in the lobby settings', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    const factorialToggle = wrapper.find('[data-testid="forbid-factorial-invgamma"]')
    const powerToggle = wrapper.find('[data-testid="forbid-one-to-power"]')
    const penalty = wrapper.find('[data-testid="forbidden-penalty"]')
    const summary = () => wrapper.find('[data-testid="forbidden-summary"]').text()

    // Both house rules are on by default, at 200 points each.
    expect((factorialToggle.element as HTMLInputElement).checked).toBe(true)
    expect((powerToggle.element as HTMLInputElement).checked).toBe(true)
    expect((penalty.element as HTMLInputElement).value).toBe('200')
    expect(summary()).toContain('+200 pts')
    expect(summary()).toContain('! with Γ⁻¹')
    expect(summary()).toContain('1 to a power')

    // The host reprices the moves from the same form.
    await penalty.setValue('75')
    expect(summary()).toContain('+75 pts')

    // Unticking a move drops it from the rules summary.
    await powerToggle.setValue(false)
    expect(summary()).toContain('! with Γ⁻¹')
    expect(summary()).not.toContain('1 to a power')

    await factorialToggle.setValue(false)
    expect(summary()).toContain('Forbidden moves are off.')

    wrapper.unmount()
  })

  it('puts the workspace origin at the centre of the felt', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    const plane = wrapper.find('[data-testid="workspace-plane"]')
    expect(plane.exists()).toBe(true)
    // The pan translation is applied on top of a 50%/50% origin offset, so
    // pan (0, 0) is the visual centre rather than the felt's top-left corner.
    expect(plane.attributes('style')).toContain('translate(50%, 50%)')

    wrapper.unmount()
  })

  it('raises the last card the player selects or picks up above the others', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    const slots = () => wrapper.findAll('.draggable-group-slot')
    const zIndexes = () =>
      slots().map((slot) => Number((slot.element as HTMLElement).style.zIndex))
    const topZ = () => Math.max(...zIndexes())

    // The dealt cards stack in order, so every card has its own layer.
    const initial = zIndexes()
    expect(new Set(initial).size).toBe(initial.length)
    expect(initial.at(-1)).toBe(topZ())

    // Selecting the first card lifts it above every neighbour.
    await wrapper.findAll('.expr-node--root')[0]!.trigger('click')
    expect(zIndexes()[0]).toBe(topZ())

    // Picking up another card (pointer-down) lifts that one instead, immediately.
    await slots()[1]!.trigger('pointerdown')
    const afterPickup = zIndexes()
    expect(afterPickup[1]).toBe(topZ())
    expect(afterPickup[0]).toBeLessThan(afterPickup[1]!)

    wrapper.unmount()
  })

  it('forms locked dragon binds at the deal when enabled in the lobby', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    await wrapper.find('#setting-num-cards').setValue('10')
    await wrapper.find('[data-testid="toggle-bind-dragon"]').setValue(true)
    await wrapper.find('[data-testid="bind-dragon-required"]').setValue('2')
    await wrapper.find('[data-testid="bind-max"]').setValue('3')
    expect(wrapper.find('[data-testid="bind-summary"]').text()).toContain('Dragon 2+')

    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    await nextTick()

    // Ten cards cannot avoid a consecutive pair, so at least one dragon must form.
    const bindRoots = wrapper.findAll('.expr-node--root.expr-node--bind')
    expect(bindRoots.length).toBeGreaterThan(0)
    expect(wrapper.findAll('.draggable-group-slot').length).toBeLessThan(10)
    expect(bindRoots[0]!.text()).toContain('DRAGON')

    await bindRoots[0]!.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="inline-ungroup-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ungroup-btn"]').attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })

  it('shows the winning board in card form on the round-end screen', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    // A wide band and target make any sum of the random hand acceptable.
    await wrapper.find('#setting-target').setValue('manual')
    await wrapper.find('#setting-approx').setValue('100')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    await wrapper.find('[data-testid="target-choice-input"]').setValue('100')
    await wrapper.find('[data-testid="target-choice-form"]').trigger('submit')
    await nextTick()
    expect(wrapper.find('[data-testid="target-display"]').text()).toBe('100')

    // Merge every card with addition; the merged group stays selected.
    await wrapper.findAll('.expr-node--root')[0]!.trigger('click')
    for (let step = 0; step < 3; step++) {
      await wrapper.find('[data-testid="op-add"]').trigger('click')
      const groups = wrapper.findAll('.expr-node--root')
      await groups[1]!.trigger('click')
      await nextTick()
    }
    expect(wrapper.findAll('.expr-node--root')).toHaveLength(1)

    await wrapper.find('[data-testid="finish-round-btn"]').trigger('click')
    await nextTick()

    const board = wrapper.find('[data-testid="winning-board"]')
    expect(board.exists()).toBe(true)
    expect(board.findAll('.playing-card')).toHaveLength(4)
    expect(wrapper.find('[data-testid="round-end-equation"]').text()).toContain('=')

    wrapper.unmount()
  })

  it('asks for the exact target before every round instead of in the lobby', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    await wrapper.find('#setting-target').setValue('manual')
    expect(wrapper.find('#setting-manual-target').exists()).toBe(false)
    expect(wrapper.find('[data-testid="manual-target-hint"]').exists()).toBe(true)

    // Opening the chooser and cancelling leaves the table untouched.
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="target-choice-dialog"]').exists()).toBe(true)
    await wrapper.find('[data-testid="target-choice-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="target-choice-dialog"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="start-round-btn"]').exists()).toBe(true)

    // An empty field is refused rather than silently dealing 0.
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    await wrapper.find('[data-testid="target-choice-input"]').setValue('')
    await wrapper.find('[data-testid="target-choice-form"]').trigger('submit')
    expect(wrapper.find('[data-testid="target-choice-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="target-choice-error"]').exists()).toBe(true)

    await wrapper.find('[data-testid="target-choice-input"]').setValue('42')
    await wrapper.find('[data-testid="target-choice-form"]').trigger('submit')
    await nextTick()
    expect(wrapper.find('[data-testid="target-display"]').text()).toBe('42')

    // The next round asks again, with the previous target as the starting value.
    await wrapper.find('[data-testid="finish-round-btn"]').trigger('click')
    await nextTick()
    await wrapper.find('[data-testid="next-round-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="target-choice-dialog"]').exists()).toBe(true)
    expect(
      (wrapper.find('[data-testid="target-choice-input"]').element as HTMLInputElement).value
    ).toBe('42')
    await wrapper.find('[data-testid="target-choice-input"]').setValue('84')
    await wrapper.find('[data-testid="target-choice-form"]').trigger('submit')
    await nextTick()
    expect(wrapper.find('[data-testid="target-display"]').text()).toBe('84')
    expect(wrapper.find('.blind-card__marquee').text()).toContain('ROUND 2')

    wrapper.unmount()
  })

  it('keeps a typed high-precision target exact for acceptance', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    await wrapper.find('#setting-target').setValue('manual')
    await wrapper.find('#setting-approx').setValue('2')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    const exact = '3.1415926535897932384626433832795'
    await wrapper.find('[data-testid="target-choice-input"]').setValue(exact)
    await wrapper.find('[data-testid="target-choice-form"]').trigger('submit')
    await nextTick()

    expect(wrapper.findComponent(ScorePanel).props('targetExact')).toBe(exact)
    expect(wrapper.find('[data-testid="target-display"]').text()).toBe('3.14159')

    wrapper.unmount()
  })

  it('offers the three weighted scoring modes in the lobby, enabled with approximations', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    const select = wrapper.find('[data-testid="setting-scoring-mode"]')
    expect(select.exists()).toBe(true)
    expect(select.findAll('option').map((option) => option.attributes('value'))).toEqual([
      'cost-first',
      'balanced',
      'accuracy-first',
    ])
    // With no tolerance there is no accuracy to trade off, so the control rests.
    expect(select.attributes('disabled')).toBeDefined()

    await wrapper.find('#setting-approx').setValue('5')
    expect(select.attributes('disabled')).toBeUndefined()
    await select.setValue('accuracy-first')
    expect((select.element as HTMLSelectElement).value).toBe('accuracy-first')

    wrapper.unmount()
  })

  it('offers a constants target mode with a picker, a default error band and an in-game legend', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    await wrapper.find('#setting-target').setValue('constant')
    await nextTick()

    const picker = wrapper.find('[data-testid="setting-constant"]')
    expect(picker.exists()).toBe(true)
    const values = picker.findAll('option').map((option) => option.attributes('value'))
    expect(values[0]).toBe('random')
    expect(values).toContain('pi')
    expect(values).toContain('e')
    expect(values).toContain('euler-gamma')
    expect(values.length).toBeGreaterThanOrEqual(24)

    // Constants are irrational, so picking the mode leaves a usable band by default.
    const approx = wrapper.find('#setting-approx').element as HTMLInputElement
    expect(Number(approx.value)).toBeGreaterThan(0)

    await picker.setValue('pi')
    expect(wrapper.find('[data-testid="constant-preview"]').text()).toContain('Pi')

    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    await nextTick()

    const target = wrapper.find('[data-testid="target-display"]').text()
    expect(target).toBe(formatNumber(Math.PI))
    const legend = wrapper.find('[data-testid="constant-display"]')
    expect(legend.exists()).toBe(true)
    expect(legend.text()).toContain('Pi')
    expect(legend.text()).toContain('circumference')

    wrapper.unmount()
  })

  it('shows the running cost before a solution is complete', () => {
    const wrapper = mount(ScorePanel, {
      props: {
        roundNumber: 1,
        target: 24,
        approximationPercent: 0,
        scoringMode: 'cost-first',
        value: null,
        errorPercent: null,
        acceptable: false,
        costBreakdown: {
          total: 20,
          binaryOperators: 1,
          binaryCost: 10,
          unaryOperators: 1,
          unaryCost: 10,
          forbiddenCount: 0,
          forbiddenCost: 0,
          accuracyCost: 0,
        },
        hitSignal: 0,
      },
    })

    expect(wrapper.find('[data-testid="cost-total"]').text()).toContain('20')
    const breakdown = wrapper.find('[data-testid="cost-breakdown"]').text()
    expect(breakdown).toContain('BINARY')
    expect(breakdown).toContain('UNARY')

    wrapper.unmount()
  })

  it('shows the accuracy penalty in the score widget and folds it into the total', () => {
    const wrapper = mount(ScorePanel, {
      props: {
        roundNumber: 1,
        target: 100,
        approximationPercent: 20,
        scoringMode: 'balanced',
        value: 81,
        errorPercent: 19,
        acceptable: true,
        costBreakdown: {
          total: 38.5,
          binaryOperators: 1,
          binaryCost: 10,
          unaryOperators: 0,
          unaryCost: 0,
          forbiddenCount: 0,
          forbiddenCost: 0,
          accuracyCost: 28.5,
        },
        hitSignal: 0,
      },
    })

    expect(wrapper.find('[data-testid="cost-total"]').text()).toContain('38.5')
    const breakdown = wrapper.find('[data-testid="cost-breakdown"]').text()
    expect(breakdown).toContain('BINARY')
    expect(breakdown).toContain('ACCURACY')
    expect(breakdown).toContain('19%')
    expect(breakdown).toContain('28.5')
    expect(wrapper.find('[data-testid="scoring-mode"]').text()).toContain('BALANCED')

    wrapper.unmount()
  })

  it('itemises forbidden moves as their own score row', () => {
    const wrapper = mount(ScorePanel, {
      props: {
        roundNumber: 1,
        target: 24,
        approximationPercent: 0,
        scoringMode: 'cost-first',
        value: 1,
        errorPercent: 0,
        acceptable: false,
        costBreakdown: {
          total: 210,
          binaryOperators: 1,
          binaryCost: 10,
          unaryOperators: 0,
          unaryCost: 0,
          forbiddenCount: 1,
          forbiddenCost: 200,
          accuracyCost: 0,
        },
        hitSignal: 0,
      },
    })

    const row = wrapper.find('[data-testid="cost-forbidden"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('FORBID')
    expect(row.text()).toContain('×1')
    expect(row.text()).toContain('200')

    wrapper.unmount()
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
      'operators',
      'keys',
    ])
    expect(wrapper.findAll('[data-testid="tutorial-scroll"] .rail-link')).toHaveLength(0)
    expect(wrapper.findAll('.rail-link')).toHaveLength(8)

    // The operator reference covers each operator family the host can enable.
    // Ten original families plus the analysis and combinatorics groups.
    expect(wrapper.findAll('.op-table__row')).toHaveLength(12)
    expect(wrapper.findAll('.op-table__note')).toHaveLength(12)

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

  it('bobs the picked card when an operator is equipped, not the whole felt', async () => {
    const originalAnimate = Element.prototype.animate
    const animate = vi.fn()
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate
    try {
      const wrapper = mount(App)
      await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
      await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

      const firstCard = wrapper.findAll('.expr-node--root')[0]!
      await firstCard.trigger('click')
      animate.mockClear()

      await wrapper.find('[data-testid="op-add"]').trigger('click')

      // Exactly one thing moves: the card the operator was equipped on.
      expect(animate).toHaveBeenCalledTimes(1)
      const bobbed = animate.mock.contexts[0] as HTMLElement
      expect(bobbed.className).toContain('draggable-group-slot')
      expect(bobbed.querySelector('.expr-node--root')).not.toBeNull()
      expect(animate.mock.contexts).not.toContain(wrapper.find('.felt-table').element)

      const options = animate.mock.calls[0]![1] as KeyframeAnimationOptions
      expect(options.duration).toBeLessThan(500)

      // A unary operation swaps in a brand-new group node; it bobs too.
      animate.mockClear()
      await wrapper.find('[data-testid="op-fact"]').trigger('click')
      expect(animate).toHaveBeenCalledTimes(1)
      expect((animate.mock.contexts[0] as HTMLElement).getAttribute('data-testid')).toMatch(
        /^group-slot-/
      )

      wrapper.unmount()
    } finally {
      Element.prototype.animate = originalAnimate
    }
  })

  it('sprays pixel particles when operators land, pieces merge and groups split', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    const particles = () => wrapper.findAll('.felt-particle')
    expect(wrapper.find('[data-testid="particle-layer"]').exists()).toBe(true)
    expect(particles()).toHaveLength(0)

    // Equipping a unary operator pops motes around the wrapped piece.
    await wrapper.findAll('.expr-node--root')[0]!.trigger('click')
    await wrapper.find('[data-testid="op-fact"]').trigger('click')
    await nextTick()
    await nextTick()
    expect(particles()).toHaveLength(PARTICLE_BURST_COUNTS.operator)

    // Arming a binary operator sparks too, then picking a second card fuses
    // the pieces with a merge burst of its own.
    await wrapper.find('[data-testid="op-add"]').trigger('click')
    await wrapper.findAll('.expr-node--root')[1]!.trigger('click')
    await nextTick()
    await nextTick()
    expect(particles()).toHaveLength(PARTICLE_BURST_COUNTS.operator * 2 + PARTICLE_BURST_COUNTS.merge)

    // Splitting the fused group throws shards from the freed pieces. Only the
    // newest three bursts stay mounted, so the oldest operator motes drop off.
    await wrapper.find('[data-testid="ungroup-btn"]').trigger('click')
    await nextTick()
    await nextTick()
    expect(particles()).toHaveLength(
      PARTICLE_BURST_COUNTS.operator + PARTICLE_BURST_COUNTS.merge + PARTICLE_BURST_COUNTS.split
    )

    // Each particle owns its flight vector and colour, so the layer is animated
    // by CSS rather than by polling Vue state every frame.
    const style = particles()[0]!.attributes('style') ?? ''
    expect(style).toMatch(/--dx: -?[\d.]+px/)
    expect(style).toMatch(/--dy: -?[\d.]+px/)
    expect(style).toMatch(/--color: #[0-9a-f]{6}/i)

    wrapper.unmount()
  })

  it('keeps a floating cue on its own spot when older cues drop off', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    // Each operator press raises a cue (arming, or the NOPE once arming repeats).
    await wrapper.findAll('.expr-node--root')[0]!.trigger('click')
    const addBtn = wrapper.find('[data-testid="op-add"]')
    for (let i = 0; i < 4; i++) await addBtn.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.float-cue')).toHaveLength(4)

    const survivorStyle = wrapper.findAll('.float-cue')[1]!.attributes('style')
    expect(survivorStyle).toMatch(/left: -?\d+(\.\d+)?%/)

    // A fifth cue evicts the oldest; the survivors must not be re-positioned.
    await addBtn.trigger('click')
    await nextTick()
    const cues = wrapper.findAll('.float-cue')
    expect(cues).toHaveLength(4)
    expect(cues[0]!.attributes('style')).toBe(survivorStyle)
    expect(new Set(cues.map((cue) => cue.attributes('style'))).size).toBeGreaterThan(1)

    wrapper.unmount()
  })

  it('puts concat on the rails only when its lobby toggle is on', async () => {
    const off = mount(App)
    await off.find('[data-testid="enter-singleplayer"]').trigger('click')
    const offToggle = off.find('[data-testid="toggle-group-concat"]')
    expect(offToggle.exists()).toBe(true)
    expect((offToggle.element as HTMLInputElement).checked).toBe(false)
    await off.find('[data-testid="start-round-btn"]').trigger('click')
    expect(off.find('[data-testid="op-concat"]').exists()).toBe(false)
    off.unmount()

    const on = mount(App)
    await on.find('[data-testid="enter-singleplayer"]').trigger('click')
    await on.find('[data-testid="toggle-group-concat"]').setValue(true)
    await on.find('[data-testid="start-round-btn"]').trigger('click')
    expect(on.find('[data-testid="op-concat"]').exists()).toBe(true)

    // Joining two dealt cards with it prints a concatenated header, in pick order.
    await on.findAll('.expr-node--root')[0]!.trigger('click')
    await on.find('[data-testid="op-concat"]').trigger('click')
    await on.findAll('.expr-node--root')[1]!.trigger('click')
    const header = on.find('.group-header-eq').text()
    expect(header).toMatch(/^\d+ \|\| \d+ = \d+$/)

    on.unmount()
  })

  it('puts the computing operators behind one lobby toggle', async () => {
    const off = mount(App)
    await off.find('[data-testid="enter-singleplayer"]').trigger('click')
    const toggle = off.find('[data-testid="toggle-group-computing"]')
    expect(toggle.exists()).toBe(true)
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    await off.find('[data-testid="start-round-btn"]').trigger('click')
    for (const id of ['lshift', 'bitand', 'bitor', 'bitxor', 'bitnot', 'rshift']) {
      expect(off.find(`[data-testid="op-${id}"]`).exists()).toBe(false)
    }
    off.unmount()

    const on = mount(App)
    await on.find('[data-testid="enter-singleplayer"]').trigger('click')
    await on.find('[data-testid="toggle-group-computing"]').setValue(true)
    await on.find('[data-testid="start-round-btn"]').trigger('click')
    for (const id of ['lshift', 'bitand', 'bitor', 'bitxor', 'bitnot']) {
      expect(on.find(`[data-testid="op-${id}"]`).exists()).toBe(true)
    }
    expect(on.find('[data-testid="op-rshift"]').exists()).toBe(false)

    on.unmount()
  })

  it('toggles analysis operators individually and as a group', async () => {
    const single = mount(App)
    await single.find('[data-testid="enter-singleplayer"]').trigger('click')

    const group = single.find('[data-testid="toggle-group-analysis"]')
    expect(group.exists()).toBe(true)
    expect((group.element as HTMLInputElement).checked).toBe(false)

    // A single operator can be enabled while its group stays off.
    await single.find('[data-testid="toggle-op-exp"]').setValue(true)
    expect((group.element as HTMLInputElement).checked).toBe(false)
    expect((group.element as HTMLInputElement).indeterminate).toBe(true)
    await single.find('[data-testid="start-round-btn"]').trigger('click')
    expect(single.find('[data-testid="op-exp"]').exists()).toBe(true)
    expect(single.find('[data-testid="op-ln"]').exists()).toBe(false)
    expect(single.find('[data-testid="op-log"]').exists()).toBe(false)
    single.unmount()

    // The group switch turns all three on, and one can then be switched off again.
    const grouped = mount(App)
    await grouped.find('[data-testid="enter-singleplayer"]').trigger('click')
    await grouped.find('[data-testid="toggle-group-analysis"]').setValue(true)
    await grouped.find('[data-testid="toggle-op-ln"]').setValue(false)
    const groupedToggle = grouped.find('[data-testid="toggle-group-analysis"]')
      .element as HTMLInputElement
    expect(groupedToggle.checked).toBe(false)
    expect(groupedToggle.indeterminate).toBe(true)
    await grouped.find('[data-testid="start-round-btn"]').trigger('click')
    expect(grouped.find('[data-testid="op-exp"]').exists()).toBe(true)
    expect(grouped.find('[data-testid="op-log"]').exists()).toBe(true)
    expect(grouped.find('[data-testid="op-ln"]').exists()).toBe(false)
    grouped.unmount()
  })

  it('auto-enables Add when every operator is switched off', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    for (const id of ['basic', 'powers', 'factorial']) {
      await wrapper.find(`[data-testid="toggle-group-${id}"]`).setValue(false)
    }
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="op-add"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="op-sub"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('puts all five combinatorics operators behind one lobby group switch', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')

    const group = wrapper.find('[data-testid="toggle-group-combinatorics"]')
    expect(group.exists()).toBe(true)
    expect((group.element as HTMLInputElement).checked).toBe(false)

    await group.setValue(true)
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    for (const id of ['comb', 'perm', 'stirling2', 'dfact', 'subfact']) {
      expect(wrapper.find(`[data-testid="op-${id}"]`).exists()).toBe(true)
    }

    wrapper.unmount()
  })

  it('takes Multiplayer to the lobby selector, not straight into a room', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-multiplayer"]').trigger('click')
    await nextTick()

    // Name, create (public/private) and code entry all live on the selector.
    const nameInput = wrapper.find('[data-testid="mp-name-input"]')
    expect(nameInput.exists()).toBe(true)
    // A fresh player gets a playful placeholder, not the generic "Player".
    const defaultName = (nameInput.element as HTMLInputElement).value
    expect(defaultName).not.toBe('Player')
    expect(defaultName.length).toBeGreaterThan(3)
    expect(wrapper.find('[data-testid="lobby-create-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mp-room-input"]').exists()).toBe(true)
    // No seat yet: the table setup screen and its Deal button are not on screen.
    expect(wrapper.find('[data-testid="start-round-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="lobby-code"]').exists()).toBe(false)

    await wrapper.find('[data-testid="lobby-private-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="lobby-private-btn"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="lobby-public-btn"]').attributes('aria-pressed')).toBe('false')

    wrapper.unmount()
  })

  it('shows the lobby code and locks the board for a mid-round joiner', async () => {
    const host: LobbyPlayer = {
      id: 'p-host',
      name: 'Host',
      isHost: true,
      isReady: true,
      points: 0,
      bestRoundScore: null,
      connected: true,
      isWaiting: false,
    }
    const latecomer: LobbyPlayer = {
      id: 'p-late',
      name: 'Late',
      isHost: false,
      isReady: false,
      points: 0,
      bestRoundScore: null,
      connected: true,
      isWaiting: true,
    }
    const room = (overrides: Partial<RoomState> = {}): RoomState => ({
      code: 'ABCD',
      isPublic: false,
      createdAt: 1,
      revision: 1,
      phase: 'lobby',
      hostId: 'p-host',
      players: [host, latecomer],
      settings: createDefaultSettings(),
      round: null,
      matchWinnerIds: [],
      ...overrides,
    })

    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-multiplayer"]').trigger('click')
    await nextTick()

    multiplayerSession.status = 'connected'
    multiplayerSession.selfId = 'p-late'
    multiplayerSession.room = room()
    await nextTick()
    await nextTick()

    // The table screen names the code and whether the room is listed.
    expect(wrapper.find('[data-testid="lobby-code"]').text()).toBe('ABCD')
    expect(wrapper.find('[data-testid="lobby-identity"]').text()).toContain('PRIVATE')

    multiplayerSession.room = room({
      phase: 'playing',
      round: {
        number: 1,
        target: 24,
        hand: dealHand(4, '1-deck'),
        startedAt: Date.now(),
        deadline: null,
        solutions: [],
        winnerIds: [],
        endedReason: null,
      },
    })
    await nextTick()

    expect(wrapper.find('[data-testid="waiting-banner"]').exists()).toBe(true)
    expect(wrapper.find('.felt-table--waiting').exists()).toBe(true)

    // The hand is a spectator's view: clicking a piece does not pick it up.
    const pieces = wrapper.findAll('.expr-node--root')
    expect(pieces.length).toBeGreaterThan(0)
    await pieces[0]!.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.expr-node--selected').length).toBe(0)

    // The round-end standings explain why they have no board on the books.
    multiplayerSession.room = room({
      phase: 'round-end',
      round: {
        ...multiplayerSession.room!.round!,
        endedReason: 'timer',
      },
    })
    await nextTick()
    expect(wrapper.find('.standing-tag').text()).toBe('NEXT DEAL')

    wrapper.unmount()
    leaveRoom()
  })

  it('returns to the lobby from the match end screen before dealing again', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    // End Match closes the series immediately, with no board on the books.
    await wrapper.find('.sidebar-actions .btn-arcade--crimson').trigger('click')
    const finalScreen = wrapper.find('.screen-game-over')
    expect(finalScreen.exists()).toBe(true)
    expect(finalScreen.find('.gameover-joker').exists()).toBe(true)
    expect(finalScreen.text()).toContain('Match ended early')
    expect(finalScreen.findAll('.standing-card')).toHaveLength(1)

    // Play Again goes through the lobby so the next match can use new rules.
    const playAgain = finalScreen
      .findAll('.round-end-actions button')
      .find((button) => button.text() === 'Play Again')!
    await playAgain.trigger('click')
    expect(wrapper.find('.screen-lobby').exists()).toBe(true)
    expect(wrapper.find('.screen-playing').exists()).toBe(false)

    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')
    expect(wrapper.find('.screen-playing').exists()).toBe(true)
    expect(wrapper.findAll('.expr-node--root')).toHaveLength(4)

    wrapper.unmount()
  })

  it('returns from the lobby browser to the title screen with the shared frame', async () => {
    const wrapper = mount(App)
    await wrapper.find('[data-testid="enter-multiplayer"]').trigger('click')
    await nextTick()
    expect(wrapper.find('.screen-lobby').exists()).toBe(true)

    await wrapper.find('[data-testid="browser-back-btn"]').trigger('click')
    expect(wrapper.find('.screen-title').exists()).toBe(true)
    expect(wrapper.find('[data-testid="enter-singleplayer"]').exists()).toBe(true)

    wrapper.unmount()
  })
})
