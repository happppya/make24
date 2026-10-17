<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import CardGroupNode from './components/CardGroupNode.vue'
import { dealHand, generateTargetNumber } from './engine/deck'
import {
  OPERATOR_CATALOG,
  checkTargetAcceptance,
  formatNumber,
  getEnabledOperators,
} from './engine/math'
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

const targetBandInfo = computed(() => {
  return checkTargetAcceptance(
    currentTarget.value,
    currentTarget.value,
    settings.approximationPercent
  )
})

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
    if (evalRes.isSingleGroup && evalRes.acceptable) {
      recordPlayerSolutionFromWorkspace()
      if (settings.isMultiplayer && settings.mode === 'first-to-solve') {
        finishRound('first-to-solve')
      }
    }
  },
  { deep: true }
)

function handleSelectGroup(groupId: string): void {
  if (suppressNextSelectClick) {
    suppressNextSelectClick = false
    return
  }
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  const res = selectGroupInWorkspace(ws, groupId)
  if (!res.changed && res.error) {
    actionError.value = res.error
  }
}

function handleUngroup(targetGroupId?: string): void {
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  const res = ungroupInWorkspace(ws, targetGroupId)
  if (!res.changed && res.error) {
    actionError.value = res.error
  }
}

function handleApplyOperator(opId: OperatorId): void {
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  const res = applyOperatorInWorkspace(ws, opId)
  if (!res.changed && res.error) {
    actionError.value = res.error
  }
}

function handleUndo(): void {
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  undoWorkspace(ws)
}

function handleRedo(): void {
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  redoWorkspace(ws)
}

function handleResetWorkspace(): void {
  const ws = activeWorkspace.value
  if (!ws) return
  actionError.value = null
  resetWorkspaceToHand(ws, currentHand.value)
}

function switchWorkspace(index: number): void {
  if (index >= 0 && index < WORKSPACE_COUNT) {
    activeWorkspaceIdx.value = index
    actionError.value = null
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
  if (phase.value !== 'playing') return
  const target = e.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA')
  ) {
    return
  }

  const key = e.key.toLowerCase()
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
    return
  }
  if (key === 'escape') {
    const ws = activeWorkspace.value
    if (ws) {
      ws.pendingOperator = null
      ws.selectedGroupId = null
    }
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
})
</script>

