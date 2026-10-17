<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import CardGroupNode from './components/CardGroupNode.vue'
import ScorePanel from './components/ScorePanel.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'
import { isSfxEnabled, playSfx, toggleSfx } from './audio/sfx'
import { dealHand, generateTargetNumber } from './engine/deck'
import {
  OPERATOR_CATALOG,
  calculateScoreBreakdown,
  costOfUnaryOn,
  formatNumber,
  getEnabledOperators,
  isUnaryOperator,
} from './engine/math'
import {
  createLobby,
  isRoomHost,
  joinLobby,
  leaveRoom,
  multiplayer as multiplayerSession,
  openLobbyBrowser,
  selfPlayer,
  sendToRoom,
  serverNow,
  tableServerLabel,
} from './multiplayer/session'
import type { RoomState } from './multiplayer/protocol'
import type {
  Card,
  GameSettings,
  OperatorId,
  PlayerInfo,
  ScreenPhase,
  SubmittedSolution,
  WorkspaceState,
} from './engine/types'
import {
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARD_SPACING_X,
  DEFAULT_CARD_SPACING_Y,
  WORKSPACE_COUNT,
  applyOperatorInWorkspace,
  createAllWorkspaces,
  evaluateWorkspaceSolution,
  getGroupPosition,
  redoWorkspace,
  resetWorkspaceToHand,
  selectGroupInWorkspace,
  setGroupPosition,
  setWorkspacePan,
  tidyWorkspaceGroups,
  undoWorkspace,
  ungroupInWorkspace,
} from './engine/workspace'

const phase = ref<ScreenPhase>('title')

const settings = reactive<GameSettings>({
  isMultiplayer: false,
  mode: 'first-to-solve',
  numCards: 4,
  targetPreset: 'just-24',
  customMin: 10,
  customMax: 250,
  manualTarget: 24,
  approximationPercent: 0,
  cardPool: '1-deck',
  allowedOperators: {
    basic: true,
    powers: true,
    factorial: true,
    trig: false,
    inverse: false,
    bitshift: false,
  },
  firstToPoints: 3,
})

/* --------------- singleplayer seats (multiplayer comes from the server) --------------- */

const localPlayers = ref<PlayerInfo[]>([
  {
    id: 'p-local',
    name: 'You',
    isHost: true,
    isReady: true,
    points: 0,
    bestRoundScore: null,
  },
])

const localRoundNumber = ref(1)
const localRoundSolutions = ref<SubmittedSolution[]>([])
const localRoundWinnerId = ref<string | null>(null)
const localMatchWinner = ref<PlayerInfo | null>(null)

/* ------------------------------ multiplayer room ------------------------------ */

const playerName = ref('Player')
/** Code typed on the lobby selector. */
const lobbyCodeInput = ref('')
/** Create form: public lobbies are listed for everyone, private ones are code-only. */
const newLobbyIsPublic = ref(true)
const creatingLobby = ref(false)
const joiningLobby = ref(false)
/** Name plates shown only while the matching control is hovered. */
const hoveredOperatorLabel = ref<string | null>(null)
const hoveredActionLabel = ref<string | null>(null)
const multiplayerHost = computed(
  () => settings.isMultiplayer && multiplayerSession.room !== null && isRoomHost.value
)
const multiplayerSeated = computed(
  () => settings.isMultiplayer && multiplayerSession.status === 'connected' && multiplayerSession.room !== null
)
/** Seated while a round was already running: dealt in on the next one. */
const awaitingNextDeal = computed(
  () => settings.isMultiplayer && selfPlayer.value?.isWaiting === true
)
const multiplayerReady = computed(() =>
  players.value.every((player) => player.isHost || player.isReady)
)
const canEditSettings = computed(
  () => !settings.isMultiplayer || (multiplayerSeated.value && multiplayerHost.value)
)
const connectionLine = computed(() => {
  switch (multiplayerSession.status) {
    case 'connecting':
      return `Connecting to ${multiplayerSession.transportLabel || tableServerLabel()}…`
    case 'connected':
      return multiplayerSession.room
        ? `Room ${multiplayerSession.room.code} · ${multiplayerSession.room.isPublic ? 'public' : 'private'} · ${multiplayerSession.transportLabel}`
        : `Browsing lobbies at ${multiplayerSession.transportLabel}`
    case 'error':
      return multiplayerSession.error ?? 'Could not reach the table server.'
    case 'disconnected':
      return 'Connection lost — return to the lobby list to reconnect.'
    default:
      return `Start the table server with npm run dev:server to play online.`
  }
})

/** Multiplayer view model: live room seats when connected, local seats otherwise. */
const players = computed<PlayerInfo[]>(() => {
  if (settings.isMultiplayer && multiplayerSession.room) {
    return multiplayerSession.room.players
  }
  return localPlayers.value
})

const roundNumber = computed(() => {
  if (settings.isMultiplayer && multiplayerSession.room?.round) {
    return multiplayerSession.room.round.number
  }
  return localRoundNumber.value
})

const roundSolutions = computed<SubmittedSolution[]>(() => {
  if (settings.isMultiplayer) return multiplayerSession.room?.round?.solutions ?? []
  return localRoundSolutions.value
})

/** Everyone who took the round; two or more ids mean the best boards tied. */
const roundWinnerIds = computed<string[]>(() => {
  if (settings.isMultiplayer) return multiplayerSession.room?.round?.winnerIds ?? []
  return localRoundWinnerId.value ? [localRoundWinnerId.value] : []
})

const roundWinners = computed(() =>
  players.value.filter((player) => roundWinnerIds.value.includes(player.id))
)

const roundWinnerNames = computed(() =>
  roundWinners.value.map((player) => player.name).join(' + ')
)

/**
 * The board each winner is credited with: their cheapest submission. Solutions
 * arrive sorted by score, so the first one per player is the one that won.
 */
const winningSolutionIds = computed(() => {
  const ids = new Set<string>()
  const credited = new Set<string>()
  for (const solution of sortedRoundSolutions.value) {
    if (!roundWinnerIds.value.includes(solution.playerId) || credited.has(solution.playerId)) {
      continue
    }
    credited.add(solution.playerId)
    ids.add(solution.id)
  }
  return ids
})

const matchWinnerIds = computed<string[]>(() => {
  if (settings.isMultiplayer) return multiplayerSession.room?.matchWinnerIds ?? []
  return localMatchWinner.value ? [localMatchWinner.value.id] : []
})

const matchWinners = computed(() =>
  players.value.filter((player) => matchWinnerIds.value.includes(player.id))
)

/** The single series winner, or null when the match was drawn or never won. */
const matchWinner = computed<PlayerInfo | null>(() =>
  matchWinners.value.length === 1 ? matchWinners.value[0]! : null
)

const matchWinnerNames = computed(() =>
  matchWinners.value.map((player) => player.name).join(' + ')
)

const currentTarget = ref(24)
const currentHand = ref<Card[]>([])
const workspaces = ref<WorkspaceState[]>([])
const activeWorkspaceIdx = ref(0)
const actionError = ref<string | null>(null)

/* ------------------------- juice: SFX, impact, cues ------------------------- */

const sfxOn = ref(isSfxEnabled())
const impactKind = ref<'split' | 'error' | 'hit' | null>(null)
const hitSignal = ref(0)
const shellRef = ref<HTMLElement | null>(null)
const feltRef = ref<HTMLElement | null>(null)
const sidebarRef = ref<HTMLElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const panGlide = ref(false)
/** While true the slots ease into a freshly tidied layout instead of teleporting. */
const tidyingBoard = ref(false)
const hoveredPanLabel = ref<string | null>(null)

/**
 * Ease the felt so a freshly merged group (which can be a tall nested stack)
 * stays inside the workspace viewport instead of sliding off the bottom edge.
 */
async function glideToGroups(groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return
  await nextTick()
  // Let the pop-in animation finish so the measured box is the settled layout box.
  await new Promise((resolve) => setTimeout(resolve, 200))
  const viewport = viewportRef.value
  const ws = activeWorkspace.value
  if (!viewport || !ws) return

  // Union of every slot's box: sizes come from the DOM (pop transforms ignored),
  // but positions come from the workspace state. Reading `offsetLeft` here would
  // pick up a still-running tidy transition and frame a layout that no longer
  // exists, leaving the board visibly off-centre.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let measured = 0
  groupIds.forEach((id, index) => {
    const slot = viewport.querySelector<HTMLElement>(`[data-testid="group-slot-${id}"]`)
    if (!slot) return
    measured++
    const { x, y } = getGroupPosition(ws, id, index)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + slot.offsetWidth)
    maxY = Math.max(maxY, y + slot.offsetHeight)
  })
  if (measured === 0) return

  const boxW = maxX - minX
  const boxH = maxY - minY
  const desiredPanX = Math.round((viewport.clientWidth - boxW) / 2 - minX)
  const desiredPanY = Math.round((viewport.clientHeight - boxH) / 2 - minY)
  if (Math.abs(desiredPanX - ws.panX) < 2 && Math.abs(desiredPanY - ws.panY) < 2) return

  panGlide.value = true
  setWorkspacePan(ws, desiredPanX, desiredPanY)
  const timer = setTimeout(() => {
    panGlide.value = false
    cueTimers.delete(timer)
  }, 300)
  cueTimers.add(timer)
}

const floatingCues = ref<
  { id: number; text: string; tone: 'good' | 'bad' | 'neutral'; offsetX: number }[]
>([])
let cueSeed = 0
let impactTimer: ReturnType<typeof setTimeout> | null = null
let sawAcceptable = false
const cueTimers = new Set<ReturnType<typeof setTimeout>>()

/**
 * A short bob on one piece. The felt itself stays put: equipping an operator
 * should read as the card acknowledging it, not as the whole board lurching.
 */
function bobGroup(groupId: string | null): void {
  if (!groupId) return
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) return
  const slot = viewportRef.value?.querySelector<HTMLElement>(
    `[data-testid="group-slot-${groupId}"]`
  )
  // The slot owns the card's position, so animating it leaves the selected
  // piece's own lift/pulse transform untouched.
  if (!slot || typeof slot.animate !== 'function') return
  slot.animate(
    [
      { transform: 'translateY(0)' },
      { transform: 'translateY(-9px)', offset: 0.32 },
      { transform: 'translateY(0)', offset: 0.62 },
      { transform: 'translateY(-4px)', offset: 0.82 },
      { transform: 'translateY(0)' },
    ],
    { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  )
}

/** Physical feedback: Web Animations API so every repeat replays cleanly. */
function triggerImpact(kind: 'split' | 'error' | 'hit'): void {
  impactKind.value = kind
  if (impactTimer) clearTimeout(impactTimer)
  impactTimer = setTimeout(
    () => {
      impactKind.value = null
    },
    kind === 'hit' ? 900 : 380
  )

  const canAnimate =
    typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'
  if (!canAnimate) return

  const feel = feltRef.value
  const side = sidebarRef.value
  const shell = shellRef.value

  if (kind === 'hit') {
    shell?.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(-8px, 4px) rotate(-0.5deg)' },
        { transform: 'translate(7px, -3px) rotate(0.5deg)' },
        { transform: 'translate(-4px, 2px) rotate(-0.2deg)' },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ],
      { duration: 460, easing: 'steps(5, end)' }
    )
    side?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.05) rotate(-1deg)' },
        { transform: 'scale(1)' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
    feel?.animate(
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.45) saturate(1.2)' },
        { filter: 'brightness(1)' },
      ],
      { duration: 520, easing: 'ease-out' }
    )
    return
  }

  if (kind === 'error') {
    shell?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-9px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 260, easing: 'steps(4, end)' }
    )
    return
  }

  // Splitting a group presses the felt down a touch; nothing else moves it.
  feel?.animate(
    [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(3px) scale(0.995)' },
      { transform: 'translateY(0) scale(1)' },
    ],
    { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  )
}

function pushCue(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  const id = ++cueSeed
  // The horizontal spot belongs to the cue, not its list position: cues are
  // dropped from the front as new ones arrive, and a CSS nth-child offset made
  // the survivors hop sideways mid-rise when they were re-indexed.
  const offsetX = 50 + (((id * 37) % 25) - 12)
  floatingCues.value = [...floatingCues.value.slice(-3), { id, text, tone, offsetX }]
  const timer = setTimeout(() => {
    floatingCues.value = floatingCues.value.filter((cue) => cue.id !== id)
    cueTimers.delete(timer)
  }, 1000)
  cueTimers.add(timer)
}

function onToggleSfx(): void {
  sfxOn.value = toggleSfx()
  if (sfxOn.value) playSfx('select')
}

function goToTitle(): void {
  playSfx('click')
  // Walking away from the title screen must free the seat, or the room would
  // keep a ghost player around.
  if (settings.isMultiplayer) leaveRoom()
  stopDeadlineClock()
  phase.value = 'title'
}

function goToLobby(): void {
  playSfx('click')
  // Leaving the table is deliberate: the room keeps running for everyone else
  // and the seat is handed back when this player rejoins.
  if (settings.isMultiplayer) {
    leaveRoom()
    goToTableBrowser()
    return
  }
  phase.value = 'lobby'
}

/* ------------------------ multiplayer lobby selector ------------------------ */

/** Title screen → lobby list. Connects without taking a seat. */
function goToTableBrowser(): void {
  settings.isMultiplayer = true
  phase.value = 'lobby-select'
  // Coming back to the list (or onto a new table) must re-apply the next deal,
  // even if the round number matches the one left behind.
  appliedRoundNumber = 0
  appliedRoomCode = null
  stopDeadlineClock()
  void openLobbyBrowser()
}

