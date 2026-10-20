import { computed, nextTick, onBeforeUnmount, provide, reactive, ref, watch } from 'vue'
import { playSfx } from '../audio/sfx'
import { decimalString } from '../engine/decimal'
import { MANUAL_TARGET_MAX, MANUAL_TARGET_MIN } from '../engine/deck'
import {
  OPERATOR_CATALOG,
  costOfBinaryOn,
  costOfUnaryOn,
  getEnabledOperators,
  hasEnabledOperators,
  isUnaryOperator,
} from '../engine/math'
import {
  applyOperatorInWorkspace,
  redoWorkspace,
  resetWorkspaceToHand,
  selectGroupInWorkspace,
  undoWorkspace,
  ungroupInWorkspace,
} from '../engine/workspace'
import { leaveRoom, multiplayer, sendToRoom } from '../multiplayer/session'
import type { GameSettings, OperatorId, ScreenPhase } from '../engine/types'
import { GAME_KEY } from './context'
import { createDefaultSettings } from './defaults'
import { useBoardGestures } from './useBoardGestures'
import { useHotkeys } from './useHotkeys'
import { useJuice } from './useJuice'
import { useMatch } from './useMatch'
import { usePuzzles } from './usePuzzles'
import { useRoom } from './useRoom'
import { useStandings } from './useStandings'

/**
 * Builds the whole table: state, the juice layer, the room bridge and the board
 * actions, and provides it so every screen can inject what it renders.
 */
