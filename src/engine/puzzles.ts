import { approxBinary, approxUnary, type ApproxResult } from './approxMath'
import { bindRuleLabels, createBoundGroups, createDefaultBindRules } from './binds'
import { dealHand } from './deck'
import {
  DEFAULT_FORBIDDEN_MOVES,
  DEFAULT_FORBIDDEN_MOVE_PENALTY,
  OPERATOR_CATALOG,
  OPERATOR_GROUPS,
  applyBinaryOperator,
  applyUnaryOperator,
  calculateScoreBreakdown,
  checkTargetAcceptance,
  formatExpressionLhs,
  formatFullEquation,
  getEnabledOperators,
  isOperatorEnabled,
  nodeExactValue,
} from './math'
import { sanitizeSolutionTree } from '../multiplayer/solutionTree'
import type {
  AllowedOperatorsConfig,
  BinaryOperator,
  BindRulesConfig,
  Card,
  CardPoolMode,
  ExprNode,
  ForbiddenMovesConfig,
  GameSettings,
  OperatorCategory,
  OperatorId,
  OperatorMeta,
  SolutionScoringMode,
  UnaryOperator,
} from './types'

export type PuzzleKind = 'daily' | 'weekly'
export type PuzzleDifficulty = 'medium' | 'extreme'

export interface PuzzlePeriod {
  key: string
  startsAt: number
  endsAt: number
}

export interface PuzzleDefinition {
  kind: PuzzleKind
  key: string
  name: string
  difficulty: PuzzleDifficulty
  difficultyNote: string
  startsAt: number
  endsAt: number
  target: number
  /** Canonical target for generated fractional puzzles; integers omit it. */
  targetExact?: string
  hand: Card[]
  settings: GameSettings
  /** Effective groups, in catalog order, for a compact rules summary. */
  operatorGroups: OperatorCategory[]
  operatorGroupLabels: string[]
  /** Enabled opening binds, e.g. `Dragon 3+` / `Rook 2+`. */
  bindLabels: string[]
  /**
   * A deterministic solution generated alongside the target. It is used to
   * prove the puzzle is playable and is never shown by the UI before submission.
   */
  referenceSolution: ExprNode
}

export interface PuzzleLeaderboardEntry {
  playerName: string
  score: number
  equation: string
  lhs: string
  finalValue: number
  submittedAt: number
}

export type PuzzleAttempt =
  | {
      ok: true
      lhs: string
      equation: string
      finalValue: number
      score: number
    }
  | { ok: false; error: string }

interface PuzzleRecipe {
  label: string
  note: string
  groups: OperatorCategory[]
  cardPools: CardPoolMode[]
  cardCounts: number[]
  targetMin: number
  targetMax: number
  minOperators: number
  approximationPercent: number
  scoringMode: SolutionScoringMode
  forbiddenMoves: ForbiddenMovesConfig
  forbiddenMovePenalty: number
  disabledOperators?: OperatorId[]
  binds?: BindRulesConfig
  /** A bind-themed recipe only accepts hands that actually produce one. */
  requireBind?: boolean
}

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

/**
 * The deterministic search evaluates the same operand pairs over and over.
 * Caching pure operator results keeps weekly generation fast now that each
 * operation runs at Decimal precision.
 */
const unaryEvalCache = new Map<string, ApproxResult>()
const binaryEvalCache = new Map<string, ApproxResult>()
const EVAL_CACHE_LIMIT = 50_000

function cachedUnary(op: UnaryOperator, node: ExprNode): ApproxResult {
  const key = `${op}|${node.value}`
  const cached = unaryEvalCache.get(key)
  if (cached) return cached
  if (unaryEvalCache.size >= EVAL_CACHE_LIMIT) unaryEvalCache.clear()
  const result = approxUnary(op, node.value)
  unaryEvalCache.set(key, result)
  return result
}