async function createTable(): Promise<void> {
  playSfx('click')
  creatingLobby.value = true
  const isPublic = newLobbyIsPublic.value
  await createLobby({
    name: playerName.value.trim() || 'Player',
    isPublic,
  })
  creatingLobby.value = false
  if (multiplayerSession.room) {
    playSfx('select')
    phase.value = 'lobby'
  }
}

async function joinTableByCode(code = lobbyCodeInput.value): Promise<void> {
  playSfx('click')
  joiningLobby.value = true
  await joinLobby(code, playerName.value.trim() || 'Player')
  joiningLobby.value = false
  const joined = multiplayerSession.room
  if (joined) {
    playSfx('select')
    // A table still in its lobby is shown as-is; a match in progress is mirrored
    // by the room watcher, which also deals the current hand.
    if (joined.phase === 'lobby') phase.value = 'lobby'
  }
}

function lobbyModeLabel(mode: string): string {
  switch (mode) {
    case 'first-to-solve':
      return 'FIRST TO SOLVE'
    case 'best-30s':
      return 'BEST 30s'
    case 'best-1m':
      return 'BEST 1m'
    case 'best-3m':
      return 'BEST 3m'
    case 'best-5m':
      return 'BEST 5m'
    case 'best-10m':
      return 'BEST 10m'
    default:
      return mode.toUpperCase()
  }
}

function lobbyPhaseLabel(phaseName: string): string {
  switch (phaseName) {
    case 'lobby':
      return 'IN LOBBY'
    case 'playing':
      return 'ROUND LIVE'
    case 'round-end':
      return 'BETWEEN ROUNDS'
    case 'game-over':
      return 'FINISHED'
    default:
      return phaseName.toUpperCase()
  }
}

/** Back to the list, freeing the seat. The room runs on without you. */
function leaveTable(): void {
  playSfx('click')
  leaveRoom()
  goToTableBrowser()
}

function toggleReady(): void {
  const me = selfPlayer.value
  if (!me || me.isHost) return
  sendToRoom({ t: 'set-ready', ready: !me.isReady })
  playSfx('click')
}

/* ------------------------------- Tutorial ------------------------------- */

/** The guide is an overlay on the title screen, not a `phase`. */
const tutorialOpen = ref(false)
const tutorialTriggerRef = ref<HTMLButtonElement | null>(null)

function openTutorial(): void {
  tutorialOpen.value = true
  playSfx('select')
}

async function closeTutorial(): Promise<void> {
  tutorialOpen.value = false
  playSfx('click')
  // Wait for the overlay to go before moving focus: the dialog's close button
  // is focused while it is open, and removing it would drop focus on <body>.
  await nextTick()
  tutorialTriggerRef.value?.focus()
}

/* ------------------------------- ESC menu ------------------------------- */

const menuOpen = ref(false)

function openMenu(): void {
  menuOpen.value = true
  playSfx('select')
}

function closeMenu(): void {
  menuOpen.value = false
  playSfx('click')
}

function menuGoToLobby(): void {
  menuOpen.value = false
  goToLobby()
}

function menuGoToTitle(): void {
  menuOpen.value = false
  goToTitle()
}

function handleEscape(): void {
  if (tutorialOpen.value) {
    closeTutorial()
    return
  }
  if (menuOpen.value) {
    closeMenu()
    return
  }
  // First Esc cancels a waiting binary operator; otherwise it opens the menu.
  const ws = activeWorkspace.value
  if (phase.value === 'playing' && ws?.pendingOperator) {
    ws.pendingOperator = null
    playSfx('click')
    return
  }
  openMenu()
}

// Countdown mirrors the server's round deadline; the server is the one that ends the round.
const remainingSeconds = ref<number | null>(null)
let deadlineTimer: ReturnType<typeof setInterval> | null = null
let roundStartTimestamp = 0
let appliedRoundNumber = 0
let appliedRoomCode: string | null = null
/** Signature of the last board sent to the table, so repeats stay off the wire. */
let lastReportedBoard: string | null = null

const activeWorkspace = computed<WorkspaceState | undefined>(
  () => workspaces.value[activeWorkspaceIdx.value]
)

const enabledOperators = computed(() => getEnabledOperators(settings.allowedOperators))
const unaryOperators = computed(() =>
  enabledOperators.value.filter((op) => op.arity === 'unary')
)
const binaryOperators = computed(() =>
  enabledOperators.value.filter((op) => op.arity === 'binary')
)

const pendingOperatorMeta = computed(() => {
  const ws = activeWorkspace.value
  if (!ws || !ws.pendingOperator) return null
  return OPERATOR_CATALOG.find((op) => op.id === ws.pendingOperator) ?? null
})

const selectedGroupNode = computed(() => {
  const ws = activeWorkspace.value
  if (!ws || !ws.selectedGroupId) return null
  return ws.groups.find((g) => g.id === ws.selectedGroupId) ?? null
})

const canUngroupSelected = computed(() => {
  return selectedGroupNode.value !== null && selectedGroupNode.value.kind !== 'card'
})

// Dragging cards/groups & panning the workspace canvas
interface DragInteraction {
  kind: 'group' | 'pan'
  groupId?: string
  startClientX: number
  startClientY: number
  initialX: number
  initialY: number
  moved: boolean
}

const activeDrag = ref<DragInteraction | null>(null)
let suppressNextSelectClick = false

function handleGroupPointerDown(event: PointerEvent, groupId: string, idx: number): void {
  if (event.button !== 0 && event.pointerType === 'mouse') return
  const ws = activeWorkspace.value
  if (!ws) return
  event.stopPropagation()
  const pos = getGroupPosition(ws, groupId, idx)
  activeDrag.value = {
    kind: 'group',
    groupId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    initialX: pos.x,
    initialY: pos.y,
    moved: false,
  }
}

function handleCanvasPointerDown(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== 1 && event.pointerType === 'mouse') return
  const ws = activeWorkspace.value
  if (!ws) return
  activeDrag.value = {
    kind: 'pan',
    startClientX: event.clientX,
    startClientY: event.clientY,
    initialX: ws.panX,
    initialY: ws.panY,
    moved: false,
  }
}

function handleWindowPointerMove(event: PointerEvent): void {
  const drag = activeDrag.value
  const ws = activeWorkspace.value
  if (!drag || !ws) return

  const dx = event.clientX - drag.startClientX
  const dy = event.clientY - drag.startClientY
  if (!drag.moved && Math.hypot(dx, dy) > 5) {
    drag.moved = true
  }
  if (!drag.moved) return

  if (drag.kind === 'group' && drag.groupId) {
    setGroupPosition(ws, drag.groupId, drag.initialX + dx, drag.initialY + dy)
  } else if (drag.kind === 'pan') {
    setWorkspacePan(ws, drag.initialX + dx, drag.initialY + dy)
  }
}

function handleWindowPointerUp(): void {
  const drag = activeDrag.value
  if (!drag) return
  if (drag.kind === 'group' && drag.moved) {
    suppressNextSelectClick = true
    setTimeout(() => {
      suppressNextSelectClick = false
    }, 0)
  }
  activeDrag.value = null
}

function handleCanvasWheel(event: WheelEvent): void {
  const ws = activeWorkspace.value
  if (!ws) return
  event.preventDefault()
  setWorkspacePan(ws, ws.panX - event.deltaX, ws.panY - event.deltaY)
}

function handleRecenterView(): void {
  const ws = activeWorkspace.value
  if (!ws) return
  setWorkspacePan(ws, 0, 0)
}

/** Gaps the tidy grid leaves between pieces, matching the dealt layout's pitch. */
const TIDY_GAP_X = 52
const TIDY_GAP_Y = 23

/**
 * Squares the scattered cards away into a grid centred on the workspace origin,
 * then frames that grid — the camera is centred on the cards, not on the old
 * pan position, so a board panned far off-screen comes back into view.
 */
function handleTidyBoard(): void {
  const ws = activeWorkspace.value
  const viewport = viewportRef.value
  if (!ws || !viewport) return
  actionError.value = null

  // Measure the pieces on screen: a merged stack is taller and wider than a bare
  // card, so the pitch has to grow with it or a second row would sit on top of it.
  const slots = [...viewport.querySelectorAll<HTMLElement>('[data-testid^="group-slot-"]')]
  const widest = Math.max(
    ...slots.map((slot) => slot.offsetWidth + TIDY_GAP_X),
    DEFAULT_CARD_SPACING_X
  )
  const tallest = Math.max(
    ...slots.map((slot) => slot.offsetHeight + TIDY_GAP_Y),
    DEFAULT_CARD_SPACING_Y
  )
  const widestSlot = Math.max(...slots.map((slot) => slot.offsetWidth), DEFAULT_CARD_SPACING_X)

  // Fit as many whole pieces as the felt is wide, plus a little breathing room.
  const usableWidth = viewport.clientWidth - 32
  const columns = Math.max(
    1,
    Math.min(
      ws.groups.length,
      DEFAULT_CARDS_PER_ROW,
      Math.floor((usableWidth - widestSlot) / widest) + 1
    )
  )
  const changed = tidyWorkspaceGroups(ws, { columns, spacingX: widest, spacingY: tallest })

  if (changed) {
    tidyingBoard.value = true
    playSfx('place')
    pushCue('TIDY', 'neutral')
    const timer = setTimeout(() => {
      tidyingBoard.value = false
      cueTimers.delete(timer)
    }, 320)
    cueTimers.add(timer)
  }

  void glideToGroups(ws.groups.map((group) => group.id))
}

const currentEvaluation = computed(() => {
  const ws = activeWorkspace.value
  if (!ws) {
    return null
  }
  return evaluateWorkspaceSolution(ws, currentTarget.value, settings.approximationPercent)
})

/** Where the current solution's cost comes from, once the cards are in one group. */
const costBreakdown = computed(() => {
  const evaluation = currentEvaluation.value
  if (!evaluation?.isSingleGroup || !evaluation.rootNode) return null
  return calculateScoreBreakdown(evaluation.rootNode)
})

const sortedRoundSolutions = computed(() => {
  return [...roundSolutions.value].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.timestampMs - b.timestampMs
  })
})

function enterLobby(multiplayer: boolean): void {
  settings.isMultiplayer = multiplayer
  if (multiplayer) {
    // Online play starts at the lobby list: pick a public table, take a code,
    // or open one of your own.
    goToTableBrowser()
    return
  }
  leaveRoom()
  localPlayers.value = [
    {
      id: 'p-local',
      name: 'You',
      isHost: true,
      isReady: true,
      points: 0,
      bestRoundScore: null,
    },
  ]
  phase.value = 'lobby'
}

function startMatchFromLobby(): void {
  // Ensure at least one operator category is enabled
  const anyEnabled = Object.values(settings.allowedOperators).some(Boolean)
  if (!anyEnabled) {
    settings.allowedOperators.basic = true
  }

  if (settings.isMultiplayer) {
    if (multiplayerHost.value && multiplayerSession.room?.phase !== 'playing') {
      sendToRoom({ t: 'start-match' })
    }
    return
  }

  localRoundNumber.value = 1
  localMatchWinner.value = null
  for (const p of localPlayers.value) {
    p.points = 0
    p.bestRoundScore = null
  }
  startNewRound()
}

function startNewRound(): void {
  stopDeadlineClock()
  actionError.value = null
  localRoundSolutions.value = []
  localRoundWinnerId.value = null
  sawAcceptable = false
  playSfx('deal')

  currentTarget.value = generateTargetNumber(settings)
  currentHand.value = dealHand(settings.numCards, settings.cardPool)
  workspaces.value = createAllWorkspaces(currentHand.value)
  activeWorkspaceIdx.value = 0
  for (const p of localPlayers.value) {
    p.bestRoundScore = null
  }

  remainingSeconds.value = null
  roundStartTimestamp = Date.now()
  lastReportedBoard = null
  phase.value = 'playing'
}

/* ------------------- server room → local view model bridge ------------------- */

function stopDeadlineClock(): void {
  if (deadlineTimer) {
    clearInterval(deadlineTimer)
    deadlineTimer = null
  }
}

function refreshRemainingSeconds(): void {
  const deadline = multiplayerSession.room?.round?.deadline ?? null
  if (!settings.isMultiplayer || deadline === null) {
    remainingSeconds.value = null
    return
  }
  const seconds = Math.max(0, Math.ceil((deadline - serverNow()) / 1000))
  if (seconds !== remainingSeconds.value && seconds > 0 && seconds <= 5) playSfx('tick')
  remainingSeconds.value = seconds
}

function startDeadlineClock(): void {
  stopDeadlineClock()
  refreshRemainingSeconds()
  if (multiplayerSession.room?.round?.deadline != null) {
    deadlineTimer = setInterval(refreshRemainingSeconds, 250)
  }
}

/** Mirrors the authoritative room into the screens the game already renders. */
function applyRoomSnapshot(room: RoomState): void {
  if (!settings.isMultiplayer) return

  // A different table (leave → rejoin, or a new code) always starts fresh, even
  // if the round number happens to match the last one seen.
  if (appliedRoomCode !== room.code) {
    appliedRoomCode = room.code
    appliedRoundNumber = 0
  }

  if (room.phase === 'playing' && room.round) {
    if (room.round.number !== appliedRoundNumber) {
      appliedRoundNumber = room.round.number
      actionError.value = null
      sawAcceptable = false
      lastReportedBoard = null
      currentTarget.value = room.round.target
      currentHand.value = room.round.hand
      workspaces.value = createAllWorkspaces(room.round.hand)
      activeWorkspaceIdx.value = 0
      phase.value = 'playing'
      playSfx('deal')
      startDeadlineClock()
    }
    return
  }

  if (room.phase === 'round-end') {
    stopDeadlineClock()
    phase.value = 'round-end'
    return
  }

  if (room.phase === 'game-over') {
    stopDeadlineClock()
    // A rematch deals round 1 again; reset so the new deal is always applied.
    appliedRoundNumber = 0
    phase.value = 'game-over'
    return
  }

  if (room.phase === 'lobby') {
    appliedRoundNumber = 0
    stopDeadlineClock()
    remainingSeconds.value = null
    phase.value = 'lobby'
  }
}

