import { approxBinary, approxUnary, type ApproxResult } from './approxMath'
import { bindRuleLabels, createBoundGroups, createDefaultBindRules } from './binds'
import { dealHand } from './deck'
import {
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
import type { PuzzleDifficulty } from './puzzleDifficulty'
import { puzzleRecipe, recipesForDifficulty } from './puzzleRecipes'
import type { PuzzleRecipe } from './recipeKit'
import type {
  AllowedOperatorsConfig,
  BinaryOperator,
  BindRulesConfig,
  Card,
  CardPoolMode,
  ExprNode,
  GameSettings,
  OperatorCategory,
  OperatorId,
  OperatorMeta,
  UnaryOperator,
} from './types'

export {
  PUZZLE_DIFFICULTIES,
  difficultyRank,
  puzzleDifficultyMeta,
  type PuzzleDifficulty,
  type PuzzleDifficultyMeta,
} from './puzzleDifficulty'
export { puzzleRecipe } from './puzzleRecipes'
export type { PuzzleRecipe } from './recipeKit'

/** Calendar puzzles; `dungeon` is a fixed trial from the dungeon campaign. */
export type PuzzleKind = 'hourly' | 'daily' | 'daily-2' | 'weekly' | 'dungeon'
/** Calendar puzzles share one period-driven generator. */
export type PeriodicPuzzleKind = Exclude<PuzzleKind, 'dungeon'>

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
   * prove the puzzle is playable; the UI shows it only after submission or a
   * dungeon give-up reveal.
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
  // Chaos themes are narrower than "any positive whole number", so they get
  // more deals before the fallback board (which cannot honour a sign or a
  // fraction) has to step in.
  const wantsNarrowTarget =
    recipe.allowNegative || recipe.allowFractional || recipe.targetMin >= 10_000_000
  const maxHandAttempts = recipe.requireBind ? 160 : wantsNarrowTarget ? 300 : MAX_HAND_ATTEMPTS

  let hand: Card[] = []
  let startingNodes: ExprNode[] = []
  let referenceSolution: ExprNode | null = null
  let target = 0
  let targetExact: string | undefined

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
      if (
        !recipeAcceptsValue(candidate.value, recipe) ||
        countOperators(candidate) < requiredOperators
      ) {
        continue
      }

      // The search runs on fast doubles; only an accepted tree is replayed at
      // full Decimal precision and becomes the puzzle's reference solution.
      const rebuilt = exactifyNode(candidate)
      if (!rebuilt) continue
      const value = rebuilt.value
      if (!recipeAcceptsValue(value, recipe)) continue
      referenceSolution = rebuilt
      target = value
      if (recipe.allowFractional) targetExact = rebuilt.exactValue
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
    if (recipe.allowFractional) targetExact = fallback.exactValue
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
    ...(targetExact ? { targetExact } : {}),
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
  const pool = recipesForDifficulty(difficulty)
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
  const recipe = puzzleRecipe(request.recipeId)
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
  puzzle: Pick<PuzzleDefinition, 'hand' | 'target' | 'targetExact' | 'settings'>,
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
    nodeExactValue(expression),
    puzzle.targetExact ?? puzzle.target,
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

/**
 * A candidate becomes a target only if it matches the recipe's sign and target
 * band. Positive whole numbers are the norm; Chaos recipes may ask for
 * fractions or negative values instead.
 */
function recipeAcceptsValue(value: number, recipe: PuzzleRecipe): boolean {
  if (!Number.isFinite(value)) return false
  if (recipe.allowNegative) {
    if (value >= 0) return false
  } else if (value <= 0) {
    return false
  }
  if (!recipe.allowFractional && !Number.isInteger(value)) return false
  return value >= recipe.targetMin && value <= recipe.targetMax
}

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
    decimalMin: target,
    decimalMax: target,
    decimalPlaces: 2,
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