function cachedBinary(op: BinaryOperator, left: ExprNode, right: ExprNode): ApproxResult {
  const key = `${op}|${left.value}|${right.value}`
  const cached = binaryEvalCache.get(key)
  if (cached) return cached
  if (binaryEvalCache.size >= EVAL_CACHE_LIMIT) binaryEvalCache.clear()
  const result = approxBinary(op, left.value, right.value)
  binaryEvalCache.set(key, result)
  return result
}

/** Replays the search's winning tree through the exact Decimal operators. */
function exactifyNode(node: ExprNode): ExprNode | null {
  if (node.kind === 'card') {
    return { ...node, exactValue: nodeExactValue(node) }
  }
  if (node.kind === 'bind') return node
  if (node.kind === 'unary') {
    const operand = exactifyNode(node.operand)
    if (!operand) return null
    const result = applyUnaryOperator(node.operator, nodeExactValue(operand))
    if (!result.ok) return null
    return {
      kind: 'unary',
      id: node.id,
      operator: node.operator,
      operand,
      value: result.value,
      exactValue: result.exactValue,
      headerText: result.headerText,
    }
  }
  const left = exactifyNode(node.left)
  const right = exactifyNode(node.right)
  if (!left || !right) return null
  const result = applyBinaryOperator(
    node.operator,
    nodeExactValue(left),
    nodeExactValue(right)
  )
  if (!result.ok) return null
  return {
    kind: 'binary',
    id: node.id,
    operator: node.operator,
    left,
    right,
    value: result.value,
    exactValue: result.exactValue,
    headerText: result.headerText,
  }
}
const MAX_TARGET_MAGNITUDE = 1e9
const MAX_HAND_ATTEMPTS = 14
const MAX_EXPRESSION_ATTEMPTS = 28

