<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import CardGroupNode from './components/CardGroupNode.vue'
import ScorePanel from './components/ScorePanel.vue'
import { isSfxEnabled, playSfx, toggleSfx } from './audio/sfx'
import { dealHand, generateTargetNumber } from './engine/deck'
import { OPERATOR_CATALOG, formatNumber, getEnabledOperators } from './engine/math'
import { findSampleSolutions } from './engine/solver'
import type {
  BinaryOperator,
  Card,
  GameMode,
  GameSettings,
  OperatorId,
  PlayerInfo,
  ScreenPhase,
  SubmittedSolution,
  WorkspaceState,
} from './engine/types'
import {
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

const players = ref<PlayerInfo[]>([
  {
    id: 'p-local',
    name: 'You (Host)',
    isHost: true,
    isReady: true,
    points: 0,
    bestRoundScore: null,
  },
])

const newPlayerName = ref('')
const roundNumber = ref(1)
const currentTarget = ref(24)
const currentHand = ref<Card[]>([])
const workspaces = ref<WorkspaceState[]>([])
const activeWorkspaceIdx = ref(0)
const actionError = ref<string | null>(null)
const roundSolutions = ref<SubmittedSolution[]>([])
const roundWinnerId = ref<string | null>(null)
const matchWinner = ref<PlayerInfo | null>(null)

/* ------------------------- juice: SFX, impact, cues ------------------------- */

const sfxOn = ref(isSfxEnabled())
const impactKind = ref<'op' | 'split' | 'error' | 'hit' | null>(null)
const hitSignal = ref(0)
const shellRef = ref<HTMLElement | null>(null)
const feltRef = ref<HTMLElement | null>(null)
const sidebarRef = ref<HTMLElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const panGlide = ref(false)

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

  const slots = groupIds
    .map((id) => viewport.querySelector<HTMLElement>(`[data-testid="group-slot-${id}"]`))
    .filter((slot): slot is HTMLElement => slot !== null)
  if (slots.length === 0) return

  // Union of every slot's layout box (ignores selected/pop transforms).
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const slot of slots) {
    minX = Math.min(minX, slot.offsetLeft)
    minY = Math.min(minY, slot.offsetTop)
    maxX = Math.max(maxX, slot.offsetLeft + slot.offsetWidth)
    maxY = Math.max(maxY, slot.offsetTop + slot.offsetHeight)
  }

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

const floatingCues = ref<{ id: number; text: string; tone: 'good' | 'bad' | 'neutral' }[]>([])
let cueSeed = 0
let impactTimer: ReturnType<typeof setTimeout> | null = null
let sawAcceptable = false
const cueTimers = new Set<ReturnType<typeof setTimeout>>()

/** Physical feedback: Web Animations API so every repeat replays cleanly. */
function triggerImpact(kind: 'op' | 'split' | 'error' | 'hit'): void {
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

  feel?.animate(
    kind === 'op'
      ? [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-5px) scale(1.008)' },
          { transform: 'translateY(0) scale(1)' },
        ]
      : [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(3px) scale(0.995)' },
          { transform: 'translateY(0) scale(1)' },
        ],
    { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  )
}

function pushCue(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  const id = ++cueSeed
  floatingCues.value = [...floatingCues.value.slice(-3), { id, text, tone }]
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
  phase.value = 'title'
}

