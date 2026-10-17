import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import {
  applyBinaryOperator,
  applyUnaryOperator,
  calculateScore,
  checkTargetAcceptance,
  formatExpressionLhs,
  formatFullEquation,
  realFactorial,
  realGamma,
} from './engine/math'
import { buildDeckPool, createCard, dealHand, generateTargetNumber } from './engine/deck'
import {
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
  undoWorkspace,
  ungroupInWorkspace,
} from './engine/workspace'
import type { Card } from './engine/types'

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

  it('adds 200-point penalty each time factorial and gamma are nested together', () => {
    const ws = createWorkspace(0, [sampleCards[1]!]) // card 3
    selectGroupInWorkspace(ws, ws.groups[0]!.id)

    // gamma(3) = 2 -> 1st unary = 10
    applyOperatorInWorkspace(ws, 'gamma')
    expect(calculateScore(ws.groups[0]!)).toBe(10)

    // factorial(gamma(3)) -> 2nd unary (20) + 200 nested penalty + 10 = 230
    applyOperatorInWorkspace(ws, 'fact')
    expect(calculateScore(ws.groups[0]!)).toBe(230)

    // gamma(factorial(gamma(3))) -> 3rd unary (30) + 200 nested penalty + 230 = 460
    applyOperatorInWorkspace(ws, 'gamma')
    expect(calculateScore(ws.groups[0]!)).toBe(460)
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
})