<template>
  <div class="app-shell">
    <!-- Top Arcade Header Bar -->
    <header class="top-bar">
      <div class="brand-lockup" @click="phase = 'title'">
        <img
          :src="spriteUrl('joker-red.png')"
          alt="Joker"
          class="brand-joker pixel-sprite"
        />
        <div>
          <div class="brand-title">MAKE 24 REMASTERED</div>
          <div class="brand-sub">ARCADE ARITHMETIC DECKBUILDER</div>
        </div>
      </div>

      <div v-if="phase !== 'title'" class="top-bar-actions">
        <span class="phase-pill">
          {{ settings.isMultiplayer ? 'MULTIPLAYER' : 'SINGLEPLAYER' }}
        </span>
        <button
          v-if="phase !== 'lobby'"
          type="button"
          class="btn-arcade"
          @click="phase = 'lobby'"
        >
          Lobby &amp; Settings
        </button>
      </div>
    </header>

    <!-- ======================== TITLE SCREEN ======================== -->
    <main v-if="phase === 'title'" class="screen-title">
      <div class="hero-showcase panel-box">
        <div class="hero-card-fan">
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

        <h1 class="hero-heading">MAKE 24 REMASTERED</h1>
        <p class="hero-lead">
          Stack dealt cards with binary &amp; unary operators to hit the target number.
          Every card must be used. Lower operator score wins.
        </p>

        <div class="mode-cards">
          <div class="mode-card">
            <h2>Singleplayer</h2>
            <p>
              Explore 5 parallel workspaces, refine your lowest-score equation at your own
              pace, and end each round whenever you’re satisfied.
            </p>
            <button
              type="button"
              class="btn-arcade btn-arcade--gold"
              data-testid="enter-singleplayer"
              @click="enterLobby(false)"
            >
              Enter Singleplayer Lobby
            </button>
          </div>

          <div class="mode-card">
            <h2>Multiplayer</h2>
            <p>
              Race to the first valid solution or compete for the lowest operator score
              under a round timer. First player to the target points wins the match.
            </p>
            <button
              type="button"
              class="btn-arcade btn-arcade--crimson"
              data-testid="enter-multiplayer"
              @click="enterLobby(true)"
            >
              Enter Multiplayer Lobby
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- ======================== LOBBY & SETTINGS SCREEN ======================== -->
    <main v-else-if="phase === 'lobby'" class="screen-lobby">
      <div class="lobby-grid">
        <!-- Left column: Players & Match Controls -->
        <section class="panel-box lobby-players">
          <div class="section-header">
            <h2>{{ settings.isMultiplayer ? 'Multiplayer Lobby' : 'Singleplayer Setup' }}</h2>
            <button
              type="button"
              class="btn-arcade"
              @click="enterLobby(!settings.isMultiplayer)"
            >
              Switch to {{ settings.isMultiplayer ? 'Singleplayer' : 'Multiplayer' }}
            </button>
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
    <main v-else-if="phase === 'playing'" class="screen-playing">
      <!-- Top HUD Strip -->
      <section class="hud-strip panel-box">
        <div class="hud-block hud-target">
          <div class="hud-label">ROUND {{ roundNumber }} TARGET</div>
          <div class="hud-target-number" data-testid="target-display">
            {{ formatNumber(currentTarget) }}
          </div>
          <div class="hud-approx-note">
            <template v-if="settings.approximationPercent > 0 && currentTarget !== 0">
              Accepts ±{{ settings.approximationPercent }}%:
              <strong>
                [{{ formatNumber(targetBandInfo.minAcceptable) }},
                {{ formatNumber(targetBandInfo.maxAcceptable) }}]
              </strong>
            </template>
            <template v-else>Exact match required (0% error)</template>
          </div>
        </div>

        <!-- Workspace Switcher (5 independent auto-saved workspaces) -->
        <div class="hud-block hud-workspaces">
          <div class="hud-label">WORKSPACES (AUTO-SAVED PER ROUND)</div>
          <div class="workspace-tabs">
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
            </button>
          </div>
        </div>

        <!-- Live Status / Solution Banner -->
        <div class="hud-block hud-status">
          <div class="hud-label">FINAL SOLUTION STATUS</div>
          <template v-if="currentEvaluation && currentEvaluation.isSingleGroup">
            <div
              class="solution-badge"
              :class="
                currentEvaluation.acceptable
                  ? 'solution-badge--valid'
                  : 'solution-badge--invalid'
              "
              data-testid="solution-status-badge"
            >
              <span>
                {{ currentEvaluation.acceptable ? 'ACCEPTABLE' : 'NOT ACCEPTABLE' }}
              </span>
              <span>Value: {{ formatNumber(currentEvaluation.finalValue!) }}</span>
              <span>Score: {{ currentEvaluation.score }} pts</span>
            </div>
            <div class="solution-eq-preview">{{ currentEvaluation.equation }}</div>
          </template>
          <template v-else>
            <div class="solution-incomplete" data-testid="solution-status-incomplete">
              Combine all {{ currentHand.length }} cards into 1 group ({{
                activeWorkspace?.groups.length ?? 0
              }}
              remaining)
            </div>
          </template>
        </div>

        <!-- Timer & Round / Match Host Controls -->
        <div class="hud-block hud-controls">
          <div v-if="settings.isMultiplayer && remainingSeconds !== null" class="timer-box">
            <span class="hud-label">TIME LEFT</span>
            <span class="timer-digits">{{ formatTimer(remainingSeconds) }}</span>
          </div>
          <div class="host-buttons">
            <button
              v-if="!settings.isMultiplayer || settings.mode !== 'first-to-solve'"
              type="button"
              class="btn-arcade btn-arcade--gold"
              data-testid="finish-round-btn"
              @click="finishRound('player-end')"
            >
              {{ settings.isMultiplayer ? 'End Round' : 'Finish & Submit' }}
            </button>
            <button
              type="button"
              class="btn-arcade"
              data-testid="skip-round-btn"
              @click="finishRound('skip')"
            >
              Skip Round
            </button>
            <button
              type="button"
              class="btn-arcade btn-arcade--crimson"
              @click="endEntireGameNow"
            >
              End Match
            </button>
          </div>
        </div>
      </section>

      <!-- Interactive Felt Board for Active Workspace -->
      <section class="felt-table">
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
    </main>

    <!-- ======================== ROUND END SCREEN ======================== -->
    <main v-else-if="phase === 'round-end'" class="screen-round-end">
      <div class="panel-box round-end-box">
        <div class="round-end-header">
          <div>
            <div class="hud-label">ROUND {{ roundNumber }} COMPLETE</div>
            <h2>
              <template v-if="settings.isMultiplayer && settings.mode === 'first-to-solve'">
                Winning Solution (First to Solve)
              </template>
              <template v-else>
                Round {{ roundNumber }} Acceptable Solutions
              </template>
            </h2>
          </div>
          <div class="round-target-pill">
            Target: <strong>{{ formatNumber(currentTarget) }}</strong>
          </div>
        </div>

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
          No acceptable solutions were completed this round. Nobody receives a point.
        </div>

        <!-- Standings -->
        <div class="standings-strip">
          <h3>Match Standings (First to {{ settings.firstToPoints }} pts)</h3>
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
          <button type="button" class="btn-arcade" @click="phase = 'lobby'">
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
    <main v-else-if="phase === 'game-over'" class="screen-game-over">
      <div class="panel-box game-over-box">
        <img
          :src="spriteUrl('joker-black.png')"
          alt="Joker"
          class="pixel-sprite gameover-joker"
        />
        <h2>MATCH COMPLETE</h2>
        <p v-if="matchWinner" class="winner-callout">
          <strong>{{ matchWinner.name }}</strong> wins the match with
          <strong>{{ matchWinner.points }}</strong> points!
        </p>
        <p v-else class="winner-callout">Match ended by host.</p>

        <div class="standings-row">
          <div v-for="p in players" :key="p.id" class="standing-card">
            <span class="standing-name">{{ p.name }}</span>
            <span class="standing-pts">{{ p.points }} pts</span>
          </div>
        </div>

        <div class="round-end-actions">
          <button
            type="button"
            class="btn-arcade btn-arcade--gold"
            @click="startMatchFromLobby"
          >
            Play Again
          </button>
          <button type="button" class="btn-arcade" @click="phase = 'lobby'">
            Return to Lobby
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #14111b;
  border-bottom: 3px solid var(--gold);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.5);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.brand-joker {
  width: 36px;
  height: 48px;
}