watch(
  () => multiplayerSession.room,
  (room) => {
    if (room) applyRoomSnapshot(room)
  }
)

// Non-hosts mirror the host's rules; the host is the source of truth and pushes edits.
watch(
  () => multiplayerSession.room?.settings,
  (remote) => {
    if (!settings.isMultiplayer || !remote || multiplayerHost.value) return
    Object.assign(settings, JSON.parse(JSON.stringify(remote))) as GameSettings
  },
  { deep: true }
)

let settingsPushTimer: ReturnType<typeof setTimeout> | null = null
watch(
  settings,
  () => {
    if (!settings.isMultiplayer || !multiplayerHost.value) return
    if (multiplayerSession.room?.phase !== 'lobby') return
    if (settingsPushTimer) clearTimeout(settingsPushTimer)
    settingsPushTimer = setTimeout(() => {
      sendToRoom({ t: 'update-settings', settings: JSON.parse(JSON.stringify(settings)) })
    }, 150)
  },
  { deep: true }
)

function recordPlayerSolutionFromWorkspace(): SubmittedSolution | null {
  const evalRes = currentEvaluation.value
  if (!evalRes || !evalRes.isSingleGroup || !evalRes.acceptable || evalRes.score === null) {
    return null
  }

  // Multiplayer scores live on the server; this player only reports the board.
  if (settings.isMultiplayer) {
    // Seated mid-round: watch the table, but nothing here counts until the next deal.
    if (awaitingNextDeal.value) return null
    // The evaluation watcher fires on every board mutation, so only report when
    // the board itself changed — otherwise each nudge re-sends the same solution.
    const signature = `${activeWorkspaceIdx.value}|${evalRes.lhs}|${evalRes.score}`
    if (signature === lastReportedBoard) return null
    lastReportedBoard = signature
    sendToRoom({
      t: 'submit',
      solution: {
        equation: evalRes.equation,
        lhs: evalRes.lhs,
        finalValue: evalRes.finalValue ?? 0,
        score: evalRes.score,
        errorPercent: evalRes.errorPercent ?? 0,
        workspaceIndex: activeWorkspaceIdx.value + 1,
      },
    })
    return null
  }

  const localPlayer = localPlayers.value[0]!
  const existingIdx = localRoundSolutions.value.findIndex(
    (s) => s.playerId === localPlayer.id && s.lhs === evalRes.lhs
  )

  const entry: SubmittedSolution = {
    id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    playerId: localPlayer.id,
    playerName: localPlayer.name,
    equation: evalRes.equation,
    lhs: evalRes.lhs,
    finalValue: evalRes.finalValue!,
    score: evalRes.score,
    errorPercent: evalRes.errorPercent ?? 0,
    timestampMs: Date.now() - roundStartTimestamp,
    workspaceIndex: activeWorkspaceIdx.value + 1,
  }

  if (existingIdx === -1) {
    localRoundSolutions.value.push(entry)
  } else {
    localRoundSolutions.value[existingIdx] = entry
  }

  if (localPlayer.bestRoundScore === null || entry.score < localPlayer.bestRoundScore) {
    localPlayer.bestRoundScore = entry.score
  }

  return entry
}

// Automatically record acceptable single-group solutions and handle First-to-solve auto-transition
watch(
  currentEvaluation,
  (evalRes) => {
    if (phase.value !== 'playing' || !evalRes || awaitingNextDeal.value) return
    const acceptableNow = evalRes.isSingleGroup && evalRes.acceptable
    if (acceptableNow && !sawAcceptable) {
      hitSignal.value += 1
      playSfx('hit')
      triggerImpact('hit')
      pushCue('TARGET HIT', 'good')
    }
    sawAcceptable = acceptableNow
    if (acceptableNow) {
      // Solo keeps a local leaderboard; multiplayer reports the board and lets
      // the server decide when the round is over.
      recordPlayerSolutionFromWorkspace()
    }
  },
  { deep: true }
)

// Sound design per screen transition
watch(phase, (next) => {
  menuOpen.value = false
  if (next === 'round-end' || next === 'game-over') {
    playSfx('fanfare')
  }
})

function handleSelectGroup(groupId: string): void {
  if (suppressNextSelectClick) {
    suppressNextSelectClick = false
    return
  }
  if (awaitingNextDeal.value) return
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  const groupsBefore = ws.groups.length
  const res = selectGroupInWorkspace(ws, groupId)
  if (res.changed) {
    if (ws.groups.length < groupsBefore) {
      // Two groups were fused: thunk, and keep the taller stack on screen.
      playSfx('merge')
      void glideToGroups(ws.groups.map((group) => group.id))
    } else {
      playSfx('select')
    }
  } else {
    if (res.error) actionError.value = res.error
    playSfx('error')
    triggerImpact('error')
    pushCue('NOPE', 'bad')
  }
}

function handleUngroup(targetGroupId?: string): void {
  if (awaitingNextDeal.value) return
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  const res = ungroupInWorkspace(ws, targetGroupId)
  if (res.changed) {
    playSfx('ungroup')
    triggerImpact('split')
    pushCue('SPLIT', 'neutral')
    // Reframe the felt so every fanned-out piece stays reachable.
    void glideToGroups(ws.groups.map((group) => group.id))
  } else {
    if (res.error) actionError.value = res.error
    playSfx('error')
    triggerImpact('error')
    pushCue('NOPE', 'bad')
  }
}

function handleApplyOperator(opId: OperatorId): void {
  if (awaitingNextDeal.value) return
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  // Read the cost before the board changes: the selection afterwards is the
  // group this press just produced, not the one it landed on.
  const costLabel = operatorCostLabel(opId)
  const res = applyOperatorInWorkspace(ws, opId)
  if (res.changed) {
    const meta = OPERATOR_CATALOG.find((op) => op.id === opId)
    playSfx('place')
    // A unary operation wraps the piece in a new group id, so the slot it now
    // lives in only exists after the board re-renders.
    const bobTarget = ws.selectedGroupId
    void nextTick(() => bobGroup(bobTarget))
    pushCue(`${meta?.shortSymbol ?? '?'} ${costLabel}`, 'neutral')
  } else {
    if (res.error) actionError.value = res.error
    playSfx('error')
    triggerImpact('error')
    pushCue('NOPE', 'bad')
  }
}

/**
 * What this press costs. A binary operator is a flat 10 (arming it or merging
 * with it costs the same); a unary one ramps with the chain it lands on, and
 * includes the 200-point factorial/inverse-gamma pairing.
 */
function operatorCostLabel(opId: OperatorId): string {
  if (!isUnaryOperator(opId)) return '+10'
  const ws = activeWorkspace.value
  const node = ws?.groups.find((group) => group.id === ws.selectedGroupId)
  if (!node) return '+10'
  return `+${costOfUnaryOn(opId, node)}`
}

function handleUndo(): void {
  if (awaitingNextDeal.value) return
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  undoWorkspace(ws)
  playSfx('click')
}

function handleRedo(): void {
  if (awaitingNextDeal.value) return
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  redoWorkspace(ws)
  playSfx('click')
}

function handleResetWorkspace(): void {
  if (awaitingNextDeal.value) return
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  resetWorkspaceToHand(ws, currentHand.value)
  playSfx('ungroup')
  triggerImpact('split')
  pushCue('RESET', 'neutral')
}

function switchWorkspace(index: number): void {
  if (index >= 0 && index < WORKSPACE_COUNT) {
    activeWorkspaceIdx.value = index
    actionError.value = null
    playSfx('click')
  }
}

function finishRound(reason: 'first-to-solve' | 'timer' | 'skip' | 'player-end'): void {
  if (settings.isMultiplayer) {
    // The server owns round transitions. Hosts can close the round early; the
    // host-side skip also awards the best submitted board if there is one.
    if (multiplayerHost.value && multiplayerSession.room?.phase === 'playing') {
      sendToRoom({ t: 'skip-round' })
    }
    return
  }

  stopDeadlineClock()
  recordPlayerSolutionFromWorkspace()

  // Award point to winning player if not skipped and at least one acceptable solution exists
  if (reason !== 'skip' && sortedRoundSolutions.value.length > 0) {
    const bestSol = sortedRoundSolutions.value[0]!
    localRoundWinnerId.value = bestSol.playerId
    const winner = localPlayers.value.find((p) => p.id === bestSol.playerId)
    if (winner) {
      winner.points += 1
      if (winner.points >= settings.firstToPoints) {
        localMatchWinner.value = winner
      }
    }
  } else {
    localRoundWinnerId.value = null
  }

  phase.value = 'round-end'
}

function advanceAfterRoundEnd(): void {
  if (settings.isMultiplayer) {
    if (multiplayerHost.value && multiplayerSession.room?.phase === 'round-end') {
      sendToRoom({ t: 'next-round' })
    }
    return
  }
  if (localMatchWinner.value) {
    phase.value = 'game-over'
    return
  }
  localRoundNumber.value += 1
  startNewRound()
}

function endEntireGameNow(): void {
  if (settings.isMultiplayer) {
    if (multiplayerHost.value) sendToRoom({ t: 'end-match' })
    return
  }
  stopDeadlineClock()
  // Determine top scorer if any
  const standings = [...localPlayers.value].sort((a, b) => b.points - a.points)
  localMatchWinner.value = standings[0] && standings[0].points > 0 ? standings[0] : null
  phase.value = 'game-over'
}

function pointsLabel(points: number): string {
  return `${points} ${points === 1 ? 'pt' : 'pts'}`
}