export function useGame() {
  const phase = ref<ScreenPhase>('title')
  const settings = reactive<GameSettings>(createDefaultSettings())

  const viewportRef = ref<HTMLElement | null>(null)
  const juice = useJuice(viewportRef)
  const match = useMatch({ settings, phase, juice })
  const puzzles = usePuzzles({ settings, phase, match })
  const standings = useStandings({ settings, match })
  const room = useRoom({ settings, phase, match, standings })
  const gestures = useBoardGestures({
    activeWorkspace: match.activeWorkspace,
    viewportRef,
    actionError: match.actionError,
    juice,
  })

  /* ------------------------------ operators ------------------------------ */

  const enabledOperators = computed(() => getEnabledOperators(settings.allowedOperators))
  const unaryOperators = computed(() =>
    enabledOperators.value.filter((op) => op.arity === 'unary')
  )
  const binaryOperators = computed(() =>
    enabledOperators.value.filter((op) => op.arity === 'binary')
  )

  const pendingOperatorMeta = computed(() => {
    const ws = match.activeWorkspace.value
    if (!ws || !ws.pendingOperator) return null
    return OPERATOR_CATALOG.find((op) => op.id === ws.pendingOperator) ?? null
  })

  const selectedGroupNode = computed(() => {
    const ws = match.activeWorkspace.value
    if (!ws || !ws.selectedGroupId) return null
    return ws.groups.find((g) => g.id === ws.selectedGroupId) ?? null
  })

  const canUngroupSelected = computed(() => {
    const node = selectedGroupNode.value
    return node !== null && node.kind !== 'card' && node.kind !== 'bind'
  })

  /** Name plates shown only while the matching control is hovered. */
  const hoveredOperatorLabel = ref<string | null>(null)
  const hoveredActionLabel = ref<string | null>(null)

  /* ------------------------- exact target chooser ------------------------- */

  /** The lobby no longer stores a manual target; the host picks it per deal. */
  const targetPromptOpen = ref(false)
  const lastManualTarget = ref(String(settings.manualTarget))
  const pendingRoundAction = ref<'start' | 'next' | null>(null)
  const targetPromptRound = computed(() => {
    if (pendingRoundAction.value === 'start') return 1
    if (settings.isMultiplayer) return (multiplayer.room?.round?.number ?? 0) + 1
    return match.localRoundNumber.value + 1
  })

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
    if (targetPromptOpen.value) {
      cancelTargetPrompt()
      return
    }
    if (tutorialOpen.value) {
      void closeTutorial()
      return
    }
    if (menuOpen.value) {
      closeMenu()
      return
    }
    // First Esc cancels a waiting binary operator; otherwise it opens the menu.
    const ws = match.activeWorkspace.value
    if (phase.value === 'playing' && ws?.pendingOperator) {
      ws.pendingOperator = null
      playSfx('click')
      return
    }
    openMenu()
  }

  /* ------------------------------ navigation ------------------------------ */

  function goToTitle(): void {
    closeTargetPrompt()
    playSfx('click')
    if (puzzles.activePuzzle.value) {
      puzzles.leavePuzzleForTitle()
      return
    }
    // Walking away from the title screen must free the seat, or the room would
    // keep a ghost player around.
    if (settings.isMultiplayer) leaveRoom()
    match.stopDeadlineClock()
    phase.value = 'title'
  }

  function goToLobby(): void {
    closeTargetPrompt()
    playSfx('click')
    if (puzzles.activePuzzle.value) {
      puzzles.exitPuzzleToHub()
      return
    }
    // Leaving the table is deliberate: the room keeps running for everyone else
    // and the seat is handed back when this player rejoins.
    if (settings.isMultiplayer) {
      leaveRoom()
      room.goToTableBrowser()
      return
    }
    phase.value = 'lobby'
  }

  function goToPuzzles(): void {
    playSfx('click')
    puzzles.openPuzzleHub()
  }

  function enterLobby(isMultiplayer: boolean): void {
    closeTargetPrompt()
    settings.isMultiplayer = isMultiplayer
    if (isMultiplayer) {
      // Online play starts at the lobby list: pick a public table, take a code,
      // or open one of your own.
      room.goToTableBrowser()
      return
    }
    leaveRoom()
    match.enterSoloLobby()
  }

  /**
   * The game-over screen's Play Again: bring the table back to its lobby so the
   * rules can be changed before the next series. The server moves every seat.
   */
  function playAgainFromGameOver(): void {
    closeTargetPrompt()
    playSfx('click')
    if (settings.isMultiplayer) {
      if (room.multiplayerHost.value) sendToRoom({ t: 'return-to-lobby' })
      return
    }
    match.enterSoloLobby()
  }

  function startMatchFromLobby(): void {
    if (settings.isMultiplayer && !room.multiplayerHost.value) return
    if (settings.targetPreset === 'manual') {
      openTargetPrompt('start')
      return
    }
    beginMatch()
  }

  /** Deals the first round, optionally with the host's exact target. */
  function beginMatch(target?: number | string): void {
    // Ensure at least one operator is enabled, including when every operator in
    // an enabled group has been switched off individually.
    if (!hasEnabledOperators(settings.allowedOperators)) {
      settings.allowedOperators.operators.add = true
    }

    if (settings.isMultiplayer) {
      if (room.multiplayerHost.value && multiplayer.room?.phase !== 'playing') {
        sendToRoom({ t: 'start-match', target })
      }
      return
    }

    match.resetLocalMatch()
    match.startNewRound(target)
  }

  /** Round-end "deal next": a manual table asks for its target first. */
  function requestAdvanceRound(): void {
    if (settings.isMultiplayer) {
      if (!room.multiplayerHost.value || multiplayer.room?.phase !== 'round-end') return
    }
    const seriesOver = settings.isMultiplayer
      ? standings.matchWinnerIds.value.length > 0
      : match.localMatchWinner.value !== null
    if (!seriesOver && settings.targetPreset === 'manual') {
      openTargetPrompt('next')
      return
    }
    match.advanceAfterRoundEnd()
  }

  function openTargetPrompt(action: 'start' | 'next'): void {
    pendingRoundAction.value = action
    targetPromptOpen.value = true
    playSfx('select')
  }

  function closeTargetPrompt(): void {
    targetPromptOpen.value = false
    pendingRoundAction.value = null
  }

  function cancelTargetPrompt(): void {
    closeTargetPrompt()
    playSfx('click')
  }

  /** Called by the chooser once the host confirms a usable number. */
  function confirmTargetChoice(requested: number | string): void {
    const numeric = Number(requested)
    if (!Number.isFinite(numeric)) return
    const target = Math.min(MANUAL_TARGET_MAX, Math.max(MANUAL_TARGET_MIN, numeric))
    // Keep the typed digits when they are already in range; a target such as
    // 3.14159265358979323846 cannot survive a round-trip through a double.
    let exact = numeric === target ? String(requested) : String(target)
    try {
      exact = decimalString(exact)
    } catch {
      exact = String(target)
    }
    lastManualTarget.value = exact
    // Keep solo's setting in step, but do not nudge the host's settings watcher
    // online: it would push a now-locked rules update right after the deal.
    if (!settings.isMultiplayer) settings.manualTarget = target
    const action = pendingRoundAction.value
    closeTargetPrompt()
    if (action === 'start') beginMatch(exact)
    else if (action === 'next') match.advanceAfterRoundEnd(exact)
  }

  /* ------------------------------ board actions ------------------------------ */

  function handleSelectGroup(groupId: string): void {
    if (gestures.consumeSuppressedClick()) return
    if (match.awaitingNextDeal.value) return
    const ws = match.activeWorkspace.value
    if (!ws) return
    match.actionError.value = null
    const groupsBefore = ws.groups.length
    const res = selectGroupInWorkspace(ws, groupId)
    if (res.changed) {
      if (ws.groups.length < groupsBefore) {
        // Two groups were fused: thunk, spark at the fused stack, and keep the
        // taller stack on screen.
        playSfx('merge')
        const mergedId = ws.selectedGroupId
        void nextTick(() => juice.spawnParticles('merge', mergedId))
        void juice.glideToGroups(ws, ws.groups.map((group) => group.id))
      } else {
        playSfx('select')
      }
    } else {
      if (res.error) match.actionError.value = res.error
      playSfx('error')
      juice.triggerImpact('error', ws.selectedGroupId)
      juice.pushCue('NOPE', 'bad')
    }
  }

  function handleUngroup(targetGroupId?: string): void {
    if (match.awaitingNextDeal.value) return
    const ws = match.activeWorkspace.value
    if (!ws) return
    match.actionError.value = null
    const res = ungroupInWorkspace(ws, targetGroupId)
    if (res.changed) {
      playSfx('ungroup')
      juice.triggerImpact('split', ws.selectedGroupId)
      juice.pushCue('SPLIT', 'neutral')
      // Reframe the felt so every fanned-out piece stays reachable.
      void juice.glideToGroups(ws, ws.groups.map((group) => group.id))
    } else {
      if (res.error) match.actionError.value = res.error
      playSfx('error')
      juice.triggerImpact('error', ws.selectedGroupId)
      juice.pushCue('NOPE', 'bad')
    }
  }

  function handleApplyOperator(opId: OperatorId): void {
    if (match.awaitingNextDeal.value) return
    const ws = match.activeWorkspace.value
    if (!ws) return
    match.actionError.value = null
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
      void nextTick(() => {
        juice.bobGroup(bobTarget)
        juice.spawnParticles('operator', bobTarget)
      })
      juice.pushCue(`${meta?.shortSymbol ?? '?'} ${costLabel}`, 'neutral')
    } else {
      if (res.error) match.actionError.value = res.error
      playSfx('error')
      juice.triggerImpact('error', ws.selectedGroupId)
      juice.pushCue('NOPE', 'bad')
    }
  }

  /**
   * What this press costs. A binary operator is a flat 10 unless the selected
   * left operand makes a forbidden move; a unary one ramps with the chain it
   * lands on and includes any forbidden factorial/inverse-gamma pairing.
   */
  function operatorCostLabel(opId: OperatorId): string {
    const forbidden = {
      moves: settings.forbiddenMoves,
      penalty: settings.forbiddenMovePenalty,
    }
    const ws = match.activeWorkspace.value
    const node = ws?.groups.find((group) => group.id === ws.selectedGroupId)
    if (!isUnaryOperator(opId)) {
      return `+${node ? costOfBinaryOn(opId, node, forbidden) : 10}`
    }
    if (!node) return '+10'
    return `+${costOfUnaryOn(opId, node, forbidden)}`
  }

  function handleUndo(): void {
    if (match.awaitingNextDeal.value) return
    const ws = match.activeWorkspace.value
    if (!ws) return
    match.actionError.value = null
    undoWorkspace(ws)
    playSfx('click')
  }

  function handleRedo(): void {
    if (match.awaitingNextDeal.value) return
    const ws = match.activeWorkspace.value
    if (!ws) return
    match.actionError.value = null
    redoWorkspace(ws)
    playSfx('click')
  }

  function handleResetWorkspace(): void {
    if (match.awaitingNextDeal.value) return
    const ws = match.activeWorkspace.value
    if (!ws) return
    match.actionError.value = null
    resetWorkspaceToHand(ws, match.currentHand.value, settings.binds)
    playSfx('ungroup')
    juice.triggerImpact('split', ws.selectedGroupId)
    juice.pushCue('RESET', 'neutral')
  }

  function switchWorkspace(index: number): void {
    if (index >= 0 && index < match.workspaceCount) {
      match.activeWorkspaceIdx.value = index
      match.actionError.value = null
      playSfx('click')
    }
  }

  /* ------------------------------- keyboard ------------------------------- */

  useHotkeys({
    phase,
    menuOpen,
    tutorialOpen,
    activeWorkspace: match.activeWorkspace,
    unaryOperators,
    binaryOperators,
    handleEscape,
    handleUndo,
    handleRedo,
    handleUngroup,
    handleApplyOperator,
    switchWorkspace,
  })

  // Sound design per screen transition
  watch(phase, (next) => {
    menuOpen.value = false
    if (next === 'round-end' || next === 'game-over') {
      playSfx('fanfare')
    }
  })

  // Teardown stays private to this module: screens never clean the game up.
  const { dispose: disposeJuice, ...juiceApi } = juice
  const { dispose: disposeRoom, ...roomApi } = room

  onBeforeUnmount(() => {
    match.stopDeadlineClock()
    puzzles.stopPolling()
    leaveRoom()
    disposeJuice()
    disposeRoom()
  })

  const game = {
    phase,
    settings,
    ...juiceApi,
    ...match,
    ...puzzles,
    ...standings,
    ...roomApi,
    ...gestures,
    enabledOperators,
    unaryOperators,
    binaryOperators,
    pendingOperatorMeta,
    selectedGroupNode,
    canUngroupSelected,
    hoveredOperatorLabel,
    hoveredActionLabel,
    tutorialOpen,
    tutorialTriggerRef,
    openTutorial,
    closeTutorial,
    menuOpen,
    openMenu,
    closeMenu,
    menuGoToLobby,
    menuGoToTitle,
    handleEscape,
    goToTitle,
    goToLobby,
    goToPuzzles,
    enterLobby,
    playAgainFromGameOver,
    startMatchFromLobby,
    requestAdvanceRound,
    targetPromptOpen,
    targetPromptRound,
    targetPromptInitial: lastManualTarget,
    confirmTargetChoice,
    cancelTargetPrompt,
    handleSelectGroup,
    handleUngroup,
    handleApplyOperator,
    operatorCostLabel,
    handleUndo,
    handleRedo,
    handleResetWorkspace,
    switchWorkspace,
  }

  provide(GAME_KEY, game)
  return game
}

export type GameContext = ReturnType<typeof useGame>
