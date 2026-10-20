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
  | 'bitshift'
  | 'concat'

export type BinaryOperator =
  | 'add'
  | 'sub'
  | 'mult'
  | 'div'
  | 'pow'
  | 'root'
  | 'lshift'
  | 'rshift'
  | 'concat'

export type UnaryOperator =
  | 'fact'
  | 'gamma'
  | 'invgamma'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'inv'

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

export type TargetPreset = 'just-24' | 'small' | 'big' | 'custom' | 'manual'

export type CardPoolMode = '1-deck' | '2-decks' | '3-decks' | 'unlimited'

/** How a solution's accuracy is traded against its operator cost. */
export type SolutionScoringMode = 'cost-first' | 'balanced' | 'accuracy-first'

export interface AllowedOperatorsConfig {
  basic: boolean
  powers: boolean
  factorial: boolean
  trig: boolean
  inverse: boolean
  bitshift: boolean
  concat: boolean
}

/** Shortcut moves the host can forbid, and charge a penalty for. */
export interface ForbiddenMovesConfig {
  /** `!` stacked directly on `Γ⁻¹`, or the other way round. */
  factorialInvgamma: boolean
  /** A power whose base is 1, e.g. `1 ^ 5`. */
  oneToPower: boolean
}

export interface GameSettings {
  isMultiplayer: boolean
  mode: GameMode
  numCards: number
  targetPreset: TargetPreset
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
  firstToPoints: number
}

export interface CardLeafNode {
  kind: 'card'
  id: string
  card: Card
  value: number
}

export interface UnaryGroupNode {
  kind: 'unary'
  id: string
  operator: UnaryOperator
  operand: ExprNode
  value: number
  headerText: string
}

export interface BinaryGroupNode {
  kind: 'binary'
  id: string
  operator: BinaryOperator
  left: ExprNode
  right: ExprNode
  value: number
  headerText: string
}

export type ExprNode = CardLeafNode | UnaryGroupNode | BinaryGroupNode

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
  | 'lobby-select'
  | 'lobby'
  | 'playing'
  | 'round-end'
  | 'game-over'
