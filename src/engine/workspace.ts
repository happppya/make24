import {
  applyBinaryOperator,
  applyUnaryOperator,
  calculateScoreBreakdown,
  checkTargetAcceptance,
  formatExpressionLhs,
  formatFullEquation,
  isUnaryOperator,
  type ForbiddenMoveRules,
} from './math'
import type {
  BinaryOperator,
  Card,
  CardLeafNode,
  ExprNode,
  GroupPosition,
  OperatorId,
  SolutionScoringMode,
  UnaryOperator,
  WorkspaceSnapshot,
  WorkspaceState,
} from './types'

export const WORKSPACE_COUNT = 5
export const DEFAULT_CARD_SPACING_X = 148
export const DEFAULT_CARD_SPACING_Y = 168
/** Dealt cards wrap onto a new row after this many, instead of one endless row. */
export const DEFAULT_CARDS_PER_ROW = 6
/** A bare card's on-felt footprint, used to centre the grid by its visible edges. */
export const DEFAULT_CARD_SLOT_WIDTH = 96
export const DEFAULT_CARD_SLOT_HEIGHT = 141

/** Vertical stagger applied to the right-hand piece when a group is split apart. */
export const UNGROUP_STAGGER_Y = 34

/**
 * Small random nudge for split-apart pieces.
 *
 * Ungrouping used to drop both halves on the same coordinates, so a split could
 * look like cards had vanished underneath each other. A little scatter keeps the
 * new cards visibly distinct without letting them fly across the felt.
 */
function ungroupScatter(): GroupPosition {
  const randomBetween = (min: number, max: number): number =>
    Math.round(min + Math.random() * (max - min))
  return {
    x: randomBetween(-14, 14),
    y: randomBetween(-16, 8),
  }
}

/** Roughly how close two groups can sit before they visually cover each other. */
const UNGROUP_MIN_GAP_X = 110
const UNGROUP_MIN_GAP_Y = 150

/**
 * Slides a split piece sideways until it no longer covers an existing group.
 * Without this, a freshly separated card can land right on top of a neighbour
 * that was already resting at the default slot, which reads as a lost card.
 * Hops follow the side the split is fanning towards, so dodging a neighbour
 * never throws the piece back across the parent.
 */
function findFreeSpot(
  base: GroupPosition,
  occupied: GroupPosition[],
  direction: 1 | -1
): GroupPosition {
  let candidate = base
  for (let attempt = 0; attempt < 8; attempt++) {
    const overlaps = occupied.some(
      (spot) =>
        Math.abs(spot.x - candidate.x) < UNGROUP_MIN_GAP_X &&
        Math.abs(spot.y - candidate.y) < UNGROUP_MIN_GAP_Y
    )
    if (!overlaps) return candidate
    candidate = { x: candidate.x + 132 * direction, y: candidate.y + 12 }
  }
  return candidate
}

let nextGroupIdCounter = 1

export function resetGroupIdCounter(): void {
  nextGroupIdCounter = 1
}

function nextNodeId(prefix: string): string {
  return `${prefix}-${nextGroupIdCounter++}`
}

export function cloneExprNode(node: ExprNode): ExprNode {
  if (node.kind === 'card') {
    return {
      kind: 'card',
      id: node.id,
      card: { ...node.card },
      value: node.value,
    }
  }
  if (node.kind === 'unary') {
    return {
      kind: 'unary',
      id: node.id,
      operator: node.operator,
      operand: cloneExprNode(node.operand),
      value: node.value,
      headerText: node.headerText,
    }
  }
  return {
    kind: 'binary',
    id: node.id,
    operator: node.operator,
    left: cloneExprNode(node.left),
    right: cloneExprNode(node.right),
    value: node.value,
    headerText: node.headerText,
  }
}

export function clonePositions(
  positions: Record<string, GroupPosition>
): Record<string, GroupPosition> {
  const copy: Record<string, GroupPosition> = {}
  for (const [key, pos] of Object.entries(positions)) {
    copy[key] = { x: pos.x, y: pos.y }
  }
  return copy
}