function formatTimer(seconds: number | null): string {
  if (seconds === null) return '∞'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function spriteUrl(name: string): string {
  return `/card-sprites/${name}`
}

/** 1–9 for the first nine operator slots, 0 for the tenth. */
function opKeyLabel(index: number): string {
  return index === 9 ? '0' : String(index + 1)
}

/** Physical digit key -> operator slot index (Digit1..Digit9, Digit0 last). */
function opSlotFromCode(code: string): number | null {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  if (!match) return null
  const digit = Number(match[1])
  return digit === 0 ? 9 : digit - 1
}

function handleKeyDown(e: KeyboardEvent): void {
  const key = e.key.toLowerCase()

  // Esc always works, even while typing in a settings field.
  if (key === 'escape') {
    e.preventDefault()
    handleEscape()
    return
  }

  const target = e.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA')
  ) {
    return
  }

  if (menuOpen.value || tutorialOpen.value || phase.value !== 'playing') return

  if (key === 'z') {
    e.preventDefault()
    handleUndo()
    return
  }
  if (key === 'y') {
    e.preventDefault()
    handleRedo()
    return
  }
  if (key === 'u') {
    e.preventDefault()
    handleUngroup()
    return
  }
  // Digit keys: 1–0 applies a binary operator, Shift+1–0 a unary one.
  const slot = opSlotFromCode(e.code)
  if (slot !== null) {
    if (e.altKey) {
      if (slot < WORKSPACE_COUNT) {
        e.preventDefault()
        switchWorkspace(slot)
      }
      return
    }
    if (e.ctrlKey || e.metaKey) return
    const ws = activeWorkspace.value
    if (!ws?.selectedGroupId) return
    const operators = e.shiftKey ? unaryOperators.value : binaryOperators.value
    const operator = operators[slot]
    if (!operator) return
    e.preventDefault()
    handleApplyOperator(operator.id)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('pointerup', handleWindowPointerUp)
  window.addEventListener('pointercancel', handleWindowPointerUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
  window.removeEventListener('pointercancel', handleWindowPointerUp)
  stopDeadlineClock()
  leaveRoom()
  if (impactTimer) clearTimeout(impactTimer)
  cueTimers.forEach((timer) => clearTimeout(timer))
  cueTimers.clear()
})
</script>

<template>
  <div ref="shellRef" class="app-shell" :class="impactKind ? `impact--${impactKind}` : ''">
    <!-- ======================== TITLE SCREEN ======================== -->
    <main v-if="phase === 'title'" class="screen-title" :inert="menuOpen || tutorialOpen">
      <span class="title-suits" aria-hidden="true">♠ ♥ ♣ ♦</span>
      <div class="title-stack">
        <div class="hero-card-fan" aria-hidden="true">
          <img
            :src="spriteUrl('ace-of-spades-large.png')"
            alt="Ace of Spades"
            class="fan-card fan-card--1 pixel-sprite"
          />
          <img
            :src="spriteUrl('8-of-hearts.png')"
            alt="8 of Hearts"
            class="fan-card fan-card--2 pixel-sprite"
          />
          <img
            :src="spriteUrl('3-of-clubs.png')"
            alt="3 of Clubs"
            class="fan-card fan-card--3 pixel-sprite"
          />
          <img
            :src="spriteUrl('queen-of-diamonds.png')"
            alt="Queen of Diamonds"
            class="fan-card fan-card--4 pixel-sprite"
          />
        </div>

        <h1 class="hero-heading">
          <span class="hero-heading__make">MAKE</span>
          <span class="hero-heading__num">24</span>
        </h1>

        <div class="mode-cards">
          <button
            type="button"
            class="mode-btn mode-btn--solo"
            data-testid="enter-singleplayer"
            @click="enterLobby(false)"
          >
            <span class="mode-btn__sigil" aria-hidden="true">♠</span>
            <span class="mode-btn__body">
              <span class="mode-btn__title">SOLO</span>
              <span class="mode-btn__copy">No clock. Finish when you like.</span>
            </span>
            <span class="mode-btn__arrow" aria-hidden="true">▸</span>
          </button>

          <button
            type="button"
            class="mode-btn mode-btn--versus"
            data-testid="enter-multiplayer"
            @click="enterLobby(true)"
          >
            <span class="mode-btn__sigil" aria-hidden="true">♥</span>
            <span class="mode-btn__body">
              <span class="mode-btn__title">MULTIPLAYER</span>
              <span class="mode-btn__copy">Play competitive against friends.</span>
            </span>
            <span class="mode-btn__arrow" aria-hidden="true">▸</span>
          </button>
        </div>

        <button
          ref="tutorialTriggerRef"
          type="button"
          class="title-guide"
          data-testid="open-tutorial"
          @click="openTutorial"
        >
          <span class="title-guide__icon" aria-hidden="true">?</span>
          <span class="title-guide__label">Tutorial</span>
          <span class="title-guide__hint">Every rule, on one page</span>
        </button>
      </div>
    </main>

    <!-- ======================== LOBBY SELECTOR ======================== -->
    <main v-else-if="phase === 'lobby-select'" class="screen-lobby" :inert="menuOpen || tutorialOpen">
      <div class="lobby-marquee">
        <div class="lobby-marquee__left">
          <span class="lobby-marquee__badge">MULTIPLAYER</span>
          <span class="lobby-marquee__name">Find a Table</span>
        </div>
        <button
          type="button"
          class="btn-arcade btn-arcade--tiny lobby-marquee__back"
          data-testid="browser-back-btn"
          @click="goToTitle"
        >
          ◂ Main Menu
        </button>
      </div>

      <div class="browser-grid">
        <section class="panel-box browser-card">
          <h2>Your Player</h2>

          <label class="mp-field browser-name">
            <span>Display name</span>
            <input
              v-model="playerName"
              type="text"
              class="input-arcade"
              maxlength="18"
              data-testid="mp-name-input"
            />
          </label>

          <div class="browser-create">
            <h3>Open a new table</h3>
            <div class="visibility-toggle" role="group" aria-label="Lobby visibility">
              <button
                type="button"
                class="visibility-option"
                :class="{ 'visibility-option--active': newLobbyIsPublic }"
                :aria-pressed="newLobbyIsPublic"
                data-testid="lobby-public-btn"
                @click="newLobbyIsPublic = true"
              >
                <span class="visibility-option__title">PUBLIC</span>
                <span class="visibility-option__copy">Listed for anyone to join</span>
              </button>
              <button
                type="button"
                class="visibility-option"
                :class="{ 'visibility-option--active': !newLobbyIsPublic }"
                :aria-pressed="!newLobbyIsPublic"
                data-testid="lobby-private-btn"
                @click="newLobbyIsPublic = false"
              >
                <span class="visibility-option__title">PRIVATE</span>
                <span class="visibility-option__copy">Code only, hidden from the list</span>
              </button>
            </div>
            <button
              type="button"
              class="btn-arcade btn-arcade--gold btn-arcade--block"
              data-testid="lobby-create-btn"
              :disabled="creatingLobby || multiplayerSession.status === 'connecting'"
              @click="createTable"
            >
              {{ creatingLobby ? 'Opening…' : 'Create Lobby' }}
            </button>
            <p class="browser-hint">
              You become the host. Every lobby gets its own short code other players can type in.
            </p>
          </div>

          <div class="browser-join">
            <h3>Join with a code</h3>
            <div class="browser-join__row">
              <input
                v-model="lobbyCodeInput"
                type="text"
                class="input-arcade browser-code-input"
                maxlength="12"
                placeholder="ABCD"
                aria-label="Lobby code"
                data-testid="mp-room-input"
                @keyup.enter="joinTableByCode()"
              />
              <button
                type="button"
                class="btn-arcade"
                data-testid="mp-join-btn"
                :disabled="joiningLobby || !lobbyCodeInput.trim()"
                @click="joinTableByCode()"
              >
                Join
              </button>
            </div>
          </div>

          <p
            class="mp-status"
            :class="`mp-status--${multiplayerSession.status}`"
            data-testid="mp-status"
          >
            {{ connectionLine }}
          </p>
          <p v-if="multiplayerSession.error" class="browser-error" role="alert">
            ⚠ {{ multiplayerSession.error }}
          </p>
        </section>

        <section class="panel-box browser-card browser-card--list">
          <div class="browser-list-head">
            <h2>Public Lobbies</h2>
            <span class="browser-count">{{ multiplayerSession.lobbies.length }}</span>
          </div>

          <div v-if="multiplayerSession.lobbies.length > 0" class="lobby-list" data-testid="lobby-list">
            <div
              v-for="lobby in multiplayerSession.lobbies"
              :key="lobby.code"
              class="lobby-row"
              :data-testid="`lobby-row-${lobby.code}`"
            >
              <span class="lobby-row__code">{{ lobby.code }}</span>
              <div class="lobby-row__info">
                <span class="lobby-row__host">{{ lobby.hostName }}</span>
                <span class="lobby-row__meta">
                  {{ lobbyPhaseLabel(lobby.phase) }} · {{ lobbyModeLabel(lobby.mode) }}
                </span>
              </div>
              <span class="lobby-row__seats">
                {{ lobby.playerCount }}/{{ lobby.maxPlayers }}
              </span>
              <button
                type="button"
                class="btn-arcade btn-arcade--tiny"
                :disabled="lobby.playerCount >= lobby.maxPlayers"
                @click="joinTableByCode(lobby.code)"
              >
                {{ lobby.playerCount >= lobby.maxPlayers ? 'Full' : 'Join' }}
              </button>
            </div>
          </div>

          <div v-else class="lobby-empty">
            <p v-if="multiplayerSession.status === 'connecting'">Reading the lobby board…</p>
            <p v-else-if="multiplayerSession.status === 'error'">
              No table server answered. Start it with <code>npm run dev:server</code>.
            </p>
            <p v-else>
              No public lobbies are open. Create one, or ask a friend for their private code.
            </p>
          </div>
        </section>
      </div>
    </main>

    <!-- ======================== LOBBY & SETTINGS SCREEN ======================== -->
    <main v-else-if="phase === 'lobby'" class="screen-lobby" :inert="menuOpen || tutorialOpen">
      <div class="lobby-marquee">
        <div class="lobby-marquee__left">
          <span class="lobby-marquee__badge">
            {{ settings.isMultiplayer ? 'MULTIPLAYER' : 'SINGLEPLAYER' }}
          </span>
          <span class="lobby-marquee__name">Table Setup</span>
        </div>
        <button
          type="button"
          class="btn-arcade btn-arcade--tiny lobby-marquee__back"
          @click="goToTitle"
        >
          ◂ Main Menu
        </button>
      </div>

      <div class="lobby-grid">
        <!-- Left column: Players & Match Controls -->
        <section class="panel-box lobby-players">
          <div class="section-header">
            <h2>{{ settings.isMultiplayer ? 'Multiplayer Lobby' : 'Singleplayer Setup' }}</h2>
          </div>

          <div class="player-list">
            <div v-for="player in players" :key="player.id" class="player-row">
              <div class="player-ident">
                <span class="player-badge">{{ player.isHost ? 'HOST' : 'PLAYER' }}</span>
                <span class="player-name">{{ player.name }}</span>
              </div>
              <div class="player-meta">
                <span
                  class="player-ready"
                  :class="{ 'player-ready--on': player.isHost || player.isReady }"
                >
                  {{ player.isHost ? 'HOST' : player.isReady ? 'READY' : 'WAITING' }}
                </span>
                <span class="player-pts">{{ player.points }} / {{ settings.firstToPoints }} pts</span>
              </div>
            </div>
          </div>

          <div v-if="settings.isMultiplayer" class="mp-connect" data-testid="lobby-identity">
            <div class="lobby-code-block">
              <span class="lobby-code-block__label">Lobby code</span>
              <span class="lobby-code-block__code" data-testid="lobby-code">
                {{ multiplayerSession.room?.code ?? '——' }}
              </span>
              <span
                class="lobby-code-block__visibility"
                :class="{ 'lobby-code-block__visibility--private': !multiplayerSession.room?.isPublic }"
              >
                {{ multiplayerSession.room?.isPublic ? 'PUBLIC' : 'PRIVATE' }}
              </span>
            </div>
            <p class="browser-hint">
              {{
                multiplayerSession.room?.isPublic
                  ? 'Listed in the public lobby browser.'
                  : 'Hidden from the list — share the code to invite players.'
              }}
            </p>
            <p class="mp-status" :class="`mp-status--${multiplayerSession.status}`">
              {{ connectionLine }}
            </p>
            <p v-if="awaitingNextDeal" class="lobby-waiting-note" data-testid="lobby-waiting-note">
              A round is already running. You're dealt in on the next one.
            </p>
            <div class="mp-connect__actions">
              <button
                v-if="multiplayerSeated && !multiplayerHost"
                type="button"
                class="btn-arcade btn-arcade--tiny btn-arcade--gold"
                data-testid="mp-ready-btn"
                @click="toggleReady"
              >
                {{ selfPlayer?.isReady ? 'Not Ready' : 'Ready Up' }}
              </button>
              <button
                type="button"
                class="btn-arcade btn-arcade--tiny"
                data-testid="mp-leave-btn"
                @click="leaveTable"
              >
                Leave Lobby
              </button>
            </div>
          </div>

          <div class="scoring-summary-box">
            <h3>Scoring Rules (Lower is Better)</h3>
            <ul>
              <li><strong>+10 pts</strong> per binary operator used</li>
              <li>
                <strong>+10, +20, +30… pts</strong> for consecutive stacked unary operators
                (<code>o(o(x)) = 30</code>, <code>o(o(o(x))) = 60</code>; binary resets chain)
              </li>
              <li>
                <strong>+200 pts</strong> penalty each time <code>!</code> and
                <code>Γ⁻¹</code> are nested directly together
              </li>
            </ul>
          </div>

          <div class="lobby-start-cta">
            <button
              type="button"
              class="btn-arcade btn-arcade--gold btn-start-game"
              data-testid="start-round-btn"
              :disabled="
                settings.isMultiplayer &&
                (!multiplayerHost || !multiplayerSeated || !multiplayerReady)
              "
              @click="startMatchFromLobby"
            >
              {{ settings.isMultiplayer && !multiplayerHost ? 'Waiting for Host' : 'Deal Cards & Start Match' }}
            </button>
          </div>
        </section>

        <!-- Right column: Full Game Settings per Spec -->
        <section class="panel-box lobby-settings">
          <h2>Table Settings</h2>

          <fieldset class="settings-form" :disabled="!canEditSettings">
            <!-- Mode (multiplayer only dropdown) -->
            <div v-if="settings.isMultiplayer" class="field-row">
              <label for="setting-mode">Mode</label>
              <select id="setting-mode" v-model="settings.mode" class="input-arcade">
                <option value="first-to-solve">First to solve</option>
                <option value="best-30s">Best in 30s</option>
                <option value="best-1m">Best in 1m</option>
                <option value="best-3m">Best in 3m</option>
                <option value="best-5m">Best in 5m</option>
                <option value="best-10m">Best in 10m</option>
              </select>
            </div>

            <!-- Number of cards -->
            <div class="field-row">
              <label for="setting-num-cards">Number of cards dealt</label>
              <input
                id="setting-num-cards"
                v-model.number="settings.numCards"
                type="number"
                min="2"
                max="10"
                class="input-arcade input-short"
              />
            </div>

            <!-- Target number preset -->
            <div class="field-row">
              <label for="setting-target">Target number</label>
              <select
                id="setting-target"
                v-model="settings.targetPreset"
                class="input-arcade"
              >
                <option value="just-24">Just 24 (Always 24)</option>
                <option value="small">Small numbers (1 – 100)</option>
                <option value="big">Big numbers (100 – 10000)</option>
                <option value="custom">Custom range (Min – Max)</option>
                <option value="manual">Host selects exact target number</option>
              </select>
            </div>

            <!-- Custom range inputs -->
            <div v-if="settings.targetPreset === 'custom'" class="field-row field-subrow">
              <div>
                <label for="setting-custom-min">Minimum</label>
                <input
                  id="setting-custom-min"
                  v-model.number="settings.customMin"
                  type="number"
                  class="input-arcade input-short"
                />
              </div>
              <div>
                <label for="setting-custom-max">Maximum</label>
                <input
                  id="setting-custom-max"
                  v-model.number="settings.customMax"
                  type="number"
                  class="input-arcade input-short"
                />
              </div>
            </div>

            <!-- Host manual target input -->
            <div v-if="settings.targetPreset === 'manual'" class="field-row field-subrow">
              <div>
                <label for="setting-manual-target">Host Target Number</label>
                <input
                  id="setting-manual-target"
                  v-model.number="settings.manualTarget"
                  type="number"
                  class="input-arcade input-short"
                />
              </div>
            </div>

            <!-- Approximations (%) -->
            <div class="field-row">
              <label for="setting-approx">
                Approximations (% error allowed, inclusive)
              </label>
              <div class="inline-field">
                <input
                  id="setting-approx"
                  v-model.number="settings.approximationPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  class="input-arcade input-short"
                />
                <span class="field-hint">%</span>
              </div>
            </div>

            <!-- Card pool -->
            <div class="field-row">
              <label for="setting-pool">Card pool</label>
              <select id="setting-pool" v-model="settings.cardPool" class="input-arcade">
                <option value="1-deck">One deck (52 cards)</option>
                <option value="2-decks">Two decks (104 cards)</option>
                <option value="3-decks">Three decks (156 cards)</option>
                <option value="unlimited">
                  Unlimited (with replacement, all ranks equally likely)
                </option>
              </select>
            </div>

            <!-- First to X points -->
            <div class="field-row">
              <label for="setting-first-to">First to X points wins match</label>
              <input
                id="setting-first-to"
                v-model.number="settings.firstToPoints"
                type="number"
                min="1"
                max="25"
                class="input-arcade input-short"
              />
            </div>

            <!-- Allowed operators -->
            <div class="field-row">
              <label>Allowed operators</label>
              <div class="operator-toggles">
                <label class="toggle-chip">
                  <input v-model="settings.allowedOperators.basic" type="checkbox" />
                  <span>Basic (+, −, ×, ÷)</span>
                </label>
                <label class="toggle-chip">
                  <input v-model="settings.allowedOperators.powers" type="checkbox" />
                  <span>Powers &amp; roots (xʸ, ʸ√x)</span>
                </label>
                <label class="toggle-chip">
                  <input v-model="settings.allowedOperators.factorial" type="checkbox" />
                  <span>Factorials &amp; gamma (x!, Γ(x), Γ⁻¹(x))</span>
                </label>
                <label class="toggle-chip">
                  <input v-model="settings.allowedOperators.trig" type="checkbox" />
                  <span>Basic trig in deg (sin°, cos°, tan°)</span>
                </label>
                <label class="toggle-chip">
                  <input v-model="settings.allowedOperators.inverse" type="checkbox" />
                  <span>Inverse (1/x)</span>
                </label>
                <label class="toggle-chip">
                  <input v-model="settings.allowedOperators.bitshift" type="checkbox" />
                  <span>Bit shifting (LSHIFT, RSHIFT)</span>
                </label>
              </div>
            </div>
          </fieldset>
        </section>
      </div>
    </main>

    <!-- ======================== LIVE GAMEPLAY SCREEN ======================== -->
    <main v-else-if="phase === 'playing'" class="screen-playing" :inert="menuOpen || tutorialOpen">
      <div class="table-layout">
        <!-- ============ Left blind / score sidebar (Balatro HUD) ============ -->
        <aside ref="sidebarRef" class="table-sidebar">
          <ScorePanel
            :round-number="roundNumber"
            :target="currentTarget"
            :approximation-percent="settings.approximationPercent"
            :value="currentEvaluation?.finalValue ?? null"
            :error-percent="currentEvaluation?.errorPercent ?? null"
            :score="currentEvaluation?.score ?? null"
            :acceptable="!!(currentEvaluation?.isSingleGroup && currentEvaluation.acceptable)"
            :cost-breakdown="costBreakdown"
            :hit-signal="hitSignal"
          />

          <div class="sidebar-panel">
            <div class="sidebar-panel__title">Workspaces</div>
            <div class="workspace-stack">
              <button
                v-for="ws in workspaces"
                :key="ws.index"
                type="button"
                class="ws-tab"
                :class="{ 'ws-tab--active': ws.index === activeWorkspaceIdx }"
                :data-testid="`workspace-tab-${ws.index + 1}`"
                @click="switchWorkspace(ws.index)"
              >
                <span class="ws-tab-num">W{{ ws.index + 1 }}</span>
                <span class="ws-tab-key">⌥{{ ws.index + 1 }}</span>
              </button>
            </div>
          </div>

          <div
            v-if="settings.isMultiplayer && remainingSeconds !== null"
            class="sidebar-timer"
            :class="{ 'sidebar-timer--urgent': remainingSeconds <= 10 }"
          >
            <span class="sidebar-timer__label">TIME LEFT</span>
            <span class="sidebar-timer__digits">{{ formatTimer(remainingSeconds) }}</span>
          </div>

          <div class="sidebar-actions">
            <button
              v-if="!settings.isMultiplayer || settings.mode !== 'first-to-solve'"
              type="button"
              class="btn-arcade btn-arcade--gold btn-arcade--block"
              data-testid="finish-round-btn"
              :disabled="settings.isMultiplayer && !multiplayerHost"
              @click="finishRound('player-end')"
            >
              {{ settings.isMultiplayer ? 'End Round' : 'Finish & Submit' }}
            </button>
            <button
              type="button"
              class="btn-arcade btn-arcade--block"
              data-testid="skip-round-btn"
              :disabled="settings.isMultiplayer && !multiplayerHost"
              @click="finishRound('skip')"
            >
              Skip Round
            </button>
            <button
              type="button"
              class="btn-arcade btn-arcade--crimson btn-arcade--block"
              :disabled="settings.isMultiplayer && !multiplayerHost"
              @click="endEntireGameNow"
            >
              End Match
            </button>
          </div>
        </aside>

        <!-- ============ Table ============ -->
        <div class="table-main">
          <div
            v-if="awaitingNextDeal"
            class="waiting-banner"
            role="status"
            data-testid="waiting-banner"
          >
            <span class="waiting-banner__badge">NEXT DEAL</span>
            <span class="waiting-banner__copy">
              You joined mid-round, so this hand is a spectator's view. You're dealt in when the
              next round starts.
            </span>
          </div>

          <div
            v-if="currentEvaluation && currentEvaluation.isSingleGroup"
            class="equation-ribbon"
            :class="currentEvaluation.acceptable ? 'equation-ribbon--good' : 'equation-ribbon--bad'"
            data-testid="solution-status-badge"
          >
            <span class="equation-ribbon__tag">
              {{ currentEvaluation.acceptable ? 'ACCEPTABLE' : 'NOT ACCEPTABLE' }}
            </span>
            <span class="equation-ribbon__eq">{{ currentEvaluation.equation }}</span>
            <span class="equation-ribbon__score">{{ currentEvaluation.score }} pts</span>
          </div>
          <div v-else class="equation-ribbon equation-ribbon--idle" data-testid="solution-status-incomplete">
            <span class="equation-ribbon__tag">MERGING</span>
            <span class="equation-ribbon__eq">
              {{ activeWorkspace?.groups.length ?? 0 }} / {{ currentHand.length }} groups
            </span>
          </div>

      <!-- Interactive Felt Board for Active Workspace -->
      <section ref="feltRef" class="felt-table" :class="{ 'felt-table--waiting': awaitingNextDeal }">
        <div class="board-toasts">
          <span v-if="actionError" class="error-toast" role="alert">⚠ {{ actionError }}</span>
          <span
            v-if="activeWorkspace?.pendingOperator && pendingOperatorMeta"
            class="pending-chip"
            data-testid="pending-operator-banner"
          >
            {{ pendingOperatorMeta.shortSymbol }} → pick the 2nd card
          </span>
        </div>

        <!-- Pannable workspace plane -->
        <div
          v-if="activeWorkspace"
          ref="viewportRef"
          class="workspace-viewport"
          :class="{ 'workspace-viewport--panning': activeDrag?.kind === 'pan' && activeDrag.moved }"
          data-testid="workspace-canvas"
          @pointerdown="handleCanvasPointerDown"
          @wheel="handleCanvasWheel"
        >
          <div
            class="workspace-plane"
            data-testid="workspace-plane"
            :style="{
              transform: `translate3d(${activeWorkspace.panX}px, ${activeWorkspace.panY}px, 0)`,
              transition: panGlide
                ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'none',
            }"
            :class="{ 'workspace-plane--tidying': tidyingBoard }"
          >
            <div
              v-for="(group, idx) in activeWorkspace.groups"
              :key="group.id"
              class="draggable-group-slot"
              :class="{
                'draggable-group-slot--selected': activeWorkspace.selectedGroupId === group.id,
                'draggable-group-slot--dragging':
                  activeDrag?.kind === 'group' &&
                  activeDrag.groupId === group.id &&
                  activeDrag.moved,
              }"
              :data-testid="`group-slot-${group.id}`"
              :style="{
                left: `${getGroupPosition(activeWorkspace, group.id, idx).x}px`,
                top: `${getGroupPosition(activeWorkspace, group.id, idx).y}px`,
              }"
              @pointerdown="(e) => handleGroupPointerDown(e, group.id, idx)"
            >
              <CardGroupNode
                :node="group"
                :is-root="true"
                :selected="activeWorkspace.selectedGroupId === group.id"
                :pending-symbol="
                  activeWorkspace.selectedGroupId === group.id
                    ? pendingOperatorMeta?.shortSymbol ?? null
                    : null
                "
                @select="handleSelectGroup"
                @ungroup="handleUngroup"
              />
            </div>
          </div>
        </div>

        <!-- Operators: vertical rail, top right -->
        <div class="op-rail" role="group" aria-label="Operators">
          <div class="op-rail__group">
            <span class="op-rail__tag" aria-hidden="true">B</span>
            <button
              v-for="(op, idx) in binaryOperators"
              :key="op.id"
              type="button"
              class="op-square btn-op"
              :class="{ 'btn-op--active': activeWorkspace?.pendingOperator === op.id }"
              :disabled="!activeWorkspace?.selectedGroupId"
              :data-testid="`op-${op.id}`"
              :aria-label="`${op.label} (${op.shortSymbol}), key ${opKeyLabel(idx)}`"
              @mouseenter="hoveredOperatorLabel = op.label"
              @mouseleave="hoveredOperatorLabel = null"
              @focus="hoveredOperatorLabel = op.label"
              @blur="hoveredOperatorLabel = null"
              @click="handleApplyOperator(op.id)"
            >
              <span class="op-square__sym">{{ op.shortSymbol }}</span>
              <span class="op-key">{{ opKeyLabel(idx) }}</span>
            </button>
          </div>

          <div v-if="unaryOperators.length > 0" class="op-rail__group">
            <span class="op-rail__tag op-rail__tag--unary" aria-hidden="true">U</span>
            <button
              v-for="(op, idx) in unaryOperators"
              :key="op.id"
              type="button"
              class="op-square btn-op btn-op--unary"
              :disabled="!activeWorkspace?.selectedGroupId"
              :data-testid="`op-${op.id}`"
              :aria-label="`${op.label} (${op.shortSymbol}), key shift+${opKeyLabel(idx)}`"
              @mouseenter="hoveredOperatorLabel = op.label"
              @mouseleave="hoveredOperatorLabel = null"
              @focus="hoveredOperatorLabel = op.label"
              @blur="hoveredOperatorLabel = null"
              @click="handleApplyOperator(op.id)"
            >
              <span class="op-square__sym">{{ op.shortSymbol }}</span>
              <span class="op-key">⇧{{ opKeyLabel(idx) }}</span>
            </button>
          </div>
        </div>

        <span v-if="hoveredOperatorLabel" class="rail-hint" aria-hidden="true">
          {{ hoveredOperatorLabel }}
        </span>

        <!-- Group & history actions: horizontal, bottom right -->
        <div class="board-actions">
          <button
            type="button"
            class="board-action"
            :disabled="!canUngroupSelected"
            data-testid="ungroup-btn"
            aria-label="Ungroup selected group (U)"
            @mouseenter="hoveredActionLabel = 'Ungroup · U'"
            @mouseleave="hoveredActionLabel = null"
            @focus="hoveredActionLabel = 'Ungroup · U'"
            @blur="hoveredActionLabel = null"
            @click="handleUngroup()"
          >
            <span class="board-action__icon" aria-hidden="true">✂</span>
          </button>
          <button
            type="button"
            class="board-action"
            :disabled="!activeWorkspace || activeWorkspace.undoStack.length === 0"
            data-testid="undo-btn"
            aria-label="Undo (Z)"
            @mouseenter="hoveredActionLabel = 'Undo · Z'"
            @mouseleave="hoveredActionLabel = null"
            @focus="hoveredActionLabel = 'Undo · Z'"
            @blur="hoveredActionLabel = null"
            @click="handleUndo"
          >
            <span class="board-action__icon" aria-hidden="true">↶</span>
          </button>
          <button
            type="button"
            class="board-action"
            :disabled="!activeWorkspace || activeWorkspace.redoStack.length === 0"
            data-testid="redo-btn"
            aria-label="Redo (Y)"
            @mouseenter="hoveredActionLabel = 'Redo · Y'"
            @mouseleave="hoveredActionLabel = null"
            @focus="hoveredActionLabel = 'Redo · Y'"
            @blur="hoveredActionLabel = null"
            @click="handleRedo"
          >
            <span class="board-action__icon" aria-hidden="true">↷</span>
          </button>
          <button
            type="button"
            class="board-action"
            data-testid="reset-workspace-btn"
            aria-label="Reset workspace to the dealt hand"
            @mouseenter="hoveredActionLabel = 'Reset workspace'"
            @mouseleave="hoveredActionLabel = null"
            @focus="hoveredActionLabel = 'Reset workspace'"
            @blur="hoveredActionLabel = null"
            @click="handleResetWorkspace"
          >
            <span class="board-action__icon" aria-hidden="true">⟲</span>
          </button>
        </div>
        <span v-if="hoveredActionLabel" class="actions-hint" aria-hidden="true">
          {{ hoveredActionLabel }}
        </span>

        <!-- Pan readout + recenter + tidy: bottom left -->
        <div class="board-pan">
          <span class="pan-coords" data-testid="pan-coords">
            {{ activeWorkspace?.panX ?? 0 }}, {{ activeWorkspace?.panY ?? 0 }}
          </span>
          <button
            type="button"
            class="board-icon-btn"
            data-testid="recenter-view-btn"
            aria-label="Center view"
            title="Center view"
            @mouseenter="hoveredPanLabel = 'Center view'"
            @mouseleave="hoveredPanLabel = null"
            @focus="hoveredPanLabel = 'Center view'"
            @blur="hoveredPanLabel = null"
            @click="handleRecenterView"
          >
            <span aria-hidden="true">⌖</span>
          </button>
          <button
            type="button"
            class="board-icon-btn"
            data-testid="tidy-board-btn"
            aria-label="Tidy cards into a grid"
            title="Tidy cards"
            @mouseenter="hoveredPanLabel = 'Tidy cards'"
            @mouseleave="hoveredPanLabel = null"
            @focus="hoveredPanLabel = 'Tidy cards'"
            @blur="hoveredPanLabel = null"
            @click="handleTidyBoard"
          >
            <span aria-hidden="true">▦</span>
          </button>
        </div>
        <span v-if="hoveredPanLabel" class="pan-hint" aria-hidden="true">
          {{ hoveredPanLabel }}
        </span>

        <div class="cue-layer" aria-hidden="true">
          <span
            v-for="cue in floatingCues"
            :key="cue.id"
            class="float-cue"
            :class="`float-cue--${cue.tone}`"
            :style="{ left: `${cue.offsetX}%` }"
          >
            {{ cue.text }}
          </span>
        </div>
      </section>
        </div>
      </div>
    </main>

    <!-- ======================== ROUND END SCREEN ======================== -->
    <main v-else-if="phase === 'round-end'" class="screen-round-end" :inert="menuOpen || tutorialOpen">
      <div
        class="results-cabinet"
        :class="roundWinnerIds.length ? 'results-cabinet--win' : 'results-cabinet--bust'"
      >
        <div class="results-marquee">
          <span class="results-marquee__round">ROUND {{ roundNumber }}</span>
          <span class="results-marquee__target">
            TARGET <strong>{{ formatNumber(currentTarget) }}</strong>
          </span>
        </div>

        <div
          class="results-stamp"
          :class="roundWinnerIds.length ? 'results-stamp--win' : 'results-stamp--bust'"
        >
          {{
            roundWinnerIds.length > 1
              ? 'POINT SPLIT'
              : roundWinnerIds.length
                ? 'ROUND CLEAR'
                : 'NO POINT'
          }}
        </div>

        <p v-if="roundWinnerIds.length > 1" class="split-note" data-testid="round-tie-note">
          Equal best boards, so <strong>{{ roundWinnerNames }}</strong> each take a point.
        </p>

        <h2 class="results-title">
          <template v-if="settings.isMultiplayer && settings.mode === 'first-to-solve'">
            Winning solution
          </template>
          <template v-else-if="roundWinnerIds.length > 1">
            Best expression, shared
          </template>
          <template v-else>
            {{ roundWinnerIds.length ? 'Best expression this round' : 'Nobody closed the round' }}
          </template>
        </h2>

        <div v-if="sortedRoundSolutions.length > 0" class="solutions-table">
          <div
            v-for="(sol, idx) in settings.isMultiplayer && settings.mode === 'first-to-solve'
              ? sortedRoundSolutions.slice(0, 1)
              : sortedRoundSolutions"
            :key="sol.id"
            class="solution-row"
            :class="{ 'solution-row--winner': winningSolutionIds.has(sol.id) }"
          >
            <div class="sol-rank">
              {{ winningSolutionIds.has(sol.id) ? '★ WINNER' : `#${idx + 1}` }}
            </div>
            <div class="sol-player">
              <strong>{{ sol.playerName }}</strong>
              <span class="sol-ws">Workspace {{ sol.workspaceIndex }}</span>
            </div>
            <div class="sol-equation" data-testid="round-end-equation">
              {{ sol.equation }}
            </div>
            <div class="sol-score">
              <span class="score-pill">{{ sol.score }} pts</span>
              <span v-if="settings.approximationPercent > 0" class="error-sub">
                ({{ formatNumber(sol.errorPercent) }}% err)
              </span>
            </div>
          </div>
        </div>

        <div v-else class="no-solutions-banner">
          No acceptable expressions were submitted. Nobody takes the point — deal again and try a
          cheaper route.
        </div>

        <!-- Standings -->
        <div class="standings-strip">
          <h3>Match standings · first to {{ settings.firstToPoints }} pts</h3>
          <div class="standings-row">
            <div v-for="p in players" :key="p.id" class="standing-card">
              <span class="standing-name">
                {{ p.name }}
                <span v-if="p.isWaiting" class="standing-tag">NEXT DEAL</span>
              </span>
              <span class="standing-pts">{{ p.points }} / {{ settings.firstToPoints }} pts</span>
            </div>
          </div>
        </div>

        <div class="round-end-actions">
          <button
            type="button"
            class="btn-arcade btn-arcade--gold"
            data-testid="next-round-btn"
            :disabled="settings.isMultiplayer && !multiplayerHost"
            @click="advanceAfterRoundEnd"
          >
            {{ matchWinnerIds.length ? 'View Match Winner' : 'Deal Next Round' }}
          </button>
          <button type="button" class="btn-arcade" @click="goToLobby">
            Back to Lobby
          </button>
          <button
            type="button"
            class="btn-arcade btn-arcade--crimson"
            :disabled="settings.isMultiplayer && !multiplayerHost"
            @click="endEntireGameNow"
          >
            End Game
          </button>
        </div>
      </div>
    </main>

    <!-- ======================== GAME OVER SCREEN ======================== -->
    <main v-else-if="phase === 'game-over'" class="screen-game-over" :inert="menuOpen || tutorialOpen">
      <div class="results-cabinet results-cabinet--final">
        <div class="results-marquee">
          <span class="results-marquee__round">FINAL BELL</span>
          <span class="results-marquee__target">SERIES OVER</span>
        </div>

        <img
          :src="spriteUrl('joker-black.png')"
          alt="Joker"
          class="pixel-sprite gameover-joker"
        />
        <h2 class="gameover-title">MATCH COMPLETE</h2>
        <p v-if="matchWinners.length > 1" class="winner-callout" data-testid="match-draw-callout">
          Series shared: <strong>{{ matchWinnerNames }}</strong> ·
          <strong>{{ pointsLabel(matchWinners[0]?.points ?? 0) }} each</strong>
        </p>
        <p v-else-if="matchWinner" class="winner-callout">
          Series winner: <strong>{{ matchWinner.name }}</strong> ·
          <strong>{{ pointsLabel(matchWinner.points) }}</strong>
        </p>
        <p v-else class="winner-callout">Match ended early — no winner on the board.</p>

        <div class="standings-row standings-row--centered">
          <div
            v-for="p in players"
            :key="p.id"
            class="standing-card"
            :class="{ 'standing-card--top': matchWinnerIds.includes(p.id) }"
          >
            <span class="standing-name">{{ p.name }}</span>
            <span class="standing-pts">{{ pointsLabel(p.points) }}</span>
          </div>
        </div>

        <div class="round-end-actions round-end-actions--centered">
          <button
            type="button"
            class="btn-arcade btn-arcade--gold"
            :disabled="settings.isMultiplayer && !multiplayerHost"
            @click="startMatchFromLobby"
          >
            Play Again
          </button>
          <button type="button" class="btn-arcade" @click="goToLobby">
            Return to Lobby
          </button>
        </div>
      </div>
    </main>

    <!-- ======================== ESC MENU ======================== -->
    <div
      v-if="menuOpen"
      class="pause-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      data-testid="pause-menu"
      @click.self="closeMenu"
    >
      <div class="pause-card">
        <div class="pause-card__marquee">
          <span class="pause-card__badge">
            {{
              phase === 'title'
                ? 'START SCREEN'
                : settings.isMultiplayer
                  ? 'MULTIPLAYER'
                  : 'SINGLEPLAYER'
            }}
          </span>
          <span class="pause-card__title">MENU</span>
        </div>

        <div class="pause-card__body">
          <button
            type="button"
            class="btn-arcade btn-arcade--gold btn-arcade--block"
            data-testid="menu-resume"
            @click="closeMenu"
          >
            Resume
          </button>
          <button
            type="button"
            class="btn-arcade btn-arcade--block"
            data-testid="menu-lobby"
            :disabled="phase === 'lobby'"
            @click="menuGoToLobby"
          >
            Lobby &amp; Settings
          </button>
          <button
            type="button"
            class="btn-arcade btn-arcade--block"
            data-testid="menu-title"
            @click="menuGoToTitle"
          >
            Main Menu
          </button>
          <button
            type="button"
            class="btn-arcade btn-arcade--block"
            :class="sfxOn ? 'btn-arcade--emerald' : ''"
            data-testid="menu-sfx"
            :aria-pressed="sfxOn"
            @click="onToggleSfx"
          >
            {{ sfxOn ? '♪ Sound On' : '♪ Sound Off' }}
          </button>
        </div>

        <div class="pause-card__hint">Esc to resume</div>
      </div>
    </div>

    <!-- ======================== PLAYER'S GUIDE ======================== -->
    <TutorialOverlay v-if="tutorialOpen" @close="closeTutorial" />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Esc menu overlay */
