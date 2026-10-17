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

export type BinaryOperator =
  | 'add'
  | 'sub'
  | 'mult'
  | 'div'
  | 'pow'
  | 'root'
  | 'lshift'
  | 'rshift'

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

export interface AllowedOperatorsConfig {
  basic: boolean
  powers: boolean
  factorial: boolean
  trig: boolean
  inverse: boolean
  bitshift: boolean
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
  cardPool: CardPoolMode
  allowedOperators: AllowedOperatorsConfig
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
}

export interface PlayerInfo {
  id: string
  name: string
  isHost: boolean
  isReady: boolean
  points: number
  bestRoundScore: number | null
}

export type ScreenPhase = 'title' | 'lobby' | 'playing' | 'round-end' | 'game-over'