export function createInitialPositions(groups: ExprNode[]): Record<string, GroupPosition> {
  const positions: Record<string, GroupPosition> = {}
  const rows: ExprNode[][] = []
  for (let i = 0; i < groups.length; i += DEFAULT_CARDS_PER_ROW) {
    rows.push(groups.slice(i, i + DEFAULT_CARDS_PER_ROW))
  }

  // Rows are stacked downward and centred on the workspace origin. Centring the
  // full card boxes (not just their top-left corners) keeps the deal symmetric
  // around the origin the camera resets to.
  const blockHeight = Math.max(0, (rows.length - 1) * DEFAULT_CARD_SPACING_Y)
  const startY = Math.round(-(blockHeight + DEFAULT_CARD_SLOT_HEIGHT) / 2)

  rows.forEach((row, rowIdx) => {
    const totalWidth = Math.max(0, (row.length - 1) * DEFAULT_CARD_SPACING_X)
    const startX = Math.round(-(totalWidth + DEFAULT_CARD_SLOT_WIDTH) / 2)
    row.forEach((g, colIdx) => {
      positions[g.id] = {
        x: startX + colIdx * DEFAULT_CARD_SPACING_X,
        y: startY + rowIdx * DEFAULT_CARD_SPACING_Y,
      }
    })
  })
  return positions
}

export interface TidyGridOptions {
  /** Cards per row; defaults to the six-per-row deal. */
  columns?: number
  spacingX?: number
  spacingY?: number
  /** Measured group boxes, so the grid is centred by its visible edges. */
  slotSizes?: Record<string, { width: number; height: number }>
}

/**
 * Squares every group away into an even grid centred on the workspace origin.
 * Rows are centred too, so a partial last row still looks deliberate.
 * Returns false — recording no undo entry — when the board already sits on it.
 */
export function tidyWorkspaceGroups(
  ws: WorkspaceState,
  options: TidyGridOptions = {}
): boolean {
  const count = ws.groups.length
  if (count === 0) return false

  const spacingX = options.spacingX ?? DEFAULT_CARD_SPACING_X
  const spacingY = options.spacingY ?? DEFAULT_CARD_SPACING_Y
  const columns = Math.max(1, Math.min(count, Math.floor(options.columns ?? DEFAULT_CARDS_PER_ROW)))
  const blockWidth = (columns - 1) * spacingX
  const blockHeight = (Math.ceil(count / columns) - 1) * spacingY

  const next: Record<string, GroupPosition> = {}
  ws.groups.forEach((group, index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    next[group.id] = {
      x: Math.round(col * spacingX - blockWidth / 2),
      y: Math.round(row * spacingY - blockHeight / 2),
    }
  })

  // A slot's position is its top-left corner. When the caller can measure the
  // slots, shift the whole grid so the union of the card boxes (not the corners)
  // is centred on the origin. Without sizes, the corner grid is centred instead.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const group of ws.groups) {
    const pos = next[group.id]!
    const size = options.slotSizes?.[group.id]
    minX = Math.min(minX, pos.x)
    maxX = Math.max(maxX, pos.x + (size?.width ?? 0))
    minY = Math.min(minY, pos.y)
    maxY = Math.max(maxY, pos.y + (size?.height ?? 0))
  }
  if (Number.isFinite(minX) && Number.isFinite(minY)) {
    const shiftX = Math.round((minX + maxX) / 2)
    const shiftY = Math.round((minY + maxY) / 2)
    if (shiftX !== 0 || shiftY !== 0) {
      for (const group of ws.groups) {
        const pos = next[group.id]!
        pos.x -= shiftX
        pos.y -= shiftY
      }
    }
  }

  const alreadyTidy =
    Object.keys(ws.positions).length === count &&
    ws.groups.every((group) => {
      const pos = ws.positions[group.id]
      const target = next[group.id]!
      return pos !== undefined && pos.x === target.x && pos.y === target.y
    })
  if (alreadyTidy) return false

  pushUndoSnapshot(ws, createSnapshot(ws))
  // Replacing the map also drops positions left behind by groups that no longer exist.
  ws.positions = next
  return true
}

export function createSnapshot(ws: WorkspaceState): WorkspaceSnapshot {
  return {
    groups: ws.groups.map(cloneExprNode),
    positions: clonePositions(ws.positions),
    selectedGroupId: ws.selectedGroupId,
    pendingOperator: ws.pendingOperator,
  }
}