.pause-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(
    circle at 50% 40%,
    rgba(20, 16, 32, 0.74) 0%,
    rgba(6, 5, 10, 0.92) 100%
  );
  backdrop-filter: blur(2px);
}

.pause-card {
  width: min(340px, 100%);
  background: linear-gradient(180deg, #241a34 0%, #130f1e 100%);
  border: 4px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 0 40px rgba(255, 190, 11, 0.08),
    0 12px 0 #09080f;
  padding: 14px 16px 16px;
  animation: balatro-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.pause-card__marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #0b0912;
  border: 2px solid rgba(255, 190, 11, 0.45);
  padding: 6px 9px;
  margin-bottom: 14px;
}

.pause-card__badge {
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.18em;
  color: var(--gold);
}

.pause-card__title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--gold-bright);
  letter-spacing: 0.08em;
}

.pause-card__body {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.pause-card__hint {
  margin-top: 12px;
  text-align: center;
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.18em;
  color: var(--ink-muted);
}

@keyframes menu-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.pause-overlay {
  animation: menu-fade 0.14s ease-out;
}

/* Title screen: full-bleed splash, no cabinet frame */
.screen-title {
  flex: 1;
  position: relative;
  display: grid;
  place-items: center;
  padding: clamp(30px, 6vh, 70px) 24px clamp(40px, 7vh, 80px);
  overflow: hidden;
}

/* Warm spotlight behind the logo so the artwork sits on something */
.screen-title::before {
  content: '';
  position: absolute;
  inset: -10% -5%;
  background:
    radial-gradient(ellipse 46% 40% at 50% 30%, rgba(255, 190, 11, 0.18), transparent 70%),
    radial-gradient(ellipse 60% 34% at 50% 88%, rgba(254, 74, 73, 0.14), transparent 72%);
  pointer-events: none;
}

/* Faint oversized suits, pixel-dithered into the felt */
.title-suits {
  position: absolute;
  inset: auto 0 -2vh;
  font-family: var(--font-display);
  font-size: clamp(9rem, 26vw, 22rem);
  letter-spacing: -0.02em;
  text-align: center;
  color: rgba(247, 240, 224, 0.035);
  pointer-events: none;
  user-select: none;
}

.title-stack {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(14px, 2.4vh, 28px);
  width: min(960px, 100%);
  max-width: 100%;
  text-align: center;
}

.hero-card-fan {
  display: flex;
  justify-content: center;
  align-items: center;
  max-width: 100%;
}

/* Cards scale with the shorter axis so the fan never spills off narrow phones */
.fan-card {
  display: block;
  width: auto;
  height: clamp(104px, min(26vh, 26vw), 240px);
  margin: 0 clamp(-20px, -1.4vw, -6px);
  filter: drop-shadow(0 8px 0 rgba(12, 9, 16, 0.85));
  animation: fan-bob 3.4s ease-in-out infinite;
}

.fan-card--1 {
  transform: rotate(-12deg) translateY(10px);
  animation-delay: 0s;
}
.fan-card--2 {
  transform: rotate(-4deg);
  animation-delay: 0.25s;
}
.fan-card--3 {
  transform: rotate(4deg);
  animation-delay: 0.5s;
}
.fan-card--4 {
  transform: rotate(12deg) translateY(10px);
  animation-delay: 0.75s;
}

.hero-heading {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: clamp(10px, 1.8vw, 26px);
  margin: 0;
  line-height: 0.82;
}

.hero-heading__make {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, min(3.8vw, 5vh), 3.2rem);
  color: var(--ink-cream);
  letter-spacing: 0.06em;
  text-shadow:
    0 5px 0 var(--crimson-dark),
    0 10px 0 #09080f,
    0 14px 26px rgba(9, 8, 15, 0.65);
}