function goToLobby(): void {
  playSfx('click')
  phase.value = 'lobby'
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

// Timer for timed multiplayer modes
const remainingSeconds = ref<number | null>(null)
let timerHandle: ReturnType<typeof setInterval> | null = null
let roundStartTimestamp = 0

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

const currentEvaluation = computed(() => {
  const ws = activeWorkspace.value
  if (!ws) {
    return null
  }
  return evaluateWorkspaceSolution(ws, currentTarget.value, settings.approximationPercent)
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
    if (players.value.length === 1) {
      players.value = [
        {
          id: 'p-local',
          name: 'You (Host)',
          isHost: true,
          isReady: true,
          points: 0,
          bestRoundScore: null,
        },
        {
          id: 'p-bot-1',
          name: 'Jester_99',
          isHost: false,
          isReady: true,
          points: 0,
          bestRoundScore: null,
        },
        {
          id: 'p-bot-2',
          name: 'EulerFan',
          isHost: false,
          isReady: true,
          points: 0,
          bestRoundScore: null,
        },
      ]
    }
  } else {
    players.value = [
      {
        id: 'p-local',
        name: 'You',
        isHost: true,
        isReady: true,
        points: 0,
        bestRoundScore: null,
      },
    ]
  }
  phase.value = 'lobby'
}

function addLobbyPlayer(): void {
  const trimmed = newPlayerName.value.trim()
  if (!trimmed) return
  players.value.push({
    id: `p-${Date.now()}`,
    name: trimmed,
    isHost: false,
    isReady: true,
    points: 0,
    bestRoundScore: null,
  })
  newPlayerName.value = ''
}

function removeLobbyPlayer(id: string): void {
  players.value = players.value.filter((p) => p.id !== id || p.isHost)
}

function getModeDurationSeconds(mode: GameMode): number | null {
  switch (mode) {
    case 'first-to-solve':
      return null
    case 'best-30s':
      return 30
    case 'best-1m':
      return 60
    case 'best-3m':
      return 180
    case 'best-5m':
      return 300
    case 'best-10m':
      return 600
  }
}

function clearRoundTimer(): void {
  if (timerHandle) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

function startMatchFromLobby(): void {
  // Ensure at least one operator category is enabled
  const anyEnabled = Object.values(settings.allowedOperators).some(Boolean)
  if (!anyEnabled) {
    settings.allowedOperators.basic = true
  }
  roundNumber.value = 1
  matchWinner.value = null
  for (const p of players.value) {
    p.points = 0
    p.bestRoundScore = null
  }
  startNewRound()
}

function startNewRound(): void {
  clearRoundTimer()
  actionError.value = null
  roundSolutions.value = []
  roundWinnerId.value = null
  sawAcceptable = false
  playSfx('deal')

  currentTarget.value = generateTargetNumber(settings)
  currentHand.value = dealHand(settings.numCards, settings.cardPool)
  workspaces.value = createAllWorkspaces(currentHand.value)
  activeWorkspaceIdx.value = 0
  for (const p of players.value) {
    p.bestRoundScore = null
  }

  roundStartTimestamp = Date.now()
  phase.value = 'playing'

  if (settings.isMultiplayer) {
    const duration = getModeDurationSeconds(settings.mode)
    if (duration !== null) {
      remainingSeconds.value = duration
      timerHandle = setInterval(() => {
        if (remainingSeconds.value !== null && remainingSeconds.value > 0) {
          remainingSeconds.value--
          if (remainingSeconds.value <= 5) playSfx('tick')
          if (remainingSeconds.value <= 0) {
            finishRound('timer')
          }
        }
      }, 1000)
    } else {
      remainingSeconds.value = null
    }
  } else {
    remainingSeconds.value = null
  }
}

function recordPlayerSolutionFromWorkspace(): SubmittedSolution | null {
  const evalRes = currentEvaluation.value
  if (!evalRes || !evalRes.isSingleGroup || !evalRes.acceptable || evalRes.score === null) {
    return null
  }
  const localPlayer = players.value[0]!
  const existingIdx = roundSolutions.value.findIndex(
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
    roundSolutions.value.push(entry)
  } else {
    roundSolutions.value[existingIdx] = entry
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
    if (phase.value !== 'playing' || !evalRes) return
    const acceptableNow = evalRes.isSingleGroup && evalRes.acceptable
    if (acceptableNow && !sawAcceptable) {
      hitSignal.value += 1
      playSfx('hit')
      triggerImpact('hit')
      pushCue('TARGET HIT', 'good')
    }
    sawAcceptable = acceptableNow
    if (acceptableNow) {
      recordPlayerSolutionFromWorkspace()
      if (settings.isMultiplayer && settings.mode === 'first-to-solve') {
        finishRound('first-to-solve')
      }
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
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  const res = applyOperatorInWorkspace(ws, opId)
  if (res.changed) {
    const meta = OPERATOR_CATALOG.find((op) => op.id === opId)
    playSfx('place')
    triggerImpact('op')
    pushCue(`${meta?.shortSymbol ?? '?'} ${operationCueSuffix()}`, 'neutral')
  } else {
    if (res.error) actionError.value = res.error
    playSfx('error')
    triggerImpact('error')
    pushCue('NOPE', 'bad')
  }
}

function operationCueSuffix(): string {
  // Binary merges always cost a flat 10 pts; unary stacks ramp up.
  return '+10'
}

function handleUndo(): void {
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  undoWorkspace(ws)
  playSfx('click')
}

function handleRedo(): void {
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  redoWorkspace(ws)
  playSfx('click')
}

function handleResetWorkspace(): void {
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
  clearRoundTimer()
  recordPlayerSolutionFromWorkspace()

  // In timed multiplayer modes, if other lobby players exist and round wasn't skipped,
  // check if any sample solutions exist so the round-end screen showcases competitive solutions
  if (
    settings.isMultiplayer &&
    reason !== 'skip' &&
    reason !== 'first-to-solve' &&
    players.value.length > 1
  ) {
    const enabledBin: BinaryOperator[] = ['add', 'sub', 'mult', 'div']
    if (settings.allowedOperators.powers) {
      enabledBin.push('pow', 'root')
    }
    const samples = findSampleSolutions(
      currentHand.value,
      currentTarget.value,
      settings.approximationPercent,
      enabledBin,
      2
    )
    const bots = players.value.slice(1)
    samples.forEach((sample, idx) => {
      const bot = bots[idx % bots.length]
      if (!bot) return
      const alreadyHas = roundSolutions.value.some((s) => s.playerId === bot.id)
      if (!alreadyHas) {
        roundSolutions.value.push({
          id: `bot-sol-${idx}`,
          playerId: bot.id,
          playerName: bot.name,
          equation: sample.equation,
          lhs: sample.lhs,
          finalValue: sample.finalValue,
          score: sample.score,
          errorPercent: sample.errorPercent,
          timestampMs: 4500 + idx * 1200,
          workspaceIndex: 1,
        })
        bot.bestRoundScore = sample.score
      }
    })
  }

  // Award point to winning player if not skipped and at least one acceptable solution exists
  if (reason !== 'skip' && sortedRoundSolutions.value.length > 0) {
    const bestSol = sortedRoundSolutions.value[0]!
    roundWinnerId.value = bestSol.playerId
    const winner = players.value.find((p) => p.id === bestSol.playerId)
    if (winner) {
      winner.points += 1
      if (winner.points >= settings.firstToPoints) {
        matchWinner.value = winner
      }
    }
  } else {
    roundWinnerId.value = null
  }

  phase.value = 'round-end'
}

function advanceAfterRoundEnd(): void {
  if (matchWinner.value) {
    phase.value = 'game-over'
    return
  }
  roundNumber.value += 1
  startNewRound()
}

function endEntireGameNow(): void {
  clearRoundTimer()
  // Determine top scorer if any
  const sortedPlayers = [...players.value].sort((a, b) => b.points - a.points)
  matchWinner.value = sortedPlayers[0] && sortedPlayers[0].points > 0 ? sortedPlayers[0] : null
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

  if (menuOpen.value || phase.value !== 'playing') return

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
  if (key >= '1' && key <= '5' && e.altKey) {
    e.preventDefault()
    switchWorkspace(Number(key) - 1)
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
  clearRoundTimer()
  if (impactTimer) clearTimeout(impactTimer)
  cueTimers.forEach((timer) => clearTimeout(timer))
  cueTimers.clear()
})
</script>

<template>
  <div ref="shellRef" class="app-shell" :class="impactKind ? `impact--${impactKind}` : ''">
    <!-- ======================== TITLE SCREEN ======================== -->
    <main v-if="phase === 'title'" class="screen-title" :inert="menuOpen">
      <div class="title-cabinet">
        <!-- marquee bulbs -->
        <div class="marquee-bulbs" aria-hidden="true">
          <span v-for="n in 22" :key="n" :style="{ animationDelay: `${(n % 6) * 0.12}s` }"></span>
        </div>

        <div class="title-cabinet__inner">
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
              class="mode-card mode-card--solo"
              data-testid="enter-singleplayer"
              @click="enterLobby(false)"
            >
              <span class="mode-card__icon" aria-hidden="true">♠</span>
              <span class="mode-card__title">SOLO RUN</span>
              <span class="mode-card__copy">
                5 auto-saved workspaces. Tinker, refine, submit whenever you like.
              </span>
              <span class="mode-card__cta">Enter singleplayer ▸</span>
            </button>

            <button
              type="button"
              class="mode-card mode-card--versus"
              data-testid="enter-multiplayer"
              @click="enterLobby(true)"
            >
              <span class="mode-card__icon" aria-hidden="true">♥</span>
              <span class="mode-card__title">HEAD TO HEAD</span>
              <span class="mode-card__copy">
                Race to the first valid solution, or post the cheapest one before the clock
                dies.
              </span>
              <span class="mode-card__cta">Enter multiplayer ▸</span>
            </button>
          </div>

          <div class="title-foot">
            <span class="title-foot__blink">▮</span> INSERT A LITTLE ARITHMETIC
            <span class="title-foot__sep">·</span>
            <span class="title-foot__key">ESC</span> MENU
          </div>
        </div>
      </div>
    </main>

    <!-- ======================== LOBBY & SETTINGS SCREEN ======================== -->
    <main v-else-if="phase === 'lobby'" class="screen-lobby" :inert="menuOpen">
      <div class="lobby-marquee">
        <div class="lobby-marquee__left">
          <span class="lobby-marquee__badge">
            {{ settings.isMultiplayer ? 'MULTIPLAYER' : 'SINGLEPLAYER' }}
          </span>
          <span class="lobby-marquee__name">Table Setup</span>
        </div>
        <span class="lobby-marquee__hint">Pick your table rules, then deal the cards</span>
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
                <span class="player-pts">{{ player.points }} / {{ settings.firstToPoints }} pts</span>
                <button
                  v-if="settings.isMultiplayer && !player.isHost"
                  type="button"
                  class="btn-kick"
                  @click="removeLobbyPlayer(player.id)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div v-if="settings.isMultiplayer" class="add-player-bar">
            <input
              v-model="newPlayerName"
              type="text"
              placeholder="Add contender name..."
              class="input-arcade"
              @keyup.enter="addLobbyPlayer"
            />
            <button type="button" class="btn-arcade" @click="addLobbyPlayer">
              Add Player
            </button>
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
                <code>Γ</code> are nested directly together
              </li>
            </ul>
          </div>

          <div class="lobby-start-cta">
            <button
              type="button"
              class="btn-arcade btn-arcade--gold btn-start-game"
              data-testid="start-round-btn"
              @click="startMatchFromLobby"
            >
              Deal Cards &amp; Start Match
            </button>
          </div>
        </section>

        <!-- Right column: Full Game Settings per Spec -->
        <section class="panel-box lobby-settings">
          <h2>Table Settings</h2>

          <div class="settings-form">
            <!-- Mode (multiplayer only dropdown) -->
            <div class="field-row">
              <label for="setting-mode">Mode</label>
              <template v-if="settings.isMultiplayer">
                <select id="setting-mode" v-model="settings.mode" class="input-arcade">
                  <option value="first-to-solve">
                    First to solve (ends immediately on valid solution)
                  </option>
                  <option value="best-30s">Best solution in 30 sec</option>
                  <option value="best-1m">Best solution in 1 min</option>
                  <option value="best-3m">Best solution in 3 min</option>
                  <option value="best-5m">Best solution in 5 min</option>
                  <option value="best-10m">Best solution in 10 min</option>
                </select>
              </template>
              <div v-else class="static-setting-note">
                Singleplayer: Improve your solution as much as possible and end the round at
                any time.
              </div>
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
                  <span>Factorials &amp; gamma (x!, Γ(x))</span>
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
          </div>
        </section>
      </div>
    </main>

    <!-- ======================== LIVE GAMEPLAY SCREEN ======================== -->
    <main v-else-if="phase === 'playing'" class="screen-playing" :inert="menuOpen">
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
            :groups-left="activeWorkspace?.groups.length ?? currentHand.length"
            :groups-total="currentHand.length"
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
                <span class="ws-tab-meta">{{ ws.groups.length }} grp</span>
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
              @click="finishRound('player-end')"
            >
              {{ settings.isMultiplayer ? 'End Round' : 'Finish & Submit' }}
            </button>
            <button
              type="button"
              class="btn-arcade btn-arcade--block"
              data-testid="skip-round-btn"
              @click="finishRound('skip')"
            >
              Skip Round
            </button>
            <button
              type="button"
              class="btn-arcade btn-arcade--crimson btn-arcade--block"
              @click="endEntireGameNow"
            >
              End Match
            </button>
          </div>
        </aside>

        <!-- ============ Table ============ -->
        <div class="table-main">
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
              {{ activeWorkspace?.groups.length ?? 0 }} group(s) left · combine all
              {{ currentHand.length }} cards into one
            </span>
          </div>

      <!-- Interactive Felt Board for Active Workspace -->
      <section ref="feltRef" class="felt-table">
        <div class="board-instructions">
          <div class="instruction-text">
            <template v-if="!activeWorkspace?.selectedGroupId">
              <span>
                Click a card or merged group to select it. Drag cards to arrange them, or drag empty
                felt to pan.
              </span>
            </template>
            <template v-else-if="!activeWorkspace?.pendingOperator">
              <span>
                Selected group (value
                <strong>
                  {{ formatNumber(selectedGroupNode?.value ?? 0) }}
                </strong>
                ) — choose a <strong>unary operator</strong>, a
                <strong>binary operator</strong>, or
                <strong>ungroup</strong> if merged.
              </span>
            </template>
            <template v-else>
              <span class="pending-banner" data-testid="pending-operator-banner">
                Pending binary operator:
                <strong>
                  {{ pendingOperatorMeta?.label }} ({{ pendingOperatorMeta?.shortSymbol }})
                </strong>
                — now select the second card/group (right operand) to stack them!
              </span>
            </template>
          </div>

          <div class="board-toolbar">
            <span v-if="actionError" class="error-toast" role="alert">
              ⚠ {{ actionError }}
            </span>
            <span class="pan-coords" data-testid="pan-coords">
              Pan: {{ activeWorkspace?.panX ?? 0 }}, {{ activeWorkspace?.panY ?? 0 }}
            </span>
            <button
              type="button"
              class="btn-arcade btn-arcade--tiny"
              data-testid="recenter-view-btn"
              @click="handleRecenterView"
            >
              ⌖ Center View
            </button>
          </div>
        </div>

        <!-- Fixed-Size Panner Viewport & Draggable Card Groups -->
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
        <div class="cue-layer" aria-hidden="true">
          <span
            v-for="cue in floatingCues"
            :key="cue.id"
            class="float-cue"
            :class="`float-cue--${cue.tone}`"
          >
            {{ cue.text }}
          </span>
        </div>
      </section>

      <!-- Operator & Undo/Redo Dock -->
      <section class="operator-dock panel-box">
        <div class="dock-groups">
          <!-- Binary Operators -->
          <div class="op-section">
            <div class="op-section-title">Binary Operators (+10 pts, 1st selected = left, 2nd = right)</div>
            <div class="op-buttons">
              <button
                v-for="op in binaryOperators"
                :key="op.id"
                type="button"
                class="btn-arcade btn-op"
                :class="{
                  'btn-op--active': activeWorkspace?.pendingOperator === op.id,
                }"
                :disabled="!activeWorkspace?.selectedGroupId"
                :data-testid="`op-${op.id}`"
                @click="handleApplyOperator(op.id)"
              >
                <span class="op-sym">{{ op.shortSymbol }}</span>
                <span class="op-lbl">{{ op.label }}</span>
              </button>
            </div>
          </div>

          <!-- Unary Operators -->
          <div v-if="unaryOperators.length > 0" class="op-section">
            <div class="op-section-title">
              Unary Operators (+10, +20, +30… stacked; ! &amp; Γ nested = +200)
            </div>
            <div class="op-buttons">
              <button
                v-for="op in unaryOperators"
                :key="op.id"
                type="button"
                class="btn-arcade btn-op btn-op--unary"
                :disabled="!activeWorkspace?.selectedGroupId"
                :data-testid="`op-${op.id}`"
                @click="handleApplyOperator(op.id)"
              >
                <span class="op-sym">{{ op.shortSymbol }}</span>
                <span class="op-lbl">{{ op.label }}</span>
              </button>
            </div>
          </div>

          <!-- Group & History Controls -->
          <div class="op-section op-section--history">
            <div class="op-section-title">Group &amp; History Actions (U / Z / Y)</div>
            <div class="op-buttons">
              <button
                type="button"
                class="btn-arcade btn-arcade--crimson"
                :disabled="!canUngroupSelected"
                data-testid="ungroup-btn"
                @click="handleUngroup()"
              >
                ✂ Ungroup (U)
              </button>
              <button
                type="button"
                class="btn-arcade"
                :disabled="!activeWorkspace || activeWorkspace.undoStack.length === 0"
                data-testid="undo-btn"
                @click="handleUndo"
              >
                ↶ Undo (Z)
              </button>
              <button
                type="button"
                class="btn-arcade"
                :disabled="!activeWorkspace || activeWorkspace.redoStack.length === 0"
                data-testid="redo-btn"
                @click="handleRedo"
              >
                ↷ Redo (Y)
              </button>
              <button
                type="button"
                class="btn-arcade"
                data-testid="reset-workspace-btn"
                @click="handleResetWorkspace"
              >
                ⟲ Reset Workspace
              </button>
            </div>
          </div>
        </div>
      </section>
        </div>
      </div>
    </main>

    <!-- ======================== ROUND END SCREEN ======================== -->
    <main v-else-if="phase === 'round-end'" class="screen-round-end" :inert="menuOpen">
      <div class="results-cabinet" :class="roundWinnerId ? 'results-cabinet--win' : 'results-cabinet--bust'">
        <div class="results-marquee">
          <span class="results-marquee__round">ROUND {{ roundNumber }}</span>
          <span class="results-marquee__target">
            TARGET <strong>{{ formatNumber(currentTarget) }}</strong>
          </span>
        </div>

        <div
          class="results-stamp"
          :class="roundWinnerId ? 'results-stamp--win' : 'results-stamp--bust'"
        >
          {{ roundWinnerId ? 'ROUND CLEAR' : 'NO POINT' }}
        </div>

        <h2 class="results-title">
          <template v-if="settings.isMultiplayer && settings.mode === 'first-to-solve'">
            Winning solution
          </template>
          <template v-else>
            {{ roundWinnerId ? 'Best expression this round' : 'Nobody closed the round' }}
          </template>
        </h2>

        <div v-if="sortedRoundSolutions.length > 0" class="solutions-table">
          <div
            v-for="(sol, idx) in settings.isMultiplayer && settings.mode === 'first-to-solve'
              ? sortedRoundSolutions.slice(0, 1)
              : sortedRoundSolutions"
            :key="sol.id"
            class="solution-row"
            :class="{ 'solution-row--winner': idx === 0 }"
          >
            <div class="sol-rank">
              {{ idx === 0 ? '★ WINNER' : `#${idx + 1}` }}
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
              <span class="standing-name">{{ p.name }}</span>
              <span class="standing-pts">{{ p.points }} / {{ settings.firstToPoints }} pts</span>
            </div>
          </div>
        </div>

        <div class="round-end-actions">
          <button
            type="button"
            class="btn-arcade btn-arcade--gold"
            data-testid="next-round-btn"
            @click="advanceAfterRoundEnd"
          >
            {{ matchWinner ? 'View Match Winner' : 'Deal Next Round' }}
          </button>
          <button type="button" class="btn-arcade" @click="goToLobby">
            Back to Lobby
          </button>
          <button
            type="button"
            class="btn-arcade btn-arcade--crimson"
            @click="endEntireGameNow"
          >
            End Game
          </button>
        </div>
      </div>
    </main>

    <!-- ======================== GAME OVER SCREEN ======================== -->
    <main v-else-if="phase === 'game-over'" class="screen-game-over" :inert="menuOpen">
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
        <p v-if="matchWinner" class="winner-callout">
          Series winner: <strong>{{ matchWinner.name }}</strong> ·
          <strong>{{ pointsLabel(matchWinner.points) }}</strong>
        </p>
        <p v-else class="winner-callout">Match ended early — no winner on the board.</p>

        <div class="standings-row standings-row--centered">
          <div
            v-for="p in players"
            :key="p.id"
            class="standing-card"
            :class="{ 'standing-card--top': matchWinner && p.id === matchWinner.id }"
          >
            <span class="standing-name">{{ p.name }}</span>
            <span class="standing-pts">{{ pointsLabel(p.points) }}</span>
          </div>
        </div>

        <div class="round-end-actions round-end-actions--centered">
          <button
            type="button"
            class="btn-arcade btn-arcade--gold"
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

/* Title screen: an arcade cabinet marquee */
.screen-title {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 28px 20px 42px;
}

.title-cabinet {
  position: relative;
  width: min(900px, 100%);
  background:
    radial-gradient(circle at 50% 0%, rgba(254, 74, 73, 0.16) 0%, transparent 55%),
    linear-gradient(180deg, #241a34 0%, #130f1e 58%, #0b0912 100%);
  border: 5px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 0 70px rgba(255, 190, 11, 0.1),
    0 14px 0 #09080f,
    0 0 0 9px rgba(254, 74, 73, 0.32);
  padding: 18px 22px 22px;
}

.marquee-bulbs {
  display: flex;
  justify-content: space-between;
  padding: 0 4px 12px;
}

.marquee-bulbs span {
  width: 9px;
  height: 9px;
  background: var(--gold);
  border: 2px solid #09080f;
  box-shadow: 0 0 9px var(--gold);
  animation: bulb-flash 1.5s steps(2, end) infinite;
}

.title-cabinet__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.hero-card-fan {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 6px 0 16px;
}

.fan-card {
  display: block;
  width: auto;
  height: 118px;
  margin: 0 -9px;
  filter: drop-shadow(0 5px 0 rgba(12, 9, 16, 0.85));
  animation: fan-bob 3.4s ease-in-out infinite;
}

.fan-card--1 {
  transform: rotate(-11deg) translateY(7px);
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
  transform: rotate(11deg) translateY(7px);
  animation-delay: 0.75s;
}

.hero-heading {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 16px;
  margin: 0 0 22px;
  line-height: 0.9;
}

.hero-heading__make {
  font-family: var(--font-display);
  font-size: 2.2rem;
  color: var(--ink-cream);
  letter-spacing: 0.04em;
  text-shadow:
    0 4px 0 var(--crimson-dark),
    0 8px 0 #09080f;
}

.hero-heading__num {
  font-family: var(--font-display);
  font-size: 4.6rem;
  color: var(--gold-bright);
  text-shadow:
    0 4px 0 #b06b00,
    0 9px 0 #09080f,
    0 0 30px rgba(255, 190, 11, 0.45);
  animation: title-pulse 2.6s ease-in-out infinite;
}

.mode-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  width: 100%;
  margin-top: 0;
  text-align: left;
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px 16px 14px;
  background: linear-gradient(180deg, #251e37 0%, #171226 100%);
  border: 3px solid #4a4166;
  outline: 3px solid #09080f;
  box-shadow: 0 7px 0 #09080f;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.14s ease,
    box-shadow 0.12s ease;
}

.mode-card:hover,
.mode-card:focus-visible {
  transform: translateY(-5px) rotate(-0.4deg);
  box-shadow: 0 12px 0 #09080f;
}

.mode-card:active {
  transform: translateY(3px);
  box-shadow: 0 3px 0 #09080f;
}

.mode-card--solo:hover,
.mode-card--solo:focus-visible {
  border-color: var(--emerald);
}

.mode-card--versus:hover,
.mode-card--versus:focus-visible {
  border-color: var(--crimson);
}

.mode-card__icon {
  font-size: 1.9rem;
  line-height: 1;
  color: var(--gold);
  text-shadow: 0 3px 0 #09080f;
}

.mode-card--solo .mode-card__icon {
  color: #72efdd;
}

.mode-card--versus .mode-card__icon {
  color: #ff8fa3;
}

.mode-card__title {
  font-family: var(--font-display);
  font-size: 0.95rem;
  color: var(--gold);
  letter-spacing: 0.06em;
}

.mode-card__copy {
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--ink-muted);
}

.mode-card__cta {
  margin-top: 6px;
  font-family: var(--font-pixel);
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  padding: 5px 9px;
  background: var(--gold);
  color: #15111e;
  border: 2px solid #fff9db;
}

.mode-card--versus .mode-card__cta {
  background: var(--crimson);
  color: #fff;
  border-color: #fff3e6;
}

.title-foot {
  margin-top: 20px;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.22em;
  color: var(--ink-muted);
}

.title-foot__blink {
  color: var(--emerald);
  animation: cursor-blink 1s steps(2, end) infinite;
}

.title-foot__sep {
  opacity: 0.45;
  margin: 0 8px;
}

.title-foot__key {
  border: 1px solid currentColor;
  color: var(--ink-cream);
  padding: 0 4px;
  margin-right: 4px;
}

@keyframes bulb-flash {
  50% {
    background: var(--crimson);
    box-shadow: 0 0 11px var(--crimson);
  }
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

@keyframes cursor-blink {
  50% {
    opacity: 0;
  }
}

@media (max-width: 760px) {
  .mode-cards {
    grid-template-columns: 1fr;
  }
  .hero-heading {
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .hero-heading__num {
    font-size: 3.6rem;
    margin-top: 8px;
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

.lobby-marquee__hint {
  font-family: var(--font-pixel);
  font-size: 0.66rem;
  color: var(--ink-muted);
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

.btn-kick {
  background: var(--crimson);
  color: #fff;
  border: none;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-weight: 900;
}

.add-player-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
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

.static-setting-note {
  background: #241f30;
  padding: 8px 12px;
  border: 1px dashed rgba(242, 201, 76, 0.45);
  font-size: 0.86rem;
  color: var(--ink-muted);
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

/* Playing Screen: Balatro-ish table with left HUD rail */
.screen-playing {
  flex: 1;
  padding: 14px 20px 26px;
  max-width: 1460px;
  width: 100%;
  margin: 0 auto;
}

.table-layout {
  display: grid;
  grid-template-columns: 262px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
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
  gap: 12px;
  min-width: 0;
}

@media (max-width: 1000px) {
  .table-layout {
    grid-template-columns: 1fr;
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

.ws-tab-meta {
  font-size: 0.66rem;
  opacity: 0.82;
  margin-left: auto;
}

.ws-tab-key {
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

.float-cue:nth-child(even) {
  left: 42%;
}

.float-cue:nth-child(3n) {
  left: 58%;
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

/* Felt Board */
.felt-table {
  position: relative;
  background: radial-gradient(circle at 50% 50%, #1f4737 0%, #122b21 85%);
  border: 4px solid #2d5a46;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.55),
    0 8px 0 #0b0910;
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.board-instructions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  background: rgba(14, 20, 24, 0.72);
  border: 1px solid rgba(242, 201, 76, 0.4);
  padding: 6px 12px;
  font-size: 0.84rem;
}

.board-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pan-coords {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--ink-muted);
}

.btn-arcade--tiny {
  padding: 4px 10px;
  font-size: 0.76rem;
}

.pending-banner {
  color: var(--gold);
}

.error-toast {
  background: var(--crimson);
  color: #fff;
  padding: 3px 10px;
  font-weight: 800;
  font-size: 0.82rem;
}

/* Fixed-size workspace viewport with infinite pan plane */
.workspace-viewport {
  position: relative;
  width: 100%;
  height: 404px;
  min-height: 404px;
  max-height: 404px;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  background-image: radial-gradient(rgba(242, 201, 76, 0.14) 1px, transparent 1px);
  background-size: 28px 28px;
  border: 2px dashed rgba(242, 201, 76, 0.25);
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

/* Operator Dock */
.operator-dock {
  padding: 11px 14px 13px;
}

.dock-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  align-items: flex-start;
  justify-content: space-between;
}

.op-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.op-section-title {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--ink-muted);
  letter-spacing: 0.04em;
}

.op-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-op {
  min-width: 68px;
  flex-direction: column;
  gap: 1px;
  padding: 5px 10px;
}

.btn-op--active {
  background: var(--crimson) !important;
  border-color: #fff !important;
  transform: translateY(-2px);
}

.btn-op--unary {
  border-color: #64dfdf;
}

.op-sym {
  font-family: var(--font-mono);
  font-size: 1.08rem;
  font-weight: 900;
  color: var(--gold);
}

.btn-op--unary .op-sym {
  color: #72efdd;
}

.op-lbl {
  font-size: 0.7rem;
  color: var(--ink-cream);
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
</style>