export function createInitialGroupsFromHand(hand: Card[]): CardLeafNode[] {
  return hand.map((card) => ({
    kind: 'card',
    id: `leaf-${card.id}`,
    card: { ...card },
    value: card.value,
  }))
}

export function createWorkspace(index: number, hand: Card[]): WorkspaceState {
  const groups = createInitialGroupsFromHand(hand)
  return {
    index,
    groups,
    positions: createInitialPositions(groups),
    stackOrder: groups.map((group) => group.id),
    panX: 0,
    panY: 0,
    selectedGroupId: null,
    pendingOperator: null,
    undoStack: [],
    redoStack: [],
  }
}

export function createAllWorkspaces(hand: Card[]): WorkspaceState[] {
  const list: WorkspaceState[] = []
  for (let i = 0; i < WORKSPACE_COUNT; i++) {
    list.push(createWorkspace(i, hand))
  }
  return list
}

export interface WorkspaceActionOutcome {
  changed: boolean
  completedGroup?: ExprNode
  error?: string
}

function pushUndoSnapshot(ws: WorkspaceState, snapshot: WorkspaceSnapshot): void {
  ws.undoStack.push(snapshot)
  ws.redoStack = []
}

export function getGroupPosition(ws: WorkspaceState, groupId: string, fallbackIndex = 0): GroupPosition {
  const existing = ws.positions[groupId]
  if (existing) return existing
  // Unknown groups fall back to the same wrapped grid the deal uses.
  const row = Math.floor(fallbackIndex / DEFAULT_CARDS_PER_ROW)
  const col = fallbackIndex % DEFAULT_CARDS_PER_ROW
  return {
    x: Math.round(col * DEFAULT_CARD_SPACING_X - DEFAULT_CARD_SLOT_WIDTH / 2),
    y: Math.round(row * DEFAULT_CARD_SPACING_Y - DEFAULT_CARD_SLOT_HEIGHT / 2),
  }
}

export function setGroupPosition(
  ws: WorkspaceState,
  groupId: string,
  x: number,
  y: number
): void {
  ws.positions[groupId] = { x: Math.round(x), y: Math.round(y) }
}

export function setWorkspacePan(ws: WorkspaceState, panX: number, panY: number): void {
  ws.panX = Math.round(panX)
  ws.panY = Math.round(panY)
}

/**
 * Lifts a group to the top of the board's stacking order. Selecting a card or
 * picking it up calls this, so the piece being handled always covers its
 * neighbours — and keeps covering them after it is dropped.
 */
export function bringGroupToFront(ws: WorkspaceState, groupId: string): void {
  const live = new Set(ws.groups.map((group) => group.id))
  // Dropping ids for groups that were merged away keeps the order from growing.
  ws.stackOrder = ws.stackOrder.filter((id) => live.has(id) && id !== groupId)
  if (live.has(groupId)) ws.stackOrder.push(groupId)
}

/** Ascending render rank; 0 is the bottom-most piece. */
export function getGroupStackRank(ws: WorkspaceState, groupId: string): number {
  const rank = ws.stackOrder.indexOf(groupId)
  return rank === -1 ? ws.stackOrder.length : rank
}

/** Re-adds any groups the stacking order has not seen yet (e.g. after undo). */
function syncStackOrder(ws: WorkspaceState): void {
  const live = new Set(ws.groups.map((group) => group.id))
  const next = ws.stackOrder.filter((id) => live.has(id))
  for (const group of ws.groups) {
    if (!next.includes(group.id)) next.push(group.id)
  }
  ws.stackOrder = next
}

/**
 * Handles clicking/selecting a card or group on the board:
 * - If no group is currently selected, selects `groupId`.
 * - If `groupId` is already selected and no binary operator is pending, deselects it
 *   (or keeps it selected if a binary operator is pending and user clicks it again to cancel).
 * - If another group is selected and a `pendingOperator` is active, executes
 *   the binary operation: first selected = left operand, second selected (`groupId`) = right operand.
 * - If another group is selected and NO `pendingOperator` is active, switches selection to `groupId`.
 */