.hero-heading__num {
  font-family: var(--font-display);
  font-size: clamp(3.4rem, min(13.5vw, 22vh), 10.5rem);
  color: var(--gold-bright);
  text-shadow:
    0 6px 0 #b06b00,
    0 13px 0 #09080f,
    0 0 42px rgba(255, 190, 11, 0.5);
  animation: title-pulse 2.6s ease-in-out infinite;
}

.mode-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(12px, 1.6vw, 20px);
  width: min(860px, 100%);
  margin-top: clamp(4px, 1.6vh, 16px);
}

/* Chunky arcade slab buttons: sigil, label, arrow */
.mode-btn {
  --accent: #72efdd;
  --accent-glow: rgba(114, 239, 221, 0.35);
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 18px 20px 17px;
  text-align: left;
  font-family: inherit;
  color: inherit;
  background: linear-gradient(180deg, #2b2239 0%, #151021 100%);
  border: 3px solid #3c3357;
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 8px 0 #09080f;
  cursor: pointer;
  transition:
    transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

/* Coloured lip across the top, like a lit cabinet button */
.mode-btn::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--accent);
  opacity: 0.75;
}

.mode-btn--versus {
  --accent: #ff8fa3;
  --accent-glow: rgba(254, 74, 73, 0.4);
}

