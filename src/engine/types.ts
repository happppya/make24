import type { ConstantChoice } from './constants'

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades'

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

export interface Card {
  id: string
  rank: Rank
  suit: Suit
  value: number
  label: string
  spritePath: string
}

export type OperatorCategory =
  | 'basic'
  | 'powers'
  | 'factorial'
  | 'trig'
  | 'inverse'
  | 'computing'
  | 'concat'
  | 'analysis'
  | 'combinatorics'

export type BinaryOperator =
  | 'add'
  | 'sub'
  | 'mult'
  | 'div'
  | 'pow'
  | 'root'
  | 'lshift'
  | 'bitand'
  | 'bitor'
  | 'bitxor'
  | 'concat'
  | 'log'
  | 'comb'
  | 'perm'
  | 'stirling2'

export type UnaryOperator =
  | 'fact'
  | 'gamma'
  | 'invgamma'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'inv'
  | 'bitnot'
  | 'exp'
  | 'ln'
  | 'dfact'
  | 'subfact'

export type OperatorId = BinaryOperator | UnaryOperator

export interface OperatorMeta {
  id: OperatorId
  arity: 'unary' | 'binary'
  category: OperatorCategory
  label: string
  shortSymbol: string
  description: string
  hotkey?: string
}

export type GameMode =
  | 'first-to-solve'
  | 'best-30s'
  | 'best-1m'
  | 'best-3m'
  | 'best-5m'
  | 'best-10m'

export type TargetPreset = 'just-24' | 'small' | 'big' | 'custom' | 'manual' | 'constant'

export type CardPoolMode = '1-deck' | '2-decks' | '3-decks' | 'unlimited'

/** How a solution's accuracy is traded against its operator cost. */
export type SolutionScoringMode = 'cost-first' | 'balanced' | 'accuracy-first'

export interface AllowedOperatorsConfig {
  basic: boolean
  powers: boolean
  factorial: boolean
  trig: boolean
  inverse: boolean
  computing: boolean
  concat: boolean
  analysis: boolean
  combinatorics: boolean
  /**
   * Per-operator overrides. A missing key follows its group boolean, so the
   * lobby can flip a whole group at once while still allowing one operator to
   * be left out.
   */
  operators: Partial<Record<OperatorId, boolean>>
}

/** Shortcut moves the host can forbid, and charge a penalty for. */
export interface ForbiddenMovesConfig {
  /** `!` stacked directly on `Γ⁻¹`, or the other way round. */
  factorialInvgamma: boolean
  /** A power whose base is 1, e.g. `1 ^ 5`. */
  oneToPower: boolean
}

/** Automatic opening groups that fuse cards before play starts. */
export type BindKind = 'dragon' | 'rook'

export interface BindRule {
  enabled: boolean
  /** Smallest group, in cards, that forms this bind. */
  minCards: number
  /** Largest group this bind may form; longer runs and stacks are trimmed. */
  maxCards: number
  /** Most groups of this kind formed in one deal. */
  maxPerDeal: number
}

export interface BindRulesConfig {
  /** Priority 1: consecutive ranks, one card from each rank. */
  dragon: BindRule
  /** Priority 2: every copy of one rank. */
  rook: BindRule
}

export interface GameSettings {
  isMultiplayer: boolean
  mode: GameMode
  numCards: number
  targetPreset: TargetPreset
  /** Which famous constant to deal when `targetPreset` is `constant`. */
  targetConstant: ConstantChoice
  customMin: number
  customMax: number
  manualTarget: number
  approximationPercent: number
  /** Only bites when `approximationPercent` is above zero. */
  scoringMode: SolutionScoringMode
  cardPool: CardPoolMode
  allowedOperators: AllowedOperatorsConfig
  /** Which shortcut moves carry the forbidden-move penalty. */
  forbiddenMoves: ForbiddenMovesConfig
  /** Points added for each forbidden move in a solution. */
  forbiddenMovePenalty: number
  /** Automatic opening groups formed from the dealt hand. */
  binds: BindRulesConfig
  firstToPoints: number
}

export interface CardLeafNode {
  kind: 'card'
  id: string
  card: Card
  value: number
  /** Canonical high-precision value; absent only on legacy payloads. */
  exactValue?: string
}

export interface UnaryGroupNode {
  kind: 'unary'
  id: string
  operator: UnaryOperator
  operand: ExprNode
  value: number
  exactValue?: string
  headerText: string
}

export interface BinaryGroupNode {
  kind: 'binary'
  id: string
  operator: BinaryOperator
  left: ExprNode
  right: ExprNode
  value: number
  exactValue?: string
  headerText: string
}

/**
 * A free opening group created by a bind. Its cards cannot be split apart; the
 * value is their product and no operator cost is charged.
 */
export interface BindGroupNode {
  kind: 'bind'
  id: string
  bind: BindKind
  cards: CardLeafNode[]
  value: number
  exactValue?: string
  headerText: string
}

export type ExprNode = CardLeafNode | UnaryGroupNode | BinaryGroupNode | BindGroupNode

export interface GroupPosition {
  x: number
  y: number
}

export interface WorkspaceSnapshot {
  groups: ExprNode[]
  positions: Record<string, GroupPosition>
  selectedGroupId: string | null
  pendingOperator: BinaryOperator | null
}

export interface WorkspaceState {
  index: number
  groups: ExprNode[]
  positions: Record<string, GroupPosition>
  /**
   * Group ids in ascending render order: the last entry is drawn on top.
   * Selecting or picking up a piece moves it to the end, so a card the player
   * just touched never slips underneath the one they laid it over.
   */
  stackOrder: string[]
  panX: number
  panY: number
  selectedGroupId: string | null
  pendingOperator: BinaryOperator | null
  undoStack: WorkspaceSnapshot[]
  redoStack: WorkspaceSnapshot[]
}

export interface SubmittedSolution {
  id: string
  playerId: string
  playerName: string
  equation: string
  lhs: string
  finalValue: number
  /** Full-precision board value, when the submission carried a card tree. */
  finalValueExact?: string
  score: number
  errorPercent: number
  timestampMs: number
  workspaceIndex: number
  /** The winning board in card form; absent on older or minimal submissions. */
  expression?: ExprNode
}

export interface PlayerInfo {
  id: string
  name: string
  isHost: boolean
  isReady: boolean
  points: number
  bestRoundScore: number | null
  /** Multiplayer only: seated mid-round, so they are dealt in on the next one. */
  isWaiting?: boolean
}

export type ScreenPhase =
  | 'title'
  | 'puzzles'
  | 'lobby-select'
  | 'lobby'
  | 'playing'
  | 'round-end'
  | 'puzzle-result'
  | 'game-over'
