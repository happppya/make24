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
} from './math'
import { sanitizeSolutionTree } from '../multiplayer/solutionTree'
import type {
  AllowedOperatorsConfig,
  BinaryOperator,
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
  hand: Card[]
  settings: GameSettings
  /** Effective groups, in catalog order, for a compact rules summary. */
  operatorGroups: OperatorCategory[]
  operatorGroupLabels: string[]
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
}

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
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

/** Builds the puzzle for one UTC period. The result is fully deterministic. */
export function createPuzzle(kind: PuzzleKind, now: Date = new Date()): PuzzleDefinition {
  const period = puzzlePeriod(kind, now)
  const seed = hashSeed(`make24:${kind}:${period.key}`)
  const rng = mulberry32(seed)
  const recipes = kind === 'daily' ? DAILY_RECIPES : WEEKLY_RECIPES
  const recipe =
    recipes[periodIndex(kind, period.startsAt) % recipes.length]!

  const cardCount = recipe.cardCounts[Math.floor(rng() * recipe.cardCounts.length)]!
  const cardPool = recipe.cardPools[Math.floor(rng() * recipe.cardPools.length)]!
  const allowedOperators = buildAllowedOperators(recipe.groups, recipe.disabledOperators)

  let hand: Card[] = []
  let referenceSolution: ExprNode | null = null
  let target = 0

  for (let handAttempt = 0; handAttempt < MAX_HAND_ATTEMPTS && !referenceSolution; handAttempt += 1) {
    hand = dealHand(cardCount, cardPool, rng)
    for (let attempt = 0; attempt < MAX_EXPRESSION_ATTEMPTS; attempt += 1) {
      const candidate = buildExpression(hand, allowedOperators, recipe, rng)
      if (!candidate) continue
      const value = candidate.value
      if (
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        Math.abs(value) < recipe.targetMin ||
        Math.abs(value) > recipe.targetMax ||
        countOperators(candidate) < recipe.minOperators
      ) {
        continue
      }
      referenceSolution = candidate
      target = value
      break
    }
  }

  if (!referenceSolution) {
    // The deterministic search is deliberately generous, but a future recipe
    // change must never make the mode unplayable. A simple all-cards fold is a
    // valid last resort and still gives every card a role.
    const fallback = buildFallbackExpression(hand, allowedOperators)
    referenceSolution = fallback
    target = fallback.value
  }

  const settings = settingsForPuzzle(recipe, hand.length, cardPool, allowedOperators, target)
  const enabled = getEnabledOperators(allowedOperators)
  const operatorGroups = OPERATOR_GROUPS.filter((group) =>
    enabled.some((op) => op.category === group.id)
  ).map((group) => group.id)

  return {
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
    referenceSolution,
  }
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
  const expression = sanitizeSolutionTree(rawExpression, puzzle.hand)
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
  hand: Card[],
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

  let nodes = hand.map(cardNode)
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
        const result = applyBinaryOperator(op, left.value, right.value)
        if (!result.ok || !acceptableValue(result.value)) continue
        next = {
          kind: 'binary',
          id: `puzzle-binary-${attempt}`,
          operator: op,
          left,
          right,
          value: result.value,
          headerText: result.headerText,
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
    const result = applyUnaryOperator(op, node.value)
    if (!result.ok || !acceptableValue(result.value)) continue
    const value = result.value
    if (value === node.value) continue
    return {
      kind: 'unary',
      id: `puzzle-unary-${op}-${node.id}`,
      operator: op,
      operand: node,
      value,
      headerText: result.headerText,
    }
  }
  return null
}

function buildFallbackExpression(
  hand: Card[],
  allowed: AllowedOperatorsConfig
): ExprNode {
  const nodes = hand.map(cardNode)
  const binaryOps = getEnabledOperators(allowed).filter((op) => op.arity === 'binary')
  if (nodes.length === 0) {
    // Defensive only: every recipe deals at least four cards.
    return {
      kind: 'card',
      id: 'puzzle-empty',
      card: { id: 'empty', rank: 1, suit: 'clubs', value: 1, label: 'A', spritePath: '' },
      value: 1,
    }
  }
  const preferred: BinaryOperator[] = ['mult', 'add']
  for (const wanted of preferred) {
    if (!binaryOps.some((op) => op.id === wanted)) continue
    let current = nodes[0]!
    let valid = true
    for (let i = 1; i < nodes.length; i += 1) {
      const result = applyBinaryOperator(wanted, current.value, nodes[i]!.value)
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
        headerText: result.headerText,
      }
    }
    if (valid) return current
  }

  // Absolute last resort: additions always exist for every recipe.
  let current = nodes[0]!
  for (let i = 1; i < nodes.length; i += 1) {
    const result = applyBinaryOperator('add', current.value, nodes[i]!.value)
    current = {
      kind: 'binary',
      id: `puzzle-fallback-add-${i}`,
      operator: 'add',
      left: current,
      right: nodes[i]!,
      value: result.value,
      headerText: result.headerText,
    }
  }
  return current
}

function cardNode(card: Card): ExprNode {
  return {
    kind: 'card',
    id: `puzzle-card-${card.id}`,
    card,
    value: card.value,
  }
}

function acceptableValue(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_TARGET_MAGNITUDE && Math.abs(value) > 1e-9
}

function countOperators(node: ExprNode): number {
  if (node.kind === 'card') return 0
  if (node.kind === 'unary') return 1 + countOperators(node.operand)
  return 1 + countOperators(node.left) + countOperators(node.right)
}

function usesOnlyEnabledOperators(
  node: ExprNode,
  allowed: AllowedOperatorsConfig
): boolean {
  if (node.kind === 'card') return true
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
  target: number
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
