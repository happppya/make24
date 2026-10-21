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

/** Calendar puzzles; `dungeon` is a fixed trial from the dungeon campaign. */
export type PuzzleKind = 'hourly' | 'daily' | 'daily-2' | 'weekly' | 'dungeon'
/** Calendar puzzles share one period-driven generator. */
export type PeriodicPuzzleKind = Exclude<PuzzleKind, 'dungeon'>

export type PuzzleDifficulty =
  | 'easy'
  | 'medium'
  | 'hard'
  | 'expert'
  | 'extreme'
  | 'confounding'
  | 'impossible'

export interface PuzzleDifficultyMeta {
  id: PuzzleDifficulty
  label: string
  /** Higher is harder; the dungeon ramp and tests use this. */
  rank: number
  accent: string
  blurb: string
}

/** The seven-step ladder every puzzle is ranked on, easiest first. */
export const PUZZLE_DIFFICULTIES: PuzzleDifficultyMeta[] = [
  { id: 'easy', label: 'EASY', rank: 0, accent: '#6fd68a', blurb: 'A loose hand and room to breathe.' },
  { id: 'medium', label: 'MEDIUM', rank: 1, accent: '#72efdd', blurb: 'Powers and factorials join the table.' },
  { id: 'hard', label: 'HARD', rank: 2, accent: '#ffbe0b', blurb: 'More cards, narrower routes, real detours.' },
  { id: 'expert', label: 'EXPERT', rank: 3, accent: '#ff9daa', blurb: 'Most of the cabinet, and it expects fluency.' },
  { id: 'extreme', label: 'EXTREME', rank: 4, accent: '#fe4a49', blurb: 'Seven cards or more, targets in the millions.' },
  { id: 'confounding', label: 'CONFOUNDING', rank: 5, accent: '#c77dff', blurb: 'Every shortcut is priced and the hand is hostile.' },
  { id: 'impossible', label: 'IMPOSSIBLE', rank: 6, accent: '#ff4fd8', blurb: 'Solvable. Barely. Bring a plan and a pencil.' },
]

const DIFFICULTY_BY_ID = new Map(PUZZLE_DIFFICULTIES.map((entry) => [entry.id, entry]))

export function puzzleDifficultyMeta(id: PuzzleDifficulty): PuzzleDifficultyMeta {
  return DIFFICULTY_BY_ID.get(id) ?? PUZZLE_DIFFICULTIES[0]!
}

export function difficultyRank(id: PuzzleDifficulty): number {
  return puzzleDifficultyMeta(id).rank
}

/** Short labels for badges, e.g. `HOURLY` / `DAILY I` / `WEEKLY`. */
export const PUZZLE_KIND_LABELS: Record<PuzzleKind, string> = {
  hourly: 'HOURLY',
  daily: 'DAILY I',
  'daily-2': 'DAILY II',
  weekly: 'WEEKLY',
  dungeon: 'DUNGEON',
}

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
  /** Recipe that shaped the hand, useful for previews and debugging. */
  recipeId: string
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
  /** Enabled opening binds, e.g. `Dragon 3–6 ×2` / `Rook 2 ×1`. */
  bindLabels: string[]
  /** Present only on dungeon trials. */
  dungeon?: {
    gauntletId: string
    gauntletName: string
    trialId: string
    /** 1-based position in the gauntlet. */
    trialNumber: number
    trialCount: number
  }
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

export interface PuzzleRecipe {
  id: string
  label: string
  difficulty: PuzzleDifficulty
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

const HOUR_MS = 3_600_000
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

const ALL_OPERATOR_GROUPS: OperatorCategory[] = [
  'basic',
  'powers',
  'factorial',
  'trig',
  'inverse',
  'computing',
  'concat',
  'analysis',
  'combinatorics',
]

/** Defaults shared by every recipe; each recipe overrides what it needs. */
const RECIPE_DEFAULTS = {
  approximationPercent: 0,
  scoringMode: 'cost-first' as SolutionScoringMode,
  forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES },
  forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
}

