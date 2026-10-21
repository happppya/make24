import { createDefaultBindRules } from './binds'
import { DEFAULT_FORBIDDEN_MOVES, DEFAULT_FORBIDDEN_MOVE_PENALTY } from './math'
import type { PuzzleDifficulty } from './puzzleDifficulty'
import type {
  BindRulesConfig,
  CardPoolMode,
  ForbiddenMovesConfig,
  OperatorCategory,
  OperatorId,
  SolutionScoringMode,
} from './types'

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
  /** Chaos recipes may target negative values; the default keeps targets above zero. */
  allowNegative?: boolean
  /** Chaos recipes may target fractions; the exact decimal target is retained. */
  allowFractional?: boolean
  disabledOperators?: OperatorId[]
  binds?: BindRulesConfig
  /** A bind-themed recipe only accepts hands that actually produce one. */
  requireBind?: boolean
}

export const ALL_OPERATOR_GROUPS: OperatorCategory[] = [
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
export const RECIPE_DEFAULTS = {
  approximationPercent: 0,
  scoringMode: 'cost-first' as SolutionScoringMode,
  forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES },
  forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
}

/** Compact bind rule builder: `[min, max, perDeal]`, or false for off. */
export function bindRules(
  dragon: false | [number, number, number],
  rook: false | [number, number, number],
): BindRulesConfig {
  const rules = createDefaultBindRules()
  if (dragon) {
    rules.dragon = {
      enabled: true,
      minCards: dragon[0],
      maxCards: dragon[1],
      maxPerDeal: dragon[2],
    }
  }
  if (rook) {
    rules.rook = { enabled: true, minCards: rook[0], maxCards: rook[1], maxPerDeal: rook[2] }
  }
  return rules
}