.brand-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--gold);
  letter-spacing: 0.06em;
}

.brand-sub {
  font-size: 0.72rem;
  color: var(--ink-muted);
  letter-spacing: 0.08em;
}

.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.phase-pill {
  background: #2b2338;
  border: 1px solid var(--gold);
  color: var(--gold);
  padding: 5px 10px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
}

/* Title screen */
.screen-title {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
}

.hero-showcase {
  max-width: 860px;
  width: 100%;
  text-align: center;
  padding: 32px 28px;
}

.hero-card-fan {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 18px;
}

.fan-card {
  width: 84px;
  height: 112px;
  background: #f6eedc;
  border: 3px solid #191521;
  padding: 3px;
  box-shadow: 0 6px 0 #0c0910;
  margin: 0 -10px;
}

.fan-card--1 {
  transform: rotate(-10deg) translateY(6px);
}
.fan-card--2 {
  transform: rotate(-3deg);
}
.fan-card--3 {
  transform: rotate(4deg);
}
.fan-card--4 {
  transform: rotate(11deg) translateY(6px);
}

.hero-heading {
  font-family: var(--font-display);
  font-size: 2.3rem;
  color: var(--gold);
  margin: 8px 0;
  text-shadow: 0 3px 0 #0b0910;
}

.hero-lead {
  max-width: 58ch;
  margin: 0 auto 28px;
  color: var(--ink-cream);
  line-height: 1.5;
}