export function selectGroupInWorkspace(
  ws: WorkspaceState,
  groupId: string
): WorkspaceActionOutcome {
  const targetIdx = ws.groups.findIndex((g) => g.id === groupId)
  if (targetIdx === -1) {
    return { changed: false, error: 'Card group not found.' }
  }

  // Whatever the player reached for now sits on top of the board.
  bringGroupToFront(ws, groupId)

  // Case 1: Nothing selected yet -> select this group
  if (!ws.selectedGroupId) {
    const snap = createSnapshot(ws)
    ws.selectedGroupId = groupId
    ws.pendingOperator = null
    pushUndoSnapshot(ws, snap)
    return { changed: true }
  }

  // Case 2: Clicking the already-selected group
  if (ws.selectedGroupId === groupId) {
    const snap = createSnapshot(ws)
    if (ws.pendingOperator) {
      // Cancel pending operator first, keep card selected
      ws.pendingOperator = null
    } else {
      ws.selectedGroupId = null
    }
    pushUndoSnapshot(ws, snap)
    return { changed: true }
  }

  // Case 3: Another group is selected, but no binary operator is pending -> switch selection
  if (!ws.pendingOperator) {
    const snap = createSnapshot(ws)
    ws.selectedGroupId = groupId
    pushUndoSnapshot(ws, snap)
    return { changed: true }
  }

  // Case 4: Another group is selected AND a binary operator is pending -> combine!
  const leftIdx = ws.groups.findIndex((g) => g.id === ws.selectedGroupId)
  if (leftIdx === -1) {
    ws.selectedGroupId = groupId
    ws.pendingOperator = null
    return { changed: true }
  }

  const leftNode = ws.groups[leftIdx]!
  const rightNode = ws.groups[targetIdx]!
  const op = ws.pendingOperator

  const evalRes = applyBinaryOperator(op, leftNode.value, rightNode.value)
  if (!evalRes.ok) {
    return { changed: false, error: evalRes.error ?? 'Invalid binary operation.' }
  }

  const snap = createSnapshot(ws)
  const leftPos = getGroupPosition(ws, leftNode.id, leftIdx)
  const newGroup: ExprNode = {
    kind: 'binary',
    id: nextNodeId('bin'),
    operator: op,
    left: cloneExprNode(leftNode),
    right: cloneExprNode(rightNode),
    value: evalRes.value,
    headerText: evalRes.headerText,
  }

  // Replace the left operand in-place and remove the right operand so board position feels stable
  const nextGroups: ExprNode[] = []
  for (let i = 0; i < ws.groups.length; i++) {
    if (i === leftIdx) {
      nextGroups.push(newGroup)
    } else if (i === targetIdx) {
      continue
    } else {
      nextGroups.push(ws.groups[i]!)
    }
  }

  ws.positions[newGroup.id] = { x: leftPos.x, y: leftPos.y }
  ws.groups = nextGroups
  bringGroupToFront(ws, newGroup.id)
  ws.selectedGroupId = newGroup.id
  ws.pendingOperator = null
  pushUndoSnapshot(ws, snap)

  return {
    changed: true,
    completedGroup: ws.groups.length === 1 ? newGroup : undefined,
  }
}

/**
 * Applies an operator (unary or binary) to the currently selected group in the workspace:
 * - Unary operator: immediately wraps the selected group in a UnaryGroupNode with
 *   headerText (e.g., `4! = 24` or `sin(90 deg) = 1`) and keeps the new group selected.
 * - Binary operator: sets `pendingOperator` on the workspace (or toggles it off if same).
 */