.mode-btn:hover,
.mode-btn:focus-visible {
  transform: translateY(-6px);
  border-color: var(--accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 14px 0 #09080f,
    0 0 26px var(--accent-glow);
}

.mode-btn:active {
  transform: translateY(3px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 3px 0 #09080f;
}

.mode-btn__sigil {
  font-size: 2rem;
  line-height: 1;
  color: var(--accent);
  text-shadow: 0 3px 0 #09080f;
}

.mode-btn__body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.mode-btn__title {
  font-family: var(--font-display);
  font-size: clamp(0.9rem, 1.5vw, 1.05rem);
  letter-spacing: 0.06em;
  color: var(--gold);
}

.mode-btn__copy {
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.mode-btn__arrow {
  font-family: var(--font-pixel);
  font-size: 0.9rem;
  color: var(--accent);
  transition: translate 0.16s ease;
}

/* Tutorial entry: a slim manual tab under the two mode slabs */
.title-guide {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: clamp(10px, 1.8vh, 18px);
  padding: 9px 16px 9px 12px;
  background: rgba(19, 16, 32, 0.72);
  border: 2px solid rgba(255, 190, 11, 0.5);
  outline: 2px solid #09080f;
  color: var(--ink-cream);
  cursor: pointer;
  box-shadow: 0 5px 0 #09080f;
  transition:
    transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.16s ease,
    background 0.16s ease;
}

.title-guide:hover,
.title-guide:focus-visible {
  transform: translateY(-3px);
  border-color: var(--gold);
  background: rgba(38, 30, 56, 0.92);
}

.title-guide:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #09080f;
}

.title-guide__icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  background: var(--gold);
  color: #15111e;
  font-family: var(--font-display);
  font-size: 0.68rem;
  line-height: 1;
  border: 2px solid #09080f;
}

.title-guide__label {
  font-family: var(--font-pixel);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold-bright);
}

.title-guide__hint {
  padding-left: 10px;
  border-left: 2px solid rgba(255, 190, 11, 0.3);
  font-family: var(--font-mono);
  font-size: 0.94rem;
  color: var(--ink-muted);
}

@media (max-width: 620px) {
  .title-guide__hint {
    display: none;
  }
}

.mode-btn:hover .mode-btn__arrow,
.mode-btn:focus-visible .mode-btn__arrow {
  translate: 4px 0;
}

@keyframes fan-bob {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -6px;
  }
}

@keyframes title-pulse {
  0%,
  100% {
    filter: drop-shadow(0 0 10px rgba(255, 190, 11, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 22px rgba(255, 190, 11, 0.75));
  }
}

@media (max-width: 760px) {
  .screen-title {
    padding: 24px 18px 32px;
  }
  .mode-cards {
    grid-template-columns: 1fr;
    width: min(420px, 100%);
  }
  .mode-btn {
    padding: 14px 16px;
  }
  .hero-heading {
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .hero-heading__num {
    font-size: clamp(4rem, 26vw, 6rem);
    margin-top: 6px;
  }
}

/* Lobby Screen */
.screen-lobby {
  flex: 1;
  padding: 18px 20px 30px;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
}

.lobby-marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  background: linear-gradient(180deg, #241a34, #171226);
  border: 4px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.14),
    0 8px 0 #09080f;
  padding: 10px 14px;
  margin-bottom: 18px;
}

.lobby-marquee__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lobby-marquee__badge {
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.18em;
  background: #0b0912;
  color: var(--gold);
  border: 2px solid rgba(255, 190, 11, 0.55);
  padding: 4px 8px;
}

.lobby-marquee__name {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--gold-bright);
  text-shadow: 0 3px 0 #09080f;
}

.lobby-grid {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .lobby-grid {
    grid-template-columns: 1fr;
  }
}

/* ------------------------- lobby selector (multiplayer) ------------------------- */

.browser-grid {
  display: grid;
  grid-template-columns: 0.95fr 1.05fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 900px) {
  .browser-grid {
    grid-template-columns: 1fr;
  }
}

.browser-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: linear-gradient(180deg, #201a2e 0%, #15111f 100%);
}

.browser-card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--gold);
  text-shadow: 0 3px 0 #09080f;
}

.browser-card h3 {
  margin: 0 0 10px;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(247, 240, 224, 0.6);
}

.browser-name {
  max-width: none;
}

.browser-create,
.browser-join {
  border-top: 2px dashed rgba(242, 201, 76, 0.22);
  padding-top: 14px;
}

.visibility-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.visibility-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  background: #120f18;
  border: 2px solid rgba(242, 201, 76, 0.3);
  padding: 10px;
  color: rgba(247, 240, 224, 0.65);
  cursor: pointer;
  transition: border-color 0.1s ease, background 0.1s ease;
}

.visibility-option:hover {
  border-color: rgba(242, 201, 76, 0.7);
}

.visibility-option--active {
  background: rgba(255, 190, 11, 0.14);
  border-color: var(--gold);
  box-shadow: inset 0 0 0 1px rgba(255, 190, 11, 0.35);
}

.visibility-option__title {
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--gold-bright);
}

.visibility-option__copy {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.2;
}

.browser-hint {
  margin: 10px 0 0;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.3;
  color: rgba(247, 240, 224, 0.55);
}

.browser-join__row {
  display: flex;
  gap: 8px;
}

.browser-code-input {
  font-family: var(--font-display);
  font-size: 1.1rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  text-align: center;
}

.browser-code-input::placeholder {
  color: rgba(247, 240, 224, 0.2);
  letter-spacing: 0.32em;
}

.browser-error {
  margin: 0;
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: #ffb2b2;
  background: rgba(254, 74, 73, 0.12);
  border-left: 3px solid var(--crimson);
}

.browser-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.browser-count {
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  color: #15111e;
  background: var(--gold);
  padding: 3px 8px;
}

.lobby-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

.lobby-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.35);
  padding: 9px 12px;
}

.lobby-row__code {
  font-family: var(--font-display);
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  color: var(--gold-bright);
  background: #0b0912;
  border: 2px solid rgba(242, 201, 76, 0.4);
  padding: 5px 7px;
}

.lobby-row__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lobby-row__host {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby-row__meta {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: rgba(247, 240, 224, 0.5);
}

.lobby-row__seats {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: #72efdd;
}

.lobby-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 18px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.4;
  color: rgba(247, 240, 224, 0.5);
  border: 2px dashed rgba(242, 201, 76, 0.22);
}

.lobby-code-block {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lobby-code-block__label {
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(247, 240, 224, 0.55);
  width: 100%;
}

.lobby-code-block__code {
  font-family: var(--font-display);
  font-size: 1.5rem;
  letter-spacing: 0.3em;
  color: var(--gold-bright);
  text-shadow: 0 3px 0 #09080f;
  background: #0b0912;
  border: 3px solid var(--gold);
  padding: 8px 12px 8px 18px;
}

.lobby-code-block__visibility {
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  padding: 4px 8px;
  color: #0b0f14;
  background: #72efdd;
}

.lobby-code-block__visibility--private {
  color: #f8f2e0;
  background: #6b4b9b;
}

.lobby-waiting-note {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--gold-bright);
}

/* ------------------------ seated mid-round (waiting) ------------------------ */

.waiting-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 9px 12px;
  background: rgba(255, 190, 11, 0.1);
  border: 2px solid var(--gold);
  border-left-width: 6px;
  box-shadow: 0 4px 0 #09080f;
}

.waiting-banner__badge {
  flex: none;
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  padding: 4px 8px;
  color: #15111e;
  background: var(--gold);
}

.waiting-banner__copy {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.3;
  color: rgba(247, 240, 224, 0.82);
}

.felt-table--waiting .workspace-viewport {
  pointer-events: none;
  filter: saturate(0.55) brightness(0.85);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-header h2,
.lobby-settings h2 {
  margin: 0 0 14px;
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--gold);
  text-shadow: 0 3px 0 #09080f;
}

.lobby-players,
.lobby-settings {
  background: linear-gradient(180deg, #201a2e 0%, #15111f 100%);
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.4);
  padding: 9px 12px;
}

.player-ident {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-badge {
  background: var(--gold);
  color: #191521;
  font-size: 0.68rem;
  font-weight: 900;
  padding: 2px 6px;
}

.player-name {
  font-weight: 700;
}

.player-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-pts {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--gold);
}

.player-ready {
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  letter-spacing: 0.06em;
  padding: 3px 6px;
  border: 1px solid rgba(242, 201, 76, 0.28);
  color: rgba(247, 240, 224, 0.5);
}

.player-ready--on {
  color: #0b0f14;
  background: #72efdd;
  border-color: #72efdd;
}

.mp-connect {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
  padding: 12px;
  border: 2px dashed rgba(242, 201, 76, 0.28);
  background: rgba(8, 10, 16, 0.45);
}

.mp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  color: rgba(247, 240, 224, 0.65);
}

.mp-connect__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mp-status {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.35;
  color: rgba(247, 240, 224, 0.72);
  word-break: break-word;
}

.mp-status--connected {
  color: #72efdd;
}

.mp-status--error,
.mp-status--disconnected {
  color: #ff8f8f;
}

fieldset.settings-form {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}

fieldset.settings-form:disabled {
  opacity: 0.55;
}

.input-arcade {
  background: #120f18;
  color: var(--ink-cream);
  border: 2px solid rgba(242, 201, 76, 0.65);
  padding: 8px 10px;
  font-size: 0.9rem;
  width: 100%;
}

.input-short {
  max-width: 130px;
}

.scoring-summary-box {
  background: rgba(12, 10, 18, 0.65);
  border-left: 4px solid var(--gold);
  padding: 12px 14px;
  margin-bottom: 18px;
  font-size: 0.86rem;
}

.scoring-summary-box h3 {
  margin: 0 0 8px;
  font-size: 0.92rem;
  color: var(--gold);
}

.scoring-summary-box ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-start-game {
  width: 100%;
  padding: 13px;
  font-size: 1.05rem;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-row > label {
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--gold);
}

.field-subrow {
  flex-direction: row;
  gap: 16px;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.operator-toggles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
}

.toggle-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.4);
  padding: 8px 10px;
  font-size: 0.84rem;
  cursor: pointer;
}

/* Playing Screen: Balatro-ish table with left HUD rail, filling the viewport */
.screen-playing {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 14px 20px 18px;
  max-width: 1520px;
  width: 100%;
  margin: 0 auto;
}

.table-layout {
  display: grid;
  grid-template-columns: 262px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.table-sidebar {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.table-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 1000px) {
  .table-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .table-sidebar {
    position: static;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
  .sidebar-actions {
    grid-column: 1 / -1;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .sidebar-actions .btn-arcade {
    flex: 1;
  }
}

@media (max-width: 640px) {
  .table-sidebar {
    grid-template-columns: 1fr;
  }
  .sidebar-actions {
    grid-column: auto;
    flex-direction: column;
  }
  .screen-playing {
    padding: 10px 12px 22px;
  }
}

.sidebar-panel {
  background: #13111c;
  border: 3px solid #3a3550;
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  padding: 8px 10px 10px;
}

.sidebar-panel__title {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 6px;
}

.workspace-stack {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ws-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1d1830;
  color: var(--ink-cream);
  border: 2px solid #3a3550;
  padding: 5px 8px;
  font-family: var(--font-pixel);
  text-align: left;
  cursor: pointer;
  transition: transform 0.1s steps(2), border-color 0.12s ease, background 0.12s ease;
}

.ws-tab:hover {
  border-color: var(--gold);
  transform: translateX(2px);
}

.ws-tab--active {
  background: var(--gold);
  border-color: #fff9db;
  color: #15111e;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.28);
  transform: translateX(3px);
}

.ws-tab-num {
  font-weight: 800;
  font-size: 0.82rem;
}

.ws-tab-key {
  margin-left: auto;
  font-size: 0.56rem;
  opacity: 0.55;
  border: 1px solid currentColor;
  padding: 0 3px;
}

.sidebar-timer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #120f18;
  border: 3px solid var(--crimson);
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  padding: 6px 10px;
}

.sidebar-timer__label {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.2em;
  color: var(--ink-muted);
}

.sidebar-timer__digits {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  line-height: 1;
  color: #ffccd5;
}

.sidebar-timer--urgent {
  animation: timer-throb 0.85s steps(2, end) infinite;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-arcade--block {
  width: 100%;
}

/* Equation ribbon above the felt */
.equation-ribbon {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 12px;
  border: 3px solid;
  outline: 3px solid #09080f;
  box-shadow: 0 5px 0 #09080f;
  font-size: 0.86rem;
  min-height: 44px;
}

.equation-ribbon--good {
  background: rgba(46, 196, 182, 0.16);
  border-color: var(--emerald);
  color: #d8fffa;
}

.equation-ribbon--bad {
  background: rgba(254, 74, 73, 0.14);
  border-color: var(--crimson);
  color: #ffd9d9;
}

.equation-ribbon--idle {
  background: rgba(255, 255, 255, 0.04);
  border-color: #3a3550;
  color: var(--ink-muted);
}

.equation-ribbon__tag {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  padding: 3px 6px;
  background: #09080f;
  color: var(--gold);
  white-space: nowrap;
}

.equation-ribbon__eq {
  font-family: var(--font-mono);
  font-size: 1.08rem;
  color: #fff;
  overflow-wrap: anywhere;
}

.equation-ribbon__score {
  margin-left: auto;
  font-family: var(--font-pixel);
  font-size: 0.68rem;
  background: var(--gold);
  color: #15111e;
  padding: 3px 7px;
  white-space: nowrap;
}

.equation-ribbon--idle .equation-ribbon__tag {
  color: #72efdd;
}

/* Floating operation cues over the felt */
.cue-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
}

.float-cue {
  position: absolute;
  top: 34%;
  left: 50%;
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: var(--gold-bright);
  text-shadow: 0 3px 0 #09080f, 0 0 12px rgba(255, 190, 11, 0.5);
  white-space: nowrap;
  animation: cue-rise 1s cubic-bezier(0.2, 1, 0.3, 1) forwards;
}

.float-cue--bad {
  color: var(--crimson);
}

.float-cue--good {
  color: #72efdd;
}

/* Target-hit flash on the shell */
.impact--hit::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9000;
  background: radial-gradient(circle at 28% 40%, rgba(255, 190, 11, 0.3), transparent 62%);
  animation: hit-flash 0.6s ease-out forwards;
}

@keyframes cue-rise {
  0% {
    opacity: 0;
    transform: translate(-50%, 14px) scale(0.78);
  }
  22% {
    opacity: 1;
    transform: translate(-50%, -8px) scale(1.12);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -72px) scale(1);
  }
}