.mode-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  text-align: left;
}

.mode-card {
  background: #221d2d;
  border: 2px solid rgba(242, 201, 76, 0.55);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.mode-card h2 {
  margin: 0;
  color: var(--gold);
  font-family: var(--font-display);
}

.mode-card p {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

/* Lobby Screen */
.screen-lobby {
  flex: 1;
  padding: 24px;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
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
  color: var(--gold);
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

/* Playing Screen */
.screen-playing {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 24px 24px;
  max-width: 1380px;
  width: 100%;
  margin: 0 auto;
}

.hud-strip {
  display: grid;
  grid-template-columns: 1.1fr 1.3fr 1.5fr auto;
  gap: 18px;
  align-items: center;
}

@media (max-width: 1080px) {
  .hud-strip {
    grid-template-columns: 1fr 1fr;
  }
}

.hud-label {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--ink-muted);
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}

.hud-target-number {
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 900;
  color: var(--gold);
  line-height: 1;
}

.hud-approx-note {
  font-size: 0.78rem;
  color: var(--ink-cream);
  margin-top: 4px;
}

.workspace-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ws-tab {
  background: #241f30;
  color: var(--ink-cream);
  border: 2px solid rgba(242, 201, 76, 0.45);
  padding: 6px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
}

.ws-tab--active {
  background: var(--gold);
  color: #191521;
  border-color: #fff;
  font-weight: 900;
}

.ws-tab-num {
  font-weight: 800;
  font-size: 0.85rem;
}

.ws-tab-meta {
  font-size: 0.68rem;
  opacity: 0.85;
}

.solution-badge {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  font-weight: 900;
  font-size: 0.84rem;
  border: 2px solid;
}

.solution-badge--valid {
  background: rgba(46, 196, 182, 0.2);
  border-color: #2ec4b6;
  color: #72efdd;
}

.solution-badge--invalid {
  background: rgba(230, 57, 70, 0.22);
  border-color: var(--crimson);
  color: #ff8fa3;
}

.solution-eq-preview {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--gold);
  margin-top: 4px;
}

.solution-incomplete {
  font-size: 0.88rem;
  color: var(--ink-muted);
}

.hud-controls {
  display: flex;
  align-items: center;
  gap: 14px;
}

.timer-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #120f18;
  border: 2px solid var(--crimson);
  padding: 6px 12px;
}

.timer-digits {
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 900;
  color: #ffccd5;
}

.host-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Felt Board */
.felt-table {
  background: radial-gradient(circle at 50% 50%, #1f4737 0%, #122b21 85%);
  border: 4px solid #2d5a46;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.55),
    0 8px 0 #0b0910;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.board-instructions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  background: rgba(14, 20, 24, 0.72);
  border: 1px solid rgba(242, 201, 76, 0.4);
  padding: 8px 14px;
  font-size: 0.88rem;
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
  height: 440px;
  min-height: 440px;
  max-height: 440px;
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
  padding: 14px 18px;
}

.dock-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
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
  min-width: 72px;
  flex-direction: column;
  gap: 2px;
  padding: 7px 12px;
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
  padding: 24px;
}

.round-end-box,
.game-over-box {
  max-width: 840px;
  width: 100%;
}

.round-end-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.round-end-header h2 {
  margin: 4px 0 0;
  color: var(--gold);
  font-family: var(--font-display);
}

.round-target-pill {
  background: #241f30;
  border: 2px solid var(--gold);
  padding: 8px 14px;
  font-size: 1.05rem;
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

.game-over-box {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gameover-joker {
  width: 72px;
  height: 96px;
}

.winner-callout {
  font-size: 1.2rem;
  margin: 8px 0 20px;
}
</style>