export function applyOperatorInWorkspace(
  ws: WorkspaceState,
  operator: OperatorId
): WorkspaceActionOutcome {
  if (!ws.selectedGroupId) {
    return { changed: false, error: 'Select a card or group first.' }
  }

  const idx = ws.groups.findIndex((g) => g.id === ws.selectedGroupId)
  if (idx === -1) {
    ws.selectedGroupId = null
    ws.pendingOperator = null
    return { changed: false, error: 'Selected card group no longer exists.' }
  }

  const selectedNode = ws.groups[idx]!

  if (isUnaryOperator(operator)) {
    const evalRes = applyUnaryOperator(operator as UnaryOperator, selectedNode.value)
    if (!evalRes.ok) {
      return { changed: false, error: evalRes.error ?? 'Invalid unary operation.' }
    }

    const snap = createSnapshot(ws)
    const prevPos = getGroupPosition(ws, selectedNode.id, idx)
    const wrapped: ExprNode = {
      kind: 'unary',
      id: nextNodeId('un'),
      operator: operator as UnaryOperator,
      operand: cloneExprNode(selectedNode),
      value: evalRes.value,
      headerText: evalRes.headerText,
    }

    const nextGroups = [...ws.groups]
    nextGroups[idx] = wrapped
    ws.positions[wrapped.id] = { x: prevPos.x, y: prevPos.y }
    ws.groups = nextGroups
    bringGroupToFront(ws, wrapped.id)
    ws.selectedGroupId = wrapped.id
    ws.pendingOperator = null
    pushUndoSnapshot(ws, snap)

    return {
      changed: true,
      completedGroup: ws.groups.length === 1 ? wrapped : undefined,
    }
  }

  // Binary operator
  const binOp = operator as BinaryOperator
  const snap = createSnapshot(ws)
  if (ws.pendingOperator === binOp) {
    ws.pendingOperator = null
  } else {
    ws.pendingOperator = binOp
  }
  pushUndoSnapshot(ws, snap)
  return { changed: true }
}

/**
 * Ungroups the currently selected group (or the specified `groupId`):
 * - If it is a `binary` group, splits it back into its `left` and `right` child groups.
 * - If it is a `unary` group, unwraps the outer unary operator back to its `operand`.
 * - If it is a leaf `card`, returns `{ changed: false }` with an explanatory message.
 */
export function ungroupInWorkspace(
  ws: WorkspaceState,
  targetGroupId?: string
): WorkspaceActionOutcome {
  const idToUngroup = targetGroupId ?? ws.selectedGroupId
  if (!idToUngroup) {
    return { changed: false, error: 'Select a merged group to ungroup.' }
  }

  const idx = ws.groups.findIndex((g) => g.id === idToUngroup)
  if (idx === -1) {
    return { changed: false, error: 'Selected group not found.' }
  }

  const node = ws.groups[idx]!
  if (node.kind === 'card') {
    return { changed: false, error: 'Single cards cannot be ungrouped.' }
  }

  const snap = createSnapshot(ws)
  const parentPos = getGroupPosition(ws, node.id, idx)

  if (node.kind === 'unary') {
    const operand = cloneExprNode(node.operand)
    ws.positions[operand.id] = { x: parentPos.x, y: parentPos.y }
    const nextGroups = [...ws.groups]
    nextGroups[idx] = operand
    ws.groups = nextGroups
    bringGroupToFront(ws, operand.id)
    ws.selectedGroupId = operand.id
    ws.pendingOperator = null
    pushUndoSnapshot(ws, snap)
    return { changed: true }
  }

  // Binary node -> split into left and right operands
  const leftNode = cloneExprNode(node.left)
  const rightNode = cloneExprNode(node.right)

  // Fan the halves apart: one stays near the group's old spot, the other kicks
  // out to a randomly chosen side, each with a small random nudge so repeated
  // splits never stack exactly. Always kicking right walked the board — and the
  // camera that frames it — further sideways with every split, so the side is
  // a coin flip instead.
  const fanRight = Math.random() >= 0.5
  const fanDirection: 1 | -1 = fanRight ? 1 : -1
  const fanDistance = fanDirection * DEFAULT_CARD_SPACING_X
  const anchorNode = fanRight ? leftNode : rightNode
  const fannedNode = fanRight ? rightNode : leftNode

  const occupied = ws.groups
    .filter((_, groupIdx) => groupIdx !== idx)
    .map((group, groupIdx) => getGroupPosition(ws, group.id, groupIdx))

  const anchorScatter = ungroupScatter()
  const anchorSpot = findFreeSpot(
    { x: parentPos.x + anchorScatter.x, y: parentPos.y + anchorScatter.y },
    occupied,
    fanDirection
  )
  occupied.push(anchorSpot)

  const fannedScatter = ungroupScatter()
  const fannedSpot = findFreeSpot(
    {
      x: parentPos.x + fanDistance + fannedScatter.x,
      y: parentPos.y + UNGROUP_STAGGER_Y + fannedScatter.y,
    },
    occupied,
    fanDirection
  )

  ws.positions[anchorNode.id] = anchorSpot
  ws.positions[fannedNode.id] = fannedSpot

  const nextGroups: ExprNode[] = []
  for (let i = 0; i < ws.groups.length; i++) {
    if (i === idx) {
      nextGroups.push(leftNode, rightNode)
    } else {
      nextGroups.push(ws.groups[i]!)
    }
  }

  ws.groups = nextGroups
  // The freshly split pieces were the ones just handled, so they sit on top.
  bringGroupToFront(ws, leftNode.id)
  bringGroupToFront(ws, rightNode.id)
  ws.selectedGroupId = leftNode.id
  ws.pendingOperator = null
  pushUndoSnapshot(ws, snap)
  return { changed: true }
}