@keyframes hit-flash {
  0% {
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes timer-throb {
  50% {
    background: #2a0f16;
    box-shadow: 0 0 0 3px rgba(254, 74, 73, 0.45), 0 6px 0 #09080f;
  }
}

/* Felt Board — fills whatever height the screen has left */
.felt-table {
  position: relative;
  flex: 1;
  min-height: 380px;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at 50% 50%, #1f4737 0%, #122b21 85%);
  border: 4px solid #2d5a46;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.55),
    0 8px 0 #0b0910;
  overflow: hidden;
}

/* Top-left status: errors and the waiting-for-operand chip */
.board-toasts {
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
}

.error-toast {
  background: var(--crimson);
  color: #fff;
  padding: 4px 10px;
  font-weight: 800;
  font-size: 0.82rem;
  border: 2px solid #09080f;
}

.pending-chip {
  background: rgba(12, 15, 22, 0.92);
  border: 2px solid var(--gold);
  color: var(--gold);
  padding: 4px 10px;
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pan-coords {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: rgba(247, 240, 224, 0.5);
  background: rgba(10, 13, 18, 0.62);
  border: 1px solid rgba(242, 201, 76, 0.22);
  padding: 3px 7px;
}

.btn-arcade--tiny {
  padding: 4px 10px;
  font-size: 0.76rem;
}

/* Workspace viewport with infinite pan plane — grows to the felt's bottom */
.workspace-viewport {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  background-image: radial-gradient(rgba(242, 201, 76, 0.14) 1px, transparent 1px);
  background-size: 28px 28px;
}

.workspace-viewport--panning {
  cursor: grabbing;
}

.workspace-plane {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  will-change: transform;
}

.draggable-group-slot {
  position: absolute;
  z-index: 2;
  user-select: none;
  touch-action: none;
}

.draggable-group-slot--selected {
  z-index: 12;
}

.draggable-group-slot--dragging {
  z-index: 25;
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.65));
}

/* Operator rail: vertical, floating over the top-right of the felt */
.op-rail {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 30;
  width: 58px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 7px 6px;
  max-height: calc(100% - 20px);
  overflow-y: auto;
  scrollbar-width: thin;
  background: rgba(10, 13, 20, 0.84);
  border: 2px solid rgba(242, 201, 76, 0.45);
  box-shadow: 0 5px 0 rgba(9, 8, 15, 0.65);
  backdrop-filter: blur(2px);
}

.op-rail__group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.op-rail__tag {
  width: 100%;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(242, 201, 76, 0.3);
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  letter-spacing: 0.12em;
  text-align: center;
  color: var(--gold);
}

.op-rail__tag--unary {
  color: #72efdd;
  border-color: rgba(114, 239, 221, 0.3);
}

.op-square {
  position: relative;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  padding: 0;
  background: #241e33;
  border: 2px solid #4a4166;
  box-shadow: 0 3px 0 #09080f;
  color: var(--gold);
  cursor: pointer;
  transition:
    transform 0.1s ease,
    border-color 0.14s ease,
    background 0.14s ease;
}

.op-square:hover:not(:disabled),
.op-square:focus-visible {
  background: #302846;
  border-color: var(--gold-bright);
  transform: translateY(-2px);
}

.op-square:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.op-square__sym {
  font-family: var(--font-mono);
  font-size: 0.98rem;
  font-weight: 900;
  line-height: 1;
}

.btn-op--unary {
  border-color: rgba(114, 239, 221, 0.5);
  color: #72efdd;
}

.btn-op--active {
  background: var(--crimson);
  border-color: #fff;
  color: #fff;
}

.op-key {
  position: absolute;
  top: 1px;
  right: 3px;
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--gold-bright);
  opacity: 0.75;
  pointer-events: none;
}

.btn-op--unary .op-key {
  color: #72efdd;
}

.btn-op:disabled .op-key {
  opacity: 0.4;
}

/* Hover name plates, rendered outside the scrolling rail so they cannot clip */
.rail-hint,
.actions-hint,
.pan-hint {
  position: absolute;
  z-index: 40;
  padding: 5px 9px;
  background: #0d0b14;
  border: 2px solid var(--gold);
  color: var(--ink-cream);
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.06em;
  white-space: nowrap;
  pointer-events: none;
  animation: hint-in 0.1s ease-out;
}

.rail-hint {
  top: 18px;
  right: calc(10px + 58px + 10px);
}

.actions-hint {
  right: 12px;
  bottom: calc(12px + 40px + 10px);
}

.pan-hint {
  left: 12px;
  bottom: calc(12px + 34px + 10px);
}

/* Cards ease into a tidied grid instead of teleporting; only while tidying, so
   dragging a slot around never lags behind the pointer. */
.workspace-plane--tidying .draggable-group-slot {
  transition:
    left 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    top 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes hint-in {
  from {
    opacity: 0;
    transform: translateX(4px);
  }
}

/* Group & history actions: bottom-right, horizontal */
.board-actions {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 30;
  display: flex;
  gap: 8px;
}

.board-action {
  position: relative;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  background: rgba(18, 15, 27, 0.9);
  border: 2px solid rgba(242, 201, 76, 0.4);
  box-shadow: 0 3px 0 #09080f;
  color: var(--ink-cream);
  cursor: pointer;
  transition:
    transform 0.1s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.board-action:hover:not(:disabled),
.board-action:focus-visible {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
  transform: translateY(-2px);
}

.board-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.board-action__icon {
  font-size: 1rem;
  line-height: 1;
}

/* Pan readout + recenter: bottom-left */
.board-pan {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
}

.board-icon-btn {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  background: rgba(18, 15, 27, 0.9);
  border: 2px solid rgba(242, 201, 76, 0.35);
  color: var(--ink-cream);
  cursor: pointer;
  transition:
    color 0.14s ease,
    border-color 0.14s ease;
}

.board-icon-btn:hover,
.board-icon-btn:focus-visible {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
}


/* Round End & Game Over */
.screen-round-end,
.screen-game-over {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 26px 20px 40px;
}

.results-cabinet {
  position: relative;
  max-width: 880px;
  width: 100%;
  background: linear-gradient(180deg, #221a34 0%, #120f1c 70%);
  border: 5px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 0 60px rgba(255, 190, 11, 0.08),
    0 12px 0 #09080f;
  padding: 20px 22px 22px;
  animation: balatro-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.results-cabinet--bust {
  border-color: #6b5a7a;
}

.results-cabinet--win {
  border-color: var(--gold);
}

.results-cabinet--final {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-color: var(--crimson);
}

.results-marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #0b0912;
  border: 2px solid rgba(255, 190, 11, 0.5);
  padding: 6px 10px;
}

.results-marquee__round {
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  letter-spacing: 0.24em;
  color: var(--gold);
}

.results-marquee__target {
  font-family: var(--font-mono);
  font-size: 1rem;
  color: var(--ink-cream);
}

.results-marquee__target strong {
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--gold-bright);
  margin-left: 4px;
}

.results-stamp {
  display: inline-block;
  margin: 20px 0 6px;
  padding: 10px 18px 8px;
  font-family: var(--font-display);
  font-size: 1.5rem;
  line-height: 1;
  border: 4px solid;
  outline: 4px solid #09080f;
  box-shadow: 0 8px 0 #09080f;
  transform: rotate(-4deg);
  animation: stamp-drop 0.45s cubic-bezier(0.22, 1.4, 0.36, 1);
}

.results-stamp--win {
  background: var(--gold);
  border-color: #fff9db;
  color: #15111e;
  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.5);
}

.results-stamp--bust {
  background: #2a2338;
  border-color: var(--crimson);
  color: #ffb3b3;
}

.results-title {
  margin: 10px 0 16px;
  font-family: var(--font-pixel);
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink-cream);
}

/* Shown when several boards tie for best and share the round */
.split-note {
  margin: 6px 0 0;
  max-width: 46ch;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  line-height: 1.3;
  color: var(--gold-bright);
}

.split-note strong {
  color: var(--ink-cream);
}

.gameover-title {
  margin: 12px 0 4px;
  font-family: var(--font-display);
  font-size: 1.35rem;
  color: var(--gold);
  text-shadow: 0 4px 0 #09080f;
}

.standings-row--centered,
.round-end-actions--centered {
  justify-content: center;
}

.standing-card--top {
  border-color: var(--gold);
  background: rgba(255, 190, 11, 0.14);
  box-shadow: 0 4px 0 #09080f;
}

@keyframes stamp-drop {
  0% {
    opacity: 0;
    transform: scale(2.1) rotate(-14deg);
  }
  70% {
    opacity: 1;
    transform: scale(0.94) rotate(-3deg);
  }
  100% {
    transform: scale(1) rotate(-4deg);
  }
}

.solutions-table {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 22px;
}

.solution-row {
  display: grid;
  grid-template-columns: 100px 150px 1fr auto;
  align-items: center;
  gap: 12px;
  background: #241f30;
  border: 2px solid rgba(242, 201, 76, 0.4);
  padding: 12px 14px;
}

@media (max-width: 700px) {
  .solution-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'rank score'
      'player player'
      'eq eq';
    row-gap: 8px;
  }
  .sol-rank {
    grid-area: rank;
    white-space: nowrap;
    font-size: 0.76rem;
  }
  .sol-score {
    grid-area: score;
    justify-self: end;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }
  .sol-player {
    grid-area: player;
  }
  .sol-equation {
    grid-area: eq;
    font-size: 0.92rem;
    overflow-wrap: anywhere;
  }
  .round-end-actions .btn-arcade {
    flex: 1 1 140px;
  }
}

.solution-row--winner {
  border-color: var(--gold);
  background: rgba(242, 201, 76, 0.12);
}

.sol-rank {
  font-weight: 900;
  color: var(--gold);
  font-size: 0.85rem;
}

.sol-player {
  display: flex;
  flex-direction: column;
}

.sol-ws {
  font-size: 0.74rem;
  color: var(--ink-muted);
}

.sol-equation {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 800;
  color: #fff;
}

.score-pill {
  background: var(--gold);
  color: #191521;
  font-weight: 900;
  padding: 4px 9px;
  font-size: 0.85rem;
}

.no-solutions-banner {
  background: rgba(230, 57, 70, 0.16);
  border: 2px dashed var(--crimson);
  padding: 18px;
  text-align: center;
  margin-bottom: 20px;
}

.standings-strip {
  margin-bottom: 22px;
}

.standings-strip h3 {
  font-size: 0.9rem;
  color: var(--ink-muted);
  margin: 0 0 10px;
}

.standings-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.standing-card {
  background: #120f18;
  border: 1px solid rgba(242, 201, 76, 0.5);
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.standing-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  letter-spacing: 0.08em;
  color: #15111e;
  background: var(--gold);
}

.standing-name {
  font-weight: 700;
}

.standing-pts {
  color: var(--gold);
  font-family: var(--font-mono);
  font-weight: 800;
}

.round-end-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.gameover-joker {
  width: 84px;
  height: 112px;
  margin-top: 16px;
  animation: fan-bob 3s ease-in-out infinite;
}

.winner-callout {
  font-size: 1.2rem;
  margin: 8px 0 20px;
}

/* Board overlays shrink with the screen; kept last so they beat the base sizes */
@media (max-width: 1000px) {
  .felt-table {
    min-height: 420px;
  }
  /* Narrow boards: wrap the rail into two columns so no operator hides behind a scrollbar */
  .op-rail {
    width: auto;
  }
  .op-rail__group {
    display: grid;
    grid-template-columns: repeat(2, auto);
    justify-items: center;
  }
  .op-rail__tag {
    grid-column: 1 / -1;
  }
  .rail-hint {
    right: calc(10px + 106px + 10px);
  }
}

@media (max-width: 640px) {
  .op-rail {
    top: 8px;
    right: 8px;
    width: auto;
    gap: 4px;
    padding: 5px 4px;
    /* stop above the bottom-right action bar */
    max-height: calc(100% - 62px);
  }
  .rail-hint {
    top: 16px;
    right: calc(8px + 80px + 10px);
  }
  .op-square {
    width: 32px;
    height: 32px;
  }
  .op-square__sym {
    font-size: 0.86rem;
  }
  .board-actions {
    right: 8px;
    bottom: 8px;
    gap: 6px;
  }
  .board-action {
    width: 36px;
    height: 36px;
  }
  .board-pan {
    left: 8px;
    bottom: 8px;
  }
  .board-icon-btn {
    width: 32px;
    height: 32px;
  }
  .pan-hint {
    left: 8px;
    bottom: calc(8px + 32px + 10px);
  }
  .board-pan .pan-coords {
    display: none;
  }
}
</style>
