import { computed, ref, watch, type Ref } from 'vue'
import { playSfx } from '../audio/sfx'
import { dealHand, generateTargetNumber } from '../engine/deck'
import { calculateScoreBreakdown } from '../engine/math'
import {
  WORKSPACE_COUNT,
  createAllWorkspaces,
  evaluateWorkspaceSolution,
} from '../engine/workspace'
import type {
  Card,
  GameSettings,
  PlayerInfo,
  ScreenPhase,
  SubmittedSolution,
  WorkspaceState,
} from '../engine/types'
import {
  isRoomHost,
  multiplayer,
  selfPlayer,
  sendToRoom,
  serverNow,
} from '../multiplayer/session'
import type { RoomState } from '../multiplayer/protocol'
import type { Juice } from './useJuice'

/** A round outcome, as reported by the buttons that can end one. */
export type RoundEndReason = 'first-to-solve' | 'timer' | 'skip' | 'player-end'

/**
 * Owns the dealt hand, its workspaces, the round clock mirror and the local
 * leaderboard. In multiplayer the server is authoritative: this module only
 * mirrors the room snapshot into the same view model.
 */
export function useMatch(deps: {
  settings: GameSettings
  phase: Ref<ScreenPhase>
  juice: Juice
}) {
  const { settings, phase, juice } = deps

  const localPlayers = ref<PlayerInfo[]>([createLocalSeat()])
  const localRoundNumber = ref(1)
  const localRoundSolutions = ref<SubmittedSolution[]>([])
  const localRoundWinnerId = ref<string | null>(null)
  const localMatchWinner = ref<PlayerInfo | null>(null)

  const currentTarget = ref(24)
  const currentHand = ref<Card[]>([])
  const workspaces = ref<WorkspaceState[]>([])
  const activeWorkspaceIdx = ref(0)
  const actionError = ref<string | null>(null)

  // Countdown mirrors the server's round deadline; the server ends the round.
  const remainingSeconds = ref<number | null>(null)
  let deadlineTimer: ReturnType<typeof setInterval> | null = null
  let roundStartTimestamp = 0
  let appliedRoundNumber = 0
  let appliedRoomCode: string | null = null
  /** Signature of the last board sent to the table, so repeats stay off the wire. */
  let lastReportedBoard: string | null = null
  let sawAcceptable = false

  const activeWorkspace = computed<WorkspaceState | undefined>(
    () => workspaces.value[activeWorkspaceIdx.value]
  )

  /** Seated while a round was already running: dealt in on the next one. */
  const awaitingNextDeal = computed(
    () => settings.isMultiplayer && selfPlayer.value?.isWaiting === true
  )

  const currentEvaluation = computed(() => {
    const ws = activeWorkspace.value
    if (!ws) return null
    return evaluateWorkspaceSolution(ws, currentTarget.value, settings.approximationPercent)
  })

  /** Where the current solution's cost comes from, once the cards are in one group. */
  const costBreakdown = computed(() => {
    const evaluation = currentEvaluation.value
    if (!evaluation?.isSingleGroup || !evaluation.rootNode) return null
    return calculateScoreBreakdown(evaluation.rootNode)
  })

  function sortedLocalSolutions(): SubmittedSolution[] {
    return [...localRoundSolutions.value].sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.timestampMs - b.timestampMs
    })
  }

  /* ------------------------------ round flow ------------------------------ */

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

  function enterSoloLobby(): void {
    localPlayers.value = [createLocalSeat()]
    phase.value = 'lobby'
  }

  function resetLocalMatch(): void {
    localRoundNumber.value = 1
    localMatchWinner.value = null
    for (const p of localPlayers.value) {
      p.points = 0
      p.bestRoundScore = null
    }
  }

  function finishRound(reason: RoundEndReason): void {
    if (settings.isMultiplayer) {
      // The server owns round transitions. Hosts can close the round early; the
      // host-side skip also awards the best submitted board if there is one.
      if (isRoomHost.value && multiplayer.room?.phase === 'playing') {
        sendToRoom({ t: 'skip-round' })
      }
      return
    }

    stopDeadlineClock()
    recordPlayerSolutionFromWorkspace()

    // Award a point when a board exists and the round was not skipped.
    const solutions = sortedLocalSolutions()
    if (reason !== 'skip' && solutions.length > 0) {
      const bestSol = solutions[0]!
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
      if (isRoomHost.value && multiplayer.room?.phase === 'round-end') {
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
      if (isRoomHost.value) sendToRoom({ t: 'end-match' })
      return
    }
    stopDeadlineClock()
    const standings = [...localPlayers.value].sort((a, b) => b.points - a.points)
    localMatchWinner.value = standings[0] && standings[0].points > 0 ? standings[0] : null
    phase.value = 'game-over'
  }

  /* --------------------- acceptable board → leaderboard --------------------- */

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

  watch(
    currentEvaluation,
    (evalRes) => {
      if (phase.value !== 'playing' || !evalRes || awaitingNextDeal.value) return
      const acceptableNow = evalRes.isSingleGroup && evalRes.acceptable
      if (acceptableNow && !sawAcceptable) {
        juice.hitSignal.value += 1
        playSfx('hit')
        juice.triggerImpact('hit')
        juice.pushCue('TARGET HIT', 'good')
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

  /* ------------------------- server → view model bridge ------------------------- */

  function stopDeadlineClock(): void {
    if (deadlineTimer) {
      clearInterval(deadlineTimer)
      deadlineTimer = null
    }
  }

  function refreshRemainingSeconds(): void {
    const deadline = multiplayer.room?.round?.deadline ?? null
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
    if (multiplayer.room?.round?.deadline != null) {
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

  /** Coming back to a table must re-apply the next deal, even for the same round. */
  function forgetAppliedRound(): void {
    appliedRoundNumber = 0
    appliedRoomCode = null
    stopDeadlineClock()
  }

  return {
    localPlayers,
    localRoundNumber,
    localRoundSolutions,
    localRoundWinnerId,
    localMatchWinner,
    currentTarget,
    currentHand,
    workspaces,
    activeWorkspaceIdx,
    actionError,
    remainingSeconds,
    activeWorkspace,
    awaitingNextDeal,
    currentEvaluation,
    costBreakdown,
    startNewRound,
    enterSoloLobby,
    resetLocalMatch,
    finishRound,
    advanceAfterRoundEnd,
    endEntireGameNow,
    recordPlayerSolutionFromWorkspace,
    startDeadlineClock,
    stopDeadlineClock,
    refreshRemainingSeconds,
    applyRoomSnapshot,
    forgetAppliedRound,
    workspaceCount: WORKSPACE_COUNT,
  }
}

export type Match = ReturnType<typeof useMatch>

function createLocalSeat(): PlayerInfo {
  return {
    id: 'p-local',
    name: 'You',
    isHost: true,
    isReady: true,
    points: 0,
    bestRoundScore: null,
  }
}