/** Compact bind rule builder: `[min, max, perDeal]`, or false for off. */
function bindRules(
  dragon: false | [number, number, number],
  rook: false | [number, number, number]
): BindRulesConfig {
  const rules = createDefaultBindRules()
  if (dragon) {
    rules.dragon = { enabled: true, minCards: dragon[0], maxCards: dragon[1], maxPerDeal: dragon[2] }
  }
  if (rook) {
    rules.rook = { enabled: true, minCards: rook[0], maxCards: rook[1], maxPerDeal: rook[2] }
  }
  return rules
}

/**
 * The full recipe cabinet. A recipe fixes the operator families, hand size,
 * target band and penalties for one puzzle; difficulty only decides which pool
 * the calendar draws from. Dungeon trials name their recipe directly.
 */
const RECIPES: PuzzleRecipe[] = [
  /* ---------------------------------- easy ---------------------------------- */
  {
    ...RECIPE_DEFAULTS,
    id: 'easy-first-light',
    label: 'First light',
    difficulty: 'easy',
    note: 'Three or four loose cards and plain arithmetic. The door is open.',
    groups: ['basic'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [3, 4],
    targetMin: 8,
    targetMax: 80,
    minOperators: 2,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'easy-small-change',
    label: 'Small change',
    difficulty: 'easy',
    note: 'A short hand where one root or power opens the obvious route.',
    groups: ['basic', 'powers'],
    cardPools: ['1-deck'],
    cardCounts: [3, 4],
    targetMin: 12,
    targetMax: 200,
    minOperators: 2,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'easy-short-hand',
    label: 'Short hand',
    difficulty: 'easy',
    note: 'Four cards, a reciprocal to spare and nothing too spiky.',
    groups: ['basic', 'powers', 'inverse'],
    cardPools: ['1-deck'],
    cardCounts: [4],
    targetMin: 16,
    targetMax: 240,
    minOperators: 2,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'easy-factorial',
    label: 'Small factorials',
    difficulty: 'easy',
    note: 'A small hand with a licence to grow it fast.',
    groups: ['basic', 'powers', 'factorial'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [3, 4],
    targetMin: 24,
    targetMax: 1_000,
    minOperators: 2,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'easy-signal',
    label: 'Bits and digits',
    difficulty: 'easy',
    note: 'Whole-number tricks only: shifts, bitwise gates and digit joins.',
    groups: ['basic', 'computing', 'concat'],
    cardPools: ['1-deck'],
    cardCounts: [3, 4],
    targetMin: 20,
    targetMax: 500,
    minOperators: 2,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'easy-observatory',
    label: 'Moonrise',
    difficulty: 'easy',
    note: 'A gentle first look through trig and powers.',
    groups: ['basic', 'powers', 'trig'],
    cardPools: ['1-deck'],
    cardCounts: [3, 4],
    targetMin: 12,
    targetMax: 360,
    minOperators: 2,
    disabledOperators: ['tan'],
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'easy-combinatorics',
    label: 'Pairs',
    difficulty: 'easy',
    note: 'Choose and arrange a small hand into a friendly target.',
    groups: ['basic', 'powers', 'combinatorics'],
    cardPools: ['1-deck'],
    cardCounts: [3, 4],
    targetMin: 10,
    targetMax: 500,
    minOperators: 2,
  },

  /* --------------------------------- medium --------------------------------- */
  {
    ...RECIPE_DEFAULTS,
    id: 'medium-classic',
    label: 'Classic',
    difficulty: 'medium',
    note: 'Four or five cards, clean arithmetic and a dragon at the deal.',
    groups: ['basic', 'powers', 'inverse'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [4, 5],
    targetMin: 20,
    targetMax: 2_000,
    minOperators: 3,
    binds: bindRules([3, 5, 1], false),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'medium-factorials',
    label: 'Factorials',
    difficulty: 'medium',
    note: 'A rook opens the deal; factorials close it.',
    groups: ['basic', 'powers', 'factorial'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [4, 5],
    targetMin: 120,
    targetMax: 200_000,
    minOperators: 4,
    binds: bindRules(false, [2, 4, 1]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'medium-machine',
    label: 'Machine',
    difficulty: 'medium',
    note: 'Build a number out of bits, shifts and digit joins.',
    groups: ['basic', 'computing', 'concat'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [4, 5],
    targetMin: 50,
    targetMax: 200_000,
    minOperators: 3,
    disabledOperators: ['bitnot'],
    binds: bindRules([3, 5, 1], false),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'medium-observatory',
    label: 'Observatory',
    difficulty: 'medium',
    note: 'Trig degrees, roots and one reciprocal route to the target.',
    groups: ['basic', 'powers', 'trig', 'inverse'],
    cardPools: ['1-deck'],
    cardCounts: [4, 5],
    targetMin: 30,
    targetMax: 50_000,
    minOperators: 3,
    disabledOperators: ['tan'],
    binds: bindRules([3, 5, 1], false),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'medium-combinatorics',
    label: 'Combinatorics',
    difficulty: 'medium',
    note: 'Choose, arrange and derange the hand into a target.',
    groups: ['basic', 'powers', 'combinatorics'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [4, 5],
    targetMin: 100,
    targetMax: 100_000,
    minOperators: 3,
    disabledOperators: ['subfact'],
    binds: bindRules(false, [2, 4, 1]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'medium-foundry',
    label: 'Foundry',
    difficulty: 'medium',
    note: 'Factorials and powers stacked on a rook, with a five-figure target.',
    groups: ['basic', 'powers', 'factorial', 'inverse'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [4, 5],
    targetMin: 500,
    targetMax: 500_000,
    minOperators: 4,
    binds: bindRules(false, [2, 4, 2]),
    requireBind: true,
  },

  /* ---------------------------------- hard ---------------------------------- */
  {
    ...RECIPE_DEFAULTS,
    id: 'hard-analysis',
    label: 'Analysis',
    difficulty: 'hard',
    note: 'Exponential growth, logarithms and one reciprocal route.',
    groups: ['basic', 'powers', 'analysis', 'inverse'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [4, 5],
    targetMin: 10,
    targetMax: 50_000,
    minOperators: 4,
    scoringMode: 'balanced',
    forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES, oneToPower: false },
    disabledOperators: ['tan'],
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'hard-combinatorics',
    label: 'Herd logic',
    difficulty: 'hard',
    note: 'Two locked groups and every counting operator in the cabinet.',
    groups: ['basic', 'powers', 'factorial', 'combinatorics'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [4, 5],
    targetMin: 100,
    targetMax: 500_000,
    minOperators: 4,
    scoringMode: 'balanced',
    forbiddenMoves: { factorialInvgamma: false, oneToPower: false },
    disabledOperators: ['subfact'],
    binds: bindRules([3, 5, 2], [2, 4, 2]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'hard-signal',
    label: 'Relay',
    difficulty: 'hard',
    note: 'Five cards, a dragon, and targets that only whole numbers can reach.',
    groups: ['basic', 'powers', 'computing', 'concat'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [5],
    targetMin: 100,
    targetMax: 500_000,
    minOperators: 4,
    binds: bindRules([3, 5, 2], false),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'hard-observatory',
    label: 'Parallax',
    difficulty: 'hard',
    note: 'Trig and logarithms share the eyepiece. Mind the domain errors.',
    groups: ['basic', 'powers', 'trig', 'inverse', 'analysis'],
    cardPools: ['1-deck'],
    cardCounts: [5],
    targetMin: 100,
    targetMax: 1_000_000,
    minOperators: 4,
    scoringMode: 'balanced',
    disabledOperators: ['tan'],
    binds: bindRules([3, 5, 1], false),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'hard-factorial',
    label: 'Anvil hour',
    difficulty: 'hard',
    note: 'Five or six cards and enough factorial weight to bend the target.',
    groups: ['basic', 'powers', 'factorial', 'combinatorics'],
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [5, 6],
    targetMin: 500,
    targetMax: 1_000_000,
    minOperators: 5,
    binds: bindRules(false, [2, 4, 2]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'hard-vault',
    label: 'First lock',
    difficulty: 'hard',
    note: 'Every card starts welded into a bind. Work from the groups you are given.',
    groups: ['basic', 'powers', 'factorial', 'computing', 'concat'],
    cardPools: ['2-decks', '3-decks'],
    cardCounts: [5, 6],
    targetMin: 200,
    targetMax: 1_000_000,
    minOperators: 4,
    binds: bindRules([3, 5, 2], [2, 4, 2]),
    requireBind: true,
  },

  /* --------------------------------- expert --------------------------------- */
  {
    ...RECIPE_DEFAULTS,
    id: 'expert-deep-end',
    label: 'Deep end',
    difficulty: 'expert',
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
    minOperators: 7,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
    forbiddenMovePenalty: 250,
    disabledOperators: ['gamma'],
    binds: bindRules([3, 5, 2], [2, 4, 2]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'expert-cabinet',
    label: 'The whole cabinet',
    difficulty: 'expert',
    note: 'Every operator family is live. Six or seven cards, no training wheels.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['1-deck', '2-decks'],
    cardCounts: [6, 7],
    targetMin: 10_000,
    targetMax: 9_999_999,
    minOperators: 8,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 300,
    disabledOperators: ['tan'],
    binds: bindRules([3, 5, 3], [2, 4, 3]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'expert-signal',
    label: 'Long wire',
    difficulty: 'expert',
    note: 'Six cards of shifts, joins and logarithms, with two binds at the deal.',
    groups: ['basic', 'powers', 'computing', 'concat', 'analysis'],
    cardPools: ['2-decks', 'unlimited'],
    cardCounts: [6],
    targetMin: 5_000,
    targetMax: 2_000_000,
    minOperators: 6,
    scoringMode: 'balanced',
    binds: bindRules([3, 5, 2], [2, 4, 2]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'expert-observatory',
    label: 'Event horizon',
    difficulty: 'expert',
    note: 'Trig, analysis and factorials aimed at a seven-figure sky.',
    groups: ['basic', 'powers', 'trig', 'inverse', 'analysis', 'factorial'],
    cardPools: ['1-deck', 'unlimited'],
    cardCounts: [6],
    targetMin: 1_000,
    targetMax: 2_000_000,
    minOperators: 6,
    scoringMode: 'balanced',
    disabledOperators: ['tan'],
    binds: bindRules([3, 5, 2], false),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'expert-menagerie',
    label: 'Stirling cage',
    difficulty: 'expert',
    note: 'A rook of duplicates and every way to count them.',
    groups: ['basic', 'powers', 'factorial', 'combinatorics', 'analysis'],
    cardPools: ['2-decks', '3-decks'],
    cardCounts: [6],
    targetMin: 2_000,
    targetMax: 2_000_000,
    minOperators: 6,
    disabledOperators: ['subfact'],
    binds: bindRules(false, [2, 4, 2]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'expert-vault',
    label: 'The escapement',
    difficulty: 'expert',
    note: 'Six or seven cards welded into up to three opening groups.',
    groups: ['basic', 'powers', 'factorial', 'computing', 'concat'],
    cardPools: ['2-decks', '3-decks'],
    cardCounts: [6, 7],
    targetMin: 1_000,
    targetMax: 2_000_000,
    minOperators: 5,
    forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
    forbiddenMovePenalty: 250,
    binds: bindRules([3, 5, 3], [2, 4, 3]),
    requireBind: true,
  },

  /* --------------------------------- extreme -------------------------------- */
  {
    ...RECIPE_DEFAULTS,
    id: 'extreme-cabinet',
    label: 'Pressure',
    difficulty: 'extreme',
    note: 'Seven cards, the whole cabinet, and a dragon and rook already fused.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['2-decks', '3-decks'],
    cardCounts: [7],
    targetMin: 100_000,
    targetMax: 9_999_999,
    minOperators: 8,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 300,
    disabledOperators: ['tan'],
    binds: bindRules([3, 5, 3], [2, 4, 3]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'extreme-abyss',
    label: 'Black tide',
    difficulty: 'extreme',
    note: 'Eight cards. Every family. Both forbidden shortcuts are live and expensive.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['2-decks', '3-decks', 'unlimited'],
    cardCounts: [8],
    targetMin: 500_000,
    targetMax: 9_999_999,
    minOperators: 9,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 300,
    binds: bindRules([3, 5, 3], [2, 4, 3]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'extreme-observatory',
    label: 'The quiet sky',
    difficulty: 'extreme',
    note: 'Seven cards aimed by trig, analysis and counting operators.',
    groups: ['basic', 'powers', 'trig', 'inverse', 'analysis', 'combinatorics'],
    cardPools: ['2-decks', 'unlimited'],
    cardCounts: [7],
    targetMin: 100_000,
    targetMax: 5_000_000,
    minOperators: 8,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
    forbiddenMovePenalty: 250,
    disabledOperators: ['tan'],
    binds: bindRules([3, 5, 2], [2, 4, 2]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'extreme-signal',
    label: 'Dead channel',
    difficulty: 'extreme',
    note: 'Seven cards of bits, joins and logarithms. Whole numbers or nothing.',
    groups: ['basic', 'powers', 'computing', 'concat', 'analysis'],
    cardPools: ['2-decks', '3-decks'],
    cardCounts: [7],
    targetMin: 100_000,
    targetMax: 5_000_000,
    minOperators: 8,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
    forbiddenMovePenalty: 250,
    binds: bindRules([3, 5, 2], [2, 4, 2]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'extreme-vault',
    label: 'Master key',
    difficulty: 'extreme',
    note: 'Up to four locked groups before you press a single operator.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['3-decks', 'unlimited'],
    cardCounts: [7],
    targetMin: 100_000,
    targetMax: 5_000_000,
    minOperators: 7,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 300,
    binds: bindRules([3, 5, 4], [2, 4, 4]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'extreme-menagerie',
    label: 'Ringmaster',
    difficulty: 'extreme',
    note: 'Seven cards of arrangements, derangements and digit joins.',
    groups: ['basic', 'powers', 'factorial', 'combinatorics', 'analysis', 'concat'],
    cardPools: ['2-decks', '3-decks'],
    cardCounts: [7],
    targetMin: 50_000,
    targetMax: 5_000_000,
    minOperators: 8,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
    forbiddenMovePenalty: 250,
    disabledOperators: ['subfact'],
    binds: bindRules([3, 5, 3], [2, 4, 3]),
    requireBind: true,
  },

  /* ------------------------------- confounding ------------------------------ */
  {
    ...RECIPE_DEFAULTS,
    id: 'confounding-almanac',
    label: 'Fractured almanac',
    difficulty: 'confounding',
    note: 'Eight cards, every operator, and both forbidden moves charging 400.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['2-decks', '3-decks', 'unlimited'],
    cardCounts: [8],
    targetMin: 1_000_000,
    targetMax: 9_999_999,
    minOperators: 9,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 400,
    binds: bindRules([3, 5, 3], [2, 4, 3]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'confounding-ninth',
    label: 'The ninth door',
    difficulty: 'confounding',
    note: 'Eight or nine cards and a five-hundred-point toll on every shortcut.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['3-decks', 'unlimited'],
    cardCounts: [8, 9],
    targetMin: 2_000_000,
    targetMax: 9_999_999,
    minOperators: 10,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 500,
    binds: bindRules([3, 5, 3], [2, 4, 3]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'confounding-void',
    label: 'Nothing answers',
    difficulty: 'confounding',
    note: 'Nine cards, four binds and a six-hundred-point penalty lurking in the dark.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['3-decks', 'unlimited'],
    cardCounts: [9],
    targetMin: 3_000_000,
    targetMax: 9_999_999,
    minOperators: 10,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 600,
    binds: bindRules([3, 5, 4], [2, 4, 4]),
    requireBind: true,
  },

  /* -------------------------------- impossible ------------------------------- */
  {
    ...RECIPE_DEFAULTS,
    id: 'impossible-meridian',
    label: 'Null meridian',
    difficulty: 'impossible',
    note: 'Nine cards, every operator, both binds capped at four and an 800-point toll.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['3-decks', 'unlimited'],
    cardCounts: [9],
    targetMin: 5_000_000,
    targetMax: 9_999_999,
    minOperators: 11,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 800,
    binds: bindRules([3, 5, 4], [2, 4, 4]),
    requireBind: true,
  },
  {
    ...RECIPE_DEFAULTS,
    id: 'impossible-echo',
    label: 'Abyss eternal',
    difficulty: 'impossible',
    note: 'The last door: nine cards, every trap armed, and a four-figure penalty.',
    groups: ALL_OPERATOR_GROUPS,
    cardPools: ['3-decks', 'unlimited'],
    cardCounts: [9],
    targetMin: 3_000_000,
    targetMax: 9_999_999,
    minOperators: 11,
    scoringMode: 'accuracy-first',
    forbiddenMoves: { factorialInvgamma: true, oneToPower: true },
    forbiddenMovePenalty: 1_000,
    binds: bindRules([3, 5, 4], [2, 4, 4]),
    requireBind: true,
  },
]

const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]))

/** Recipes grouped by the difficulty their calendar slot draws from. */
const RECIPES_BY_DIFFICULTY = new Map<PuzzleDifficulty, PuzzleRecipe[]>(
  PUZZLE_DIFFICULTIES.map((difficulty) => [
    difficulty.id,
    RECIPES.filter((recipe) => recipe.difficulty === difficulty.id),
  ])
)

export function puzzleRecipe(id: string): PuzzleRecipe | undefined {
  return RECIPE_BY_ID.get(id)
}

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

const HOURLY_ADJECTIVES = [
  'Quick',
  'Brass',
  'Spry',
  'Brief',
  'Lucky',
  'Ticking',
  'Minute',
  'Chiming',
  'Short',
  'Nimble',
  'Warm',
  'Brisk',
  'Little',
  'Silver',
]

const HOURLY_NOUNS = [
  'Bell',
  'Coin',
  'Flick',
  'Match',
  'Cup',
  'Lamp',
  'Key',
  'Step',
  'Spark',
  'Whistle',
  'Page',
  'Door',
  'Tune',
  'Stitch',
  'Turn',
  'Note',
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

/**
 * Stable UTC period for a calendar puzzle: a civil hour, a civil day (both
 * dailies share the day but not the kind), or an ISO week.
 */
export function puzzlePeriod(kind: PeriodicPuzzleKind, now: Date = new Date()): PuzzlePeriod {
  if (kind === 'hourly') {
    const start = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS)
    const startsAt = start.getTime()
    return {
      key: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}T${pad(start.getUTCHours())}`,
      startsAt,
      endsAt: startsAt + HOUR_MS,
    }
  }

  if (kind === 'daily' || kind === 'daily-2') {
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

/** `hourly:2026-10-20T14` / `daily-2:2026-10-19`, shared by local and server boards. */
export function puzzleLeaderboardKey(puzzle: Pick<PuzzleDefinition, 'kind' | 'key'>): string {
  return `${puzzle.kind}:${puzzle.key}`
}

/** One deterministic board per period; screens can mount without a re-search. */
const puzzleCache = new Map<string, PuzzleDefinition>()

interface PuzzleBuildRequest {
  kind: PuzzleKind
  key: string
  name: string
  difficulty: PuzzleDifficulty
  recipe: PuzzleRecipe
  seed: string
  startsAt: number
  endsAt: number
}

/** Shared generator behind calendar puzzles and dungeon trials. */
function buildPuzzle(request: PuzzleBuildRequest): PuzzleDefinition {
  const { kind, recipe } = request
  const rng = mulberry32(hashSeed(request.seed))

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
        approxValue <= 0 ||
        !Number.isInteger(approxValue) ||
        approxValue < recipe.targetMin ||
        approxValue > recipe.targetMax ||
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
        value <= 0 ||
        !Number.isInteger(value) ||
        value < recipe.targetMin ||
        value > recipe.targetMax
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
    // change must never make the challenge impossible. A simple all-cards fold
    // is the last resort; it needs one binary operator that accepts any pair of
    // hand values, which is what Add does. Add is switched on in the puzzle's
    // own rules as well, so the fallback board stays a legal player board
    // instead of relying on every recipe remembering to enable Basic.
    allowedOperators.basic = true
    allowedOperators.operators.add = true
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
    key: request.key,
    name: request.name,
    difficulty: request.difficulty,
    difficultyNote: recipe.note,
    recipeId: recipe.id,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
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
  return puzzle
}

/**
 * The difficulty a calendar slot asks for. Hourly and daily puzzles stay on the
 * easy end; the weekly trial always sits on the high end of the ladder.
 */
function difficultyForPeriod(kind: PeriodicPuzzleKind, index: number): PuzzleDifficulty {
  switch (kind) {
    case 'hourly':
      return index % 5 === 4 ? 'medium' : 'easy'
    case 'daily':
      return index % 3 === 2 ? 'medium' : 'easy'
    case 'daily-2':
      return index % 4 === 3 ? 'hard' : 'medium'
    case 'weekly': {
      const ladder: PuzzleDifficulty[] = [
        'expert',
        'extreme',
        'confounding',
        'extreme',
        'expert',
        'extreme',
        'confounding',
        'impossible',
      ]
      return ladder[index % ladder.length]!
    }
  }
}

/** Builds the calendar puzzle for one UTC period. Fully deterministic. */
export function createPuzzle(kind: PeriodicPuzzleKind, now: Date = new Date()): PuzzleDefinition {
  const period = puzzlePeriod(kind, now)
  const cacheKey = `${kind}:${period.key}`
  const cached = puzzleCache.get(cacheKey)
  if (cached) return cached

  const index = periodIndex(kind, period.startsAt)
  const difficulty = difficultyForPeriod(kind, index)
  const pool = RECIPES_BY_DIFFICULTY.get(difficulty) ?? RECIPES
  const recipe = pool[index % pool.length]!
  const puzzle = buildPuzzle({
    kind,
    key: period.key,
    name: puzzleName(kind, period),
    difficulty,
    recipe,
    seed: `make24:${kind}:${period.key}`,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
  })
  puzzleCache.set(cacheKey, puzzle)
  return puzzle
}

export interface DungeonPuzzleRequest {
  gauntletId: string
  gauntletName: string
  trialId: string
  /** 1-based position in the gauntlet, for the play header. */
  trialNumber: number
  trialCount: number
  title: string
  difficulty: PuzzleDifficulty
  recipeId: string
}

/**
 * Builds one fixed dungeon trial. The trial id and gauntlet seed the generator,
 * so a trial is identical for every player and every run. Returns null only if
 * the content names a recipe that no longer exists.
 */
export function createDungeonPuzzle(
  request: DungeonPuzzleRequest
): PuzzleDefinition | null {
  const recipe = RECIPE_BY_ID.get(request.recipeId)
  if (!recipe) return null
  const key = `${request.gauntletId}/${request.trialId}`
  const cacheKey = `dungeon:${key}`
  const cached = puzzleCache.get(cacheKey)
  if (cached) return cached

  const puzzle = buildPuzzle({
    kind: 'dungeon',
    key,
    name: request.title,
    difficulty: request.difficulty,
    recipe,
    seed: `make24:dungeon:${key}`,
    startsAt: 0,
    endsAt: 0,
  })
  puzzle.dungeon = {
    gauntletId: request.gauntletId,
    gauntletName: request.gauntletName,
    trialId: request.trialId,
    trialNumber: request.trialNumber,
    trialCount: request.trialCount,
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

function puzzleName(kind: PeriodicPuzzleKind, period: PuzzlePeriod): string {
  const [adjectives, nouns] =
    kind === 'weekly'
      ? [WEEKLY_ADJECTIVES, WEEKLY_NOUNS]
      : kind === 'hourly'
        ? [HOURLY_ADJECTIVES, HOURLY_NOUNS]
        : [DAILY_ADJECTIVES, DAILY_NOUNS]
  const seed = hashSeed(`name:${kind}:${period.key}`)
  const adjective = adjectives[seed % adjectives.length]!
  const noun = nouns[Math.floor(seed / adjectives.length) % nouns.length]!
  // The full period ordinal guarantees a new name even after the word lists
  // cycle; three digits would repeat after 1,000 days. Both dailies share a
  // date, so their ordinals are interleaved to keep the names distinct even
  // when the word lists land on the same pairing.
  const index = periodIndex(kind, period.startsAt)
  const ordinal = kind === 'daily' ? index * 2 : kind === 'daily-2' ? index * 2 + 1 : index
  return `${adjective} ${noun} ${String(ordinal).padStart(3, '0')}`
}

/* --------------------------------- calendar --------------------------------- */

function periodIndex(kind: PeriodicPuzzleKind, startsAt: number): number {
  if (kind === 'hourly') return Math.floor(startsAt / HOUR_MS)
  if (kind === 'daily' || kind === 'daily-2') return Math.floor(startsAt / DAY_MS)
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