const DAILY_RECIPES: PuzzleRecipe[] = [
  {
    label: 'Classic',
    note: 'Four or five cards, clean arithmetic, one root or power to spare.',
    groups: ['basic', 'powers', 'inverse'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [4, 5],
    targetMin: 20,
    targetMax: 2_000,
    minOperators: 3,
    approximationPercent: 0,
    scoringMode: 'cost-first',
    forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES },
    forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
    binds: {
      dragon: { enabled: true, required: 3 },
      rook: { enabled: false, required: 2 },
      maxBinds: 1,
    },
    requireBind: true,
  },
  {
    label: 'Factorials',
    note: 'A small hand with a licence to grow it fast.',
    groups: ['basic', 'powers', 'factorial'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [4, 5],
    targetMin: 120,
    targetMax: 200_000,
    minOperators: 4,
    approximationPercent: 0,
    scoringMode: 'cost-first',
    forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES },
    forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
    binds: {
      dragon: { enabled: false, required: 3 },
      rook: { enabled: true, required: 2 },
      maxBinds: 1,
    },
    requireBind: true,
  },
  {
    label: 'Analysis',
    note: 'Exponential growth, logarithms and one reciprocal route.',
    groups: ['basic', 'powers', 'analysis', 'inverse'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [4, 5],
    targetMin: 10,
    targetMax: 50_000,
    minOperators: 4,
    approximationPercent: 0,
    scoringMode: 'balanced',
    forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES, oneToPower: false },
    forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
    disabledOperators: ['tan'],
  },
  {
    label: 'Machine',
    note: 'Build a number out of bits, shifts and digit joins.',
    groups: ['basic', 'computing', 'concat'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [4, 5],
    targetMin: 50,
    targetMax: 200_000,
    minOperators: 3,
    approximationPercent: 0,
    scoringMode: 'cost-first',
    forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES },
    forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
    disabledOperators: ['bitnot'],
    binds: {
      dragon: { enabled: true, required: 3 },
      rook: { enabled: false, required: 2 },
      maxBinds: 1,
    },
    requireBind: true,
  },
  {
    label: 'Combinatorics',
    note: 'Choose, arrange and derange the hand into a target.',
    groups: ['basic', 'powers', 'factorial', 'combinatorics'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [4, 5],
    targetMin: 100,
    targetMax: 500_000,
    minOperators: 4,
    approximationPercent: 0,
    scoringMode: 'balanced',
    forbiddenMoves: {
      factorialInvgamma: false,
      oneToPower: false,
    },
    forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
    disabledOperators: ['subfact'],
    binds: {
      dragon: { enabled: true, required: 3 },
      rook: { enabled: true, required: 2 },
      maxBinds: 2,
    },
    requireBind: true,
  },
]

const WEEKLY_RECIPES: PuzzleRecipe[] = [
  {
    label: 'The whole cabinet',
    note: 'Every operator family is live. Seven or eight cards, no training wheels.',
    groups: [
      'basic',
      'powers',
      'factorial',
      'trig',
      'inverse',
      'computing',
      'concat',
      'analysis',
      'combinatorics',
    ],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [7, 8],
    targetMin: 10_000,
    targetMax: 9_999_999,
    minOperators: 9,
    approximationPercent: 0,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 300,
    disabledOperators: ['tan'],
    binds: {
      dragon: { enabled: true, required: 3 },
      rook: { enabled: true, required: 2 },
      maxBinds: 3,
    },
    requireBind: true,
  },
  {
    label: 'Deep end',
    note: 'Six or seven cards, exotic operators, and a target in the millions.',
    groups: [
      'basic',
      'powers',
      'factorial',
      'inverse',
      'computing',
      'concat',
      'analysis',
      'combinatorics',
    ],
    cardPools: ['2-decks', '3-decks', 'unlimited'],
    cardCounts: [6, 7],
    targetMin: 50_000,
    targetMax: 9_999_999,
    minOperators: 8,
    approximationPercent: 0,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
    forbiddenMovePenalty: 250,
    disabledOperators: ['gamma'],
    binds: {
      dragon: { enabled: true, required: 3 },
      rook: { enabled: true, required: 2 },
      maxBinds: 2,
    },
    requireBind: true,
  },
]

const DAILY_ADJECTIVES = [
  'Quiet',
  'Copper',
  'Velvet',
  'Salt',
  'Amber',
  'Hollow',
  'Bright',
  'Crooked',
  'Gilded',
  'Bitter',
  'Lucky',
  'Narrow',
  'Wandering',
  'Sable',
  'Paper',
  'Glass',
  'Patient',
  'Royal',
]

const DAILY_NOUNS = [
  'Lantern',
  'Gambit',
  'Ledger',
  'Compass',
  'Almanac',
  'Bridge',
  'Garden',
  'Signal',
  'Thicket',
  'Parade',
  'Cipher',
  'Harbor',
  'Kettle',
  'Orchard',
  'Parlor',
  'Riddle',
  'Stair',
  'Window',
]

const WEEKLY_ADJECTIVES = [
  'Obsidian',
  'Fractured',
  'Impossible',
  'Molten',
  'Starless',
  'Feral',
  'Colossal',
  'Whispering',
  'Ruinous',
  'Clockwork',
  'Abyssal',
  'Crowned',
  'Restless',
  'Iron',
  'Sealed',
  'Midnight',
]

const WEEKLY_NOUNS = [
  'Cathedral',
  'Labyrinth',
  'Engine',
  'Obelisk',
  'Tempest',
  'Archive',
  'Spire',
  'Mirage',
  'Foundry',
  'Abyss',
  'Orrery',
  'Citadel',
  'Mosaic',
  'Meridian',
  'Reliquary',
  'Vault',
]

/** Stable UTC period for a puzzle kind: a civil day or an ISO week. */
export function puzzlePeriod(kind: PuzzleKind, now: Date = new Date()): PuzzlePeriod {
  if (kind === 'daily') {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )
    const startsAt = start.getTime()
    return {
      key: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`,
      startsAt,
      endsAt: startsAt + DAY_MS,
    }
  }

  const iso = isoWeek(now)
  const monday = new Date(Date.UTC(iso.year, 0, 4))
  const day = monday.getUTCDay() || 7
  monday.setUTCDate(monday.getUTCDate() - day + 1 + (iso.week - 1) * 7)
  const startsAt = monday.getTime()
  return {
    key: `${iso.year}-W${pad(iso.week)}`,
    startsAt,
    endsAt: startsAt + WEEK_MS,
  }
}

/** `daily:2026-10-19` / `weekly:2026-W43`, shared by local and server boards. */
export function puzzleLeaderboardKey(puzzle: Pick<PuzzleDefinition, 'kind' | 'key'>): string {
  return `${puzzle.kind}:${puzzle.key}`
}

/** One deterministic board per period; screens can mount without a re-search. */
const puzzleCache = new Map<string, PuzzleDefinition>()

/** Builds the puzzle for one UTC period. The result is fully deterministic. */
export function createPuzzle(kind: PuzzleKind, now: Date = new Date()): PuzzleDefinition {
  const period = puzzlePeriod(kind, now)
  const cacheKey = `${kind}:${period.key}`
  const cached = puzzleCache.get(cacheKey)
  if (cached) return cached
  const seed = hashSeed(`make24:${kind}:${period.key}`)
  const rng = mulberry32(seed)
  const recipes = kind === 'daily' ? DAILY_RECIPES : WEEKLY_RECIPES
  const recipe =
    recipes[periodIndex(kind, period.startsAt) % recipes.length]!

  const cardCount = recipe.cardCounts[Math.floor(rng() * recipe.cardCounts.length)]!
  const cardPool = recipe.cardPools[Math.floor(rng() * recipe.cardPools.length)]!
  const allowedOperators = buildAllowedOperators(recipe.groups, recipe.disabledOperators)
  const bindRules = recipe.binds ?? createDefaultBindRules()
  // Bind recipes keep re-dealing until the opening groups actually appear; the
  // deterministic RNG makes this reproducible, and a bindless fallback is only
  // a last resort for a future recipe that makes the search impossible.
  const maxHandAttempts = recipe.requireBind ? 160 : MAX_HAND_ATTEMPTS

  let hand: Card[] = []
  let startingNodes: ExprNode[] = []
  let referenceSolution: ExprNode | null = null
  let target = 0

  for (let handAttempt = 0; handAttempt < maxHandAttempts && !referenceSolution; handAttempt += 1) {
    hand = dealHand(cardCount, cardPool, rng)
    startingNodes = createBoundGroups(hand, bindRules)
    const bindCount = startingNodes.filter((group) => group.kind === 'bind').length
    if (recipe.requireBind && bindCount === 0) continue
    // A bind does the work of several merges without spending operators, so the
    // recipe's difficulty floor drops for the hands it fuses at the deal.
    const requiredOperators = Math.max(1, recipe.minOperators - bindCount * 2)
    for (let attempt = 0; attempt < MAX_EXPRESSION_ATTEMPTS; attempt += 1) {
      const candidate = buildExpression(startingNodes, allowedOperators, recipe, rng)
      if (!candidate) continue
      const approxValue = candidate.value
      if (
        !Number.isFinite(approxValue) ||
        !Number.isInteger(approxValue) ||
        Math.abs(approxValue) < recipe.targetMin ||
        Math.abs(approxValue) > recipe.targetMax ||
        countOperators(candidate) < requiredOperators
      ) {
        continue
      }

      // The search runs on fast doubles; only an accepted tree is replayed at
      // full Decimal precision and becomes the puzzle's reference solution.
      const rebuilt = exactifyNode(candidate)
      if (!rebuilt) continue
      const value = rebuilt.value
      if (
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        Math.abs(value) < recipe.targetMin ||
        Math.abs(value) > recipe.targetMax
      ) {
        continue
      }
      referenceSolution = rebuilt
      target = value
      break
    }
  }

  if (!referenceSolution) {
    // The deterministic search is deliberately generous, but a future recipe
    // change must never make the mode unplayable. A simple all-cards fold is a
    // valid last resort and still gives every card a role.
    const fallback = buildFallbackExpression(createBoundGroups(hand, bindRules), allowedOperators)
    referenceSolution = fallback
    target = fallback.value
  }

  const settings = settingsForPuzzle(
    recipe,
    hand.length,
    cardPool,
    allowedOperators,
    target,
    bindRules
  )
  const enabled = getEnabledOperators(allowedOperators)
  const operatorGroups = OPERATOR_GROUPS.filter((group) =>
    enabled.some((op) => op.category === group.id)
  ).map((group) => group.id)

  const puzzle: PuzzleDefinition = {
    kind,
    key: period.key,
    name: puzzleName(kind, period),
    difficulty: kind === 'daily' ? 'medium' : 'extreme',
    difficultyNote: recipe.note,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    target,
    hand,
    settings,
    operatorGroups,
    operatorGroupLabels: OPERATOR_GROUPS.filter((group) => operatorGroups.includes(group.id)).map(
      (group) => group.label
    ),
    bindLabels: bindRuleLabels(bindRules),
    referenceSolution,
  }
  puzzleCache.set(cacheKey, puzzle)
  return puzzle
}

/**
 * Rebuilds and scores a player's board against a puzzle. Like the table server,
 * this never trusts a claimed score: the expression is replayed over the dealt
 * hand, every card must appear exactly once, and only enabled operators count.
 */
export function validatePuzzleAttempt(
  puzzle: Pick<PuzzleDefinition, 'hand' | 'target' | 'settings'>,
  rawExpression: unknown
): PuzzleAttempt {
  const expression = sanitizeSolutionTree(rawExpression, puzzle.hand, puzzle.settings.binds)
  if (!expression) {
    return {
      ok: false,
      error: 'Use every dealt card exactly once in one finished board.',
    }
  }
  if (!usesOnlyEnabledOperators(expression, puzzle.settings.allowedOperators)) {
    return { ok: false, error: 'That board uses an operator this puzzle turned off.' }
  }

  const check = checkTargetAcceptance(
    expression.value,
    puzzle.target,
    puzzle.settings.approximationPercent
  )
  if (!check.acceptable) {
    return { ok: false, error: 'That board is not within the target tolerance.' }
  }

  const score = calculateScoreBreakdown(
    expression,
    {
      errorPercent: check.errorPercent,
      approximationPercent: puzzle.settings.approximationPercent,
      mode: puzzle.settings.scoringMode,
    },
    {
      moves: puzzle.settings.forbiddenMoves,
      penalty: puzzle.settings.forbiddenMovePenalty,
    }
  ).total

  return {
    ok: true,
    lhs: formatExpressionLhs(expression),
    equation: formatFullEquation(expression),
    finalValue: expression.value,
    score,
  }
}

/** Compares two attempts the way the global board does: lower is better. */
export function sortPuzzleLeaderboard(
  entries: PuzzleLeaderboardEntry[]
): PuzzleLeaderboardEntry[] {
  return [...entries].sort(
    (a, b) => a.score - b.score || a.submittedAt - b.submittedAt || a.playerName.localeCompare(b.playerName)
  )
}

/* --------------------------- expression generation --------------------------- */

function buildExpression(
  startingNodes: ExprNode[],
  allowed: AllowedOperatorsConfig,
  recipe: PuzzleRecipe,
  rng: () => number
): ExprNode | null {
  const binaryOps = getEnabledOperators(allowed)
    .filter((op) => op.arity === 'binary')
    .map((op) => op.id as BinaryOperator)
  const unaryOps = getEnabledOperators(allowed)
    .filter((op) => op.arity === 'unary')
    .map((op) => op.id as UnaryOperator)
  if (binaryOps.length === 0) return null

  // Binds are already fused by the deal, so the generator builds on top of the
  // actual starting groups instead of pretending the hand is still loose cards.
  let nodes = [...startingNodes]
  const targetLead = recipe.targetMin > 1000 ? 0.35 : 0.55

  // A few cards get a head start with a unary operator. This breaks the "plain
  // arithmetic only" rhythm of a target without forcing every hand into a
  // factorial-first shape.
  for (let i = 0; i < nodes.length; i += 1) {
    if (rng() > targetLead) continue
    const wrapped = tryUnary(nodes[i]!, unaryOps, rng)
    if (wrapped) nodes[i] = wrapped
  }

  while (nodes.length > 1) {
    let next: ExprNode | null = null
    for (let attempt = 0; attempt < 14 && !next; attempt += 1) {
      const leftIdx = Math.floor(rng() * nodes.length)
      let rightIdx = Math.floor(rng() * nodes.length)
      if (leftIdx === rightIdx) rightIdx = (rightIdx + 1) % nodes.length
      const left = nodes[leftIdx]!
      const right = nodes[rightIdx]!

      for (const op of shuffled(binaryOps, rng)) {
        const result = cachedBinary(op, left, right)
        if (!result.ok || !acceptableValue(result.value)) continue
        next = {
          kind: 'binary',
          id: `puzzle-binary-${attempt}`,
          operator: op,
          left,
          right,
          value: result.value,
          exactValue: String(result.value),
          headerText: '',
        }
        const high = Math.max(leftIdx, rightIdx)
        const low = Math.min(leftIdx, rightIdx)
        nodes.splice(high, 1)
        nodes.splice(low, 1)
        nodes.push(next)
        break
      }
    }
    if (!next) return null

    if (unaryOps.length > 0 && rng() < 0.22) {
      const wrapped = tryUnary(nodes[nodes.length - 1]!, unaryOps, rng)
      if (wrapped) nodes[nodes.length - 1] = wrapped
    }
  }

  return nodes[0] ?? null
}

function tryUnary(
  node: ExprNode,
  unaryOps: UnaryOperator[],
  rng: () => number
): ExprNode | null {
  for (const op of shuffled(unaryOps, rng)) {
    const result = cachedUnary(op, node)
    if (!result.ok || !acceptableValue(result.value)) continue
    if (result.value === node.value) continue
    return {
      kind: 'unary',
      id: `puzzle-unary-${op}-${node.id}`,
      operator: op,
      operand: node,
      value: result.value,
      exactValue: String(result.value),
      headerText: '',
    }
  }
  return null
}

function buildFallbackExpression(
  startingNodes: ExprNode[],
  allowed: AllowedOperatorsConfig
): ExprNode {
  const nodes = [...startingNodes]
  const binaryOps = getEnabledOperators(allowed).filter((op) => op.arity === 'binary')
  if (nodes.length === 0) {
    // Defensive only: every recipe deals at least four cards.
    return {
      kind: 'card',
      id: 'puzzle-empty',
      card: { id: 'empty', rank: 1, suit: 'clubs', value: 1, label: 'A', spritePath: '' },
      value: 1,
      exactValue: '1',
    }
  }
  const preferred: BinaryOperator[] = ['mult', 'add']
  for (const wanted of preferred) {
    if (!binaryOps.some((op) => op.id === wanted)) continue
    let current = nodes[0]!
    let valid = true
    for (let i = 1; i < nodes.length; i += 1) {
      const result = applyBinaryOperator(
        wanted,
        nodeExactValue(current),
        nodeExactValue(nodes[i]!)
      )
      if (!result.ok || !acceptableValue(result.value)) {
        valid = false
        break
      }
      current = {
        kind: 'binary',
        id: `puzzle-fallback-${wanted}-${i}`,
        operator: wanted,
        left: current,
        right: nodes[i]!,
        value: result.value,
        exactValue: result.exactValue,
        headerText: result.headerText,
      }
    }
    if (valid) return current
  }

  // Absolute last resort: additions always exist for every recipe.
  let current = nodes[0]!
  for (let i = 1; i < nodes.length; i += 1) {
    const result = applyBinaryOperator(
      'add',
      nodeExactValue(current),
      nodeExactValue(nodes[i]!)
    )
    current = {
      kind: 'binary',
      id: `puzzle-fallback-add-${i}`,
      operator: 'add',
      left: current,
      right: nodes[i]!,
      value: result.value,
      exactValue: result.exactValue,
      headerText: result.headerText,
    }
  }
  return current
}

function acceptableValue(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_TARGET_MAGNITUDE && Math.abs(value) > 1e-9
}

function countOperators(node: ExprNode): number {
  if (node.kind === 'card' || node.kind === 'bind') return 0
  if (node.kind === 'unary') return 1 + countOperators(node.operand)
  return 1 + countOperators(node.left) + countOperators(node.right)
}

function usesOnlyEnabledOperators(
  node: ExprNode,
  allowed: AllowedOperatorsConfig
): boolean {
  if (node.kind === 'card' || node.kind === 'bind') return true
  const meta = OPERATOR_CATALOG.find((op) => op.id === node.operator)
  if (!meta || !isOperatorEnabled(allowed, meta)) return false
  if (node.kind === 'unary') return usesOnlyEnabledOperators(node.operand, allowed)
  return usesOnlyEnabledOperators(node.left, allowed) && usesOnlyEnabledOperators(node.right, allowed)
}

/* ------------------------------- puzzle setup ------------------------------- */

function settingsForPuzzle(
  recipe: PuzzleRecipe,
  numCards: number,
  cardPool: CardPoolMode,
  allowedOperators: AllowedOperatorsConfig,
  target: number,
  binds: BindRulesConfig
): GameSettings {
  return {
    isMultiplayer: false,
    mode: 'first-to-solve',
    numCards,
    targetPreset: 'custom',
    targetConstant: 'random',
    customMin: target,
    customMax: target,
    manualTarget: target,
    approximationPercent: recipe.approximationPercent,
    scoringMode: recipe.scoringMode,
    cardPool,
    allowedOperators,
    forbiddenMoves: { ...recipe.forbiddenMoves },
    forbiddenMovePenalty: recipe.forbiddenMovePenalty,
    binds: {
      dragon: { ...binds.dragon },
      rook: { ...binds.rook },
      maxBinds: binds.maxBinds,
    },
    firstToPoints: 1,
  }
}

function buildAllowedOperators(
  groups: OperatorCategory[],
  disabledOperators: OperatorId[] = []
): AllowedOperatorsConfig {
  const config: AllowedOperatorsConfig = {
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
  for (const group of groups) config[group] = true
  for (const op of disabledOperators) config.operators[op] = false
  return config
}

/* ---------------------------------- naming ---------------------------------- */

function puzzleName(kind: PuzzleKind, period: PuzzlePeriod): string {
  const adjectives = kind === 'daily' ? DAILY_ADJECTIVES : WEEKLY_ADJECTIVES
  const nouns = kind === 'daily' ? DAILY_NOUNS : WEEKLY_NOUNS
  const seed = hashSeed(`name:${kind}:${period.key}`)
  const adjective = adjectives[seed % adjectives.length]!
  const noun = nouns[Math.floor(seed / adjectives.length) % nouns.length]!
  // The full period ordinal guarantees a new name even after the word lists
  // cycle; three digits would repeat after 1,000 days.
  const ordinal = periodIndex(kind, period.startsAt)
  return `${adjective} ${noun} ${String(ordinal).padStart(3, '0')}`
}

/* --------------------------------- calendar --------------------------------- */

function periodIndex(kind: PuzzleKind, startsAt: number): number {
  if (kind === 'daily') return Math.floor(startsAt / DAY_MS)
  return Math.floor((startsAt - Date.UTC(2020, 0, 6)) / WEEK_MS)
}

function isoWeek(date: Date): { year: number; week: number } {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const year = value.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((value.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return { year, week }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/* ----------------------------------- rng ----------------------------------- */

function hashSeed(text: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/** Re-exported for screens that want to show an operator's display name. */
export type { OperatorMeta }