export function undoWorkspace(ws: WorkspaceState): boolean {
  if (ws.undoStack.length === 0) return false
  const currentSnap = createSnapshot(ws)
  const prevSnap = ws.undoStack.pop()!
  ws.redoStack.push(currentSnap)
  ws.groups = prevSnap.groups.map(cloneExprNode)
  ws.positions = clonePositions(prevSnap.positions)
  ws.selectedGroupId = prevSnap.selectedGroupId
  ws.pendingOperator = prevSnap.pendingOperator
  syncStackOrder(ws)
  return true
}

export function redoWorkspace(ws: WorkspaceState): boolean {
  if (ws.redoStack.length === 0) return false
  const currentSnap = createSnapshot(ws)
  const nextSnap = ws.redoStack.pop()!
  ws.undoStack.push(currentSnap)
  ws.groups = nextSnap.groups.map(cloneExprNode)
  ws.positions = clonePositions(nextSnap.positions)
  ws.selectedGroupId = nextSnap.selectedGroupId
  ws.pendingOperator = nextSnap.pendingOperator
  syncStackOrder(ws)
  return true
}

export function resetWorkspaceToHand(ws: WorkspaceState, hand: Card[]): boolean {
  const snap = createSnapshot(ws)
  const initialGroups = createInitialGroupsFromHand(hand)
  ws.groups = initialGroups
  ws.positions = createInitialPositions(initialGroups)
  ws.stackOrder = initialGroups.map((group) => group.id)
  ws.panX = 0
  ws.panY = 0
  ws.selectedGroupId = null
  ws.pendingOperator = null
  pushUndoSnapshot(ws, snap)
  return true
}

export interface WorkspaceSolutionEvaluation {
  isSingleGroup: boolean
  rootNode: ExprNode | null
  finalValue: number | null
  acceptable: boolean
  score: number | null
  errorPercent: number | null
  minAcceptable: number
  maxAcceptable: number
  lhs: string
  equation: string
}

export function evaluateWorkspaceSolution(
  ws: WorkspaceState,
  target: number,
  approximationPercent: number,
  scoringMode: SolutionScoringMode = 'cost-first',
  forbidden?: ForbiddenMoveRules
): WorkspaceSolutionEvaluation {
  const baseCheck = checkTargetAcceptance(NaN, target, approximationPercent)
  if (ws.groups.length !== 1) {
    return {
      isSingleGroup: false,
      rootNode: null,
      finalValue: null,
      acceptable: false,
      score: null,
      errorPercent: null,
      minAcceptable: baseCheck.minAcceptable,
      maxAcceptable: baseCheck.maxAcceptable,
      lhs: '',
      equation: '',
    }
  }

  const root = ws.groups[0]!
  const check = checkTargetAcceptance(root.value, target, approximationPercent)
  const score = calculateScoreBreakdown(
    root,
    {
      errorPercent: check.errorPercent,
      approximationPercent,
      mode: scoringMode,
    },
    forbidden
  ).total
  const lhs = formatExpressionLhs(root)
  const equation = formatFullEquation(root)

  return {
    isSingleGroup: true,
    rootNode: root,
    finalValue: root.value,
    acceptable: check.acceptable,
    score,
    errorPercent: check.errorPercent,
    minAcceptable: check.minAcceptable,
    maxAcceptable: check.maxAcceptable,
    lhs,
    equation,
  }
}

export function countCardsInNode(node: ExprNode): number {
  if (node.kind === 'card') return 1
  if (node.kind === 'unary') return countCardsInNode(node.operand)
  return countCardsInNode(node.left) + countCardsInNode(node.right)
}
