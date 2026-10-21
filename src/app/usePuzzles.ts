import { computed, reactive, ref, watch, type Ref } from 'vue'
import { playSfx } from '../audio/sfx'
import {
  DUNGEON_GAUNTLETS,
  dungeonClearedCount,
  gauntletById,
  gauntletClearedCount,
  gauntletIndex,
  gauntletIsCleared,
  getDungeonPuzzle,
  isGauntletUnlocked,
  isTrialCleared,
  isTrialUnlocked,
  nextTrialIn,
  trialBest,
  type DungeonGauntlet,
  type DungeonProgress,
} from '../engine/dungeon'
import { countCardsInNode } from '../engine/workspace'
import {
  createPuzzle,
  puzzleLeaderboardKey,
  type PeriodicPuzzleKind,
  type PuzzleDefinition,
  type PuzzleKind,
  type PuzzleLeaderboardEntry,
} from '../engine/puzzles'
import type { GameSettings, ScreenPhase } from '../engine/types'
import { randomPlayerName } from '../multiplayer/playerNames'
import { cloneSettings } from './defaults'
import { readDungeonProgress, recordDungeonClear, saveDungeonProgress } from './dungeonProgress'
import {
  bestPuzzleScore,
  fetchPuzzleBoard,
  localPuzzleBoard,
  postPuzzleAttempt,
  readLocalPuzzleBoards,
  readPuzzlePlayerName,
  recordLocalPuzzleAttempt,
  savePuzzlePlayerName,
} from './puzzleBoards'
import type { Match } from './useMatch'

export type PuzzleBoardStatus = 'idle' | 'loading' | 'online' | 'local'
export type PuzzleOrigin = 'periodic' | 'dungeon'

export interface PuzzleResult {
  puzzle: PuzzleDefinition
  score: number
  equation: string
  rank: number | null
  improved: boolean
  source: 'online' | 'local' | 'dungeon'
  note: string | null
  /** Set when the attempt was a dungeon trial. */
  dungeon: { gauntletId: string; trialId: string } | null
}

const PERIODIC_KINDS: PeriodicPuzzleKind[] = ['hourly', 'daily', 'daily-2', 'weekly']
const RESET_TICK_MS = 30_000

function isPeriodicKind(kind: PuzzleKind): kind is PeriodicPuzzleKind {
  return kind !== 'dungeon'
}

/**
 * Calendar puzzles (hourly, two dailies, weekly) plus the dungeon campaign: one
 * active board, shared rules swapping, local/shared boards, progress and the
 * navigation between the hub, the dungeon map, a gauntlet and a trial.
 */
export function usePuzzles(deps: {
  settings: GameSettings
  phase: Ref<ScreenPhase>
  match: Match
}) {
  const { settings, phase, match } = deps

  const hourlyPuzzle = ref<PuzzleDefinition>(createPuzzle('hourly'))
  const dailyPuzzle = ref<PuzzleDefinition>(createPuzzle('daily'))
  const secondDailyPuzzle = ref<PuzzleDefinition>(createPuzzle('daily-2'))
  const weeklyPuzzle = ref<PuzzleDefinition>(createPuzzle('weekly'))

  const activePuzzle = ref<PuzzleDefinition | null>(null)
  const activeOrigin = ref<PuzzleOrigin | null>(null)
  const lastResult = ref<PuzzleResult | null>(null)
  const puzzlePlayerName = ref(readPuzzlePlayerName() || randomPlayerName())
  const boards = reactive<Record<string, PuzzleLeaderboardEntry[]>>({})
  const boardStatus = reactive<Record<string, PuzzleBoardStatus>>({})
  const submitError = ref<string | null>(null)
  const submitting = ref(false)

  const dungeonProgress = ref<DungeonProgress>(readDungeonProgress())
  /** The gauntlet shown by the gauntlet screen, and remembered on the result. */
  const selectedGauntletId = ref<string | null>(null)
  const selectedGauntlet = computed(() => {
    const id = selectedGauntletId.value
    return id ? gauntletById(id) ?? null : null
  })
  const dungeonCleared = computed(() => dungeonClearedCount(dungeonProgress.value))
  const dungeonTotal = computed(() =>
    DUNGEON_GAUNTLETS.reduce((total, gauntlet) => total + gauntlet.trials.length, 0)
  )

  /** Ticks reset countdowns and rolls the hourly board over while browsing. */
  const clockNow = ref(Date.now())
  let settingsBeforePuzzle: GameSettings | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let clockTimer: ReturnType<typeof setInterval> | null = null

  // A previous offline session may have scores that never reached the server.
  const localBoards = readLocalPuzzleBoards()
  for (const [key, rows] of Object.entries(localBoards)) {
    boards[key] = rows
    boardStatus[key] = 'local'
  }

  watch(
    puzzlePlayerName,
    (name) => savePuzzlePlayerName(name),
    { immediate: true }
  )

  clockTimer = setInterval(() => {
    clockNow.value = Date.now()
    if (phase.value === 'puzzles') refreshPuzzles()
  }, RESET_TICK_MS)

  const activeBoardKey = computed(() => {
    const puzzle = activePuzzle.value
    return puzzle && isPeriodicKind(puzzle.kind) ? puzzleLeaderboardKey(puzzle) : null
  })

  const activeEntries = computed(() =>
    activeBoardKey.value ? boards[activeBoardKey.value] ?? [] : []
  )

  const activeTopThree = computed(() => activeEntries.value.slice(0, 3))

  const activeStatus = computed<PuzzleBoardStatus>(() =>
    activeBoardKey.value ? boardStatus[activeBoardKey.value] ?? 'idle' : 'idle'
  )

  const activeGauntlet = computed<DungeonGauntlet | null>(() => {
    const id = activePuzzle.value?.dungeon?.gauntletId
    return id ? gauntletById(id) ?? null : null
  })

  const missingCards = computed(() => {
    const puzzle = activePuzzle.value
    const workspace = match.activeWorkspace.value
    if (!puzzle || !workspace) return puzzle?.hand.length ?? 0
    const onBoard = workspace.groups.reduce(
      (total, group) => total + countCardsInNode(group),
      0
    )
    return Math.max(0, puzzle.hand.length - onBoard)
  })

  const canSubmit = computed(() => {
    const puzzle = activePuzzle.value
    const evaluation = match.currentEvaluation.value
    return Boolean(
      puzzle &&
        evaluation?.isSingleGroup &&
        evaluation.rootNode &&
        evaluation.acceptable &&
        evaluation.score !== null &&
        countCardsInNode(evaluation.rootNode) === puzzle.hand.length
    )
  })

  /* ------------------------------- calendar ------------------------------- */

  function periodicPuzzle(kind: PeriodicPuzzleKind): PuzzleDefinition {
    switch (kind) {
      case 'hourly':
        return hourlyPuzzle.value
      case 'daily':
        return dailyPuzzle.value
      case 'daily-2':
        return secondDailyPuzzle.value
      case 'weekly':
        return weeklyPuzzle.value
    }
  }

  function refreshPuzzles(): void {
    const now = new Date(clockNow.value)
    const nextHourly = createPuzzle('hourly', now)
    const nextDaily = createPuzzle('daily', now)
    const nextSecondDaily = createPuzzle('daily-2', now)
    const nextWeekly = createPuzzle('weekly', now)
    let changed = false
    if (nextHourly.key !== hourlyPuzzle.value.key) {
      hourlyPuzzle.value = nextHourly
      changed = true
    }
    if (nextDaily.key !== dailyPuzzle.value.key) {
      dailyPuzzle.value = nextDaily
      changed = true
    }
    if (nextSecondDaily.key !== secondDailyPuzzle.value.key) {
      secondDailyPuzzle.value = nextSecondDaily
      changed = true
    }
    if (nextWeekly.key !== weeklyPuzzle.value.key) {
      weeklyPuzzle.value = nextWeekly
      changed = true
    }
    // A board that rolled over in place (hour or midnight) has no entries yet;
    // fetch the new one instead of waiting for the next screen visit.
    if (changed && phase.value === 'puzzles') void refreshPuzzleBoards()
  }

  /* ------------------------------- navigation ------------------------------ */

  function openPuzzleHub(): void {
    refreshPuzzles()
    stopPolling()
    restoreSettings()
    match.puzzleMode.value = false
    activePuzzle.value = null
    activeOrigin.value = null
    lastResult.value = null
    submitError.value = null
    phase.value = 'puzzles'
    void refreshPuzzleBoards()
  }

  function openDungeon(): void {
    stopPolling()
    restoreSettings()
    match.puzzleMode.value = false
    activePuzzle.value = null
    activeOrigin.value = null
    lastResult.value = null
    submitError.value = null
    phase.value = 'dungeon'
    playSfx('select')
  }

  function openGauntlet(gauntletId: string): void {
    if (!gauntletById(gauntletId)) return
    stopPolling()
    restoreSettings()
    match.puzzleMode.value = false
    activePuzzle.value = null
    activeOrigin.value = null
    lastResult.value = null
    submitError.value = null
    selectedGauntletId.value = gauntletId
    phase.value = 'dungeon-gauntlet'
    playSfx('select')
  }

  function startPuzzle(kind: PeriodicPuzzleKind): void {
    refreshPuzzles()
    startPuzzleDefinition(periodicPuzzle(kind), 'periodic')
  }

  function startDungeonTrial(gauntletId: string, trialId: string): void {
    const gauntlet = gauntletById(gauntletId)
    if (!gauntlet) return
    const index = gauntlet.trials.findIndex((trial) => trial.id === trialId)
    if (index < 0) return
    if (!isTrialUnlocked(dungeonProgress.value, gauntlet, index)) {
      playSfx('error')
      return
    }
    const puzzle = getDungeonPuzzle(gauntletId, trialId)
    if (!puzzle) return
    startPuzzleDefinition(puzzle, 'dungeon')
  }

  function startPuzzleDefinition(puzzle: PuzzleDefinition, origin: PuzzleOrigin): void {
    if (!settingsBeforePuzzle) settingsBeforePuzzle = cloneSettings(settings)
    if (puzzle.dungeon) selectedGauntletId.value = puzzle.dungeon.gauntletId
    activePuzzle.value = puzzle
    activeOrigin.value = origin
    lastResult.value = null
    submitError.value = null
    Object.assign(settings, cloneSettings(puzzle.settings))
    match.startPuzzleRound(puzzle)
    playSfx('select')
    if (isPeriodicKind(puzzle.kind)) {
      void loadBoard(puzzle)
      startPolling()
    } else {
      stopPolling()
    }
  }

  async function refreshPuzzleBoards(): Promise<void> {
    await Promise.all(PERIODIC_KINDS.map((kind) => loadBoard(periodicPuzzle(kind))))
  }

  async function loadBoard(puzzle: PuzzleDefinition): Promise<void> {
    if (!isPeriodicKind(puzzle.kind)) return
    const key = puzzleLeaderboardKey(puzzle)
    boardStatus[key] = 'loading'
    try {
      const entries = await fetchPuzzleBoard(puzzle)
      boards[key] = entries
      boardStatus[key] = 'online'
    } catch {
      boards[key] = localPuzzleBoard(puzzle)
      boardStatus[key] = 'local'
    }
  }

  /* -------------------------------- finishing ------------------------------- */

  async function finishPuzzle(): Promise<void> {
    const puzzle = activePuzzle.value
    const evaluation = match.currentEvaluation.value
    if (!puzzle || !evaluation) return
    if (submitting.value) return

    if (!evaluation.isSingleGroup || !evaluation.rootNode || !evaluation.acceptable) {
      submitError.value = 'Finish one complete expression that hits the target first.'
      playSfx('error')
      return
    }
    if (countCardsInNode(evaluation.rootNode) !== puzzle.hand.length) {
      submitError.value = `Use all ${puzzle.hand.length} cards in the finished board.`
      playSfx('error')
      return
    }
    if (evaluation.score === null) {
      submitError.value = 'That board could not be scored.'
      return
    }

    submitError.value = null

    if (puzzle.kind === 'dungeon') {
      finishDungeonTrial(puzzle, evaluation.score, evaluation.equation)
      return
    }

    submitting.value = true
    const name = puzzlePlayerName.value.trim() || 'Anonymous'
    const key = puzzleLeaderboardKey(puzzle)
    const entry: PuzzleLeaderboardEntry = {
      playerName: name,
      score: evaluation.score,
      equation: evaluation.equation,
      lhs: evaluation.lhs,
      finalValue: evaluation.finalValue ?? 0,
      submittedAt: Date.now(),
    }
    boards[key] = recordLocalPuzzleAttempt(puzzle, entry)

    let source: 'online' | 'local' = 'local'
    let rank: number | null = null
    let improved = true
    let note: string | null = null
    try {
      const remote = await postPuzzleAttempt(puzzle, name, evaluation.rootNode)
      boards[key] = remote.entries
      boardStatus[key] = 'online'
      rank = remote.rank ?? null
      improved = remote.improved ?? true
      source = 'online'
      if ((remote.rank ?? 1) <= 3) playSfx('fanfare')
    } catch (error) {
      boards[key] = localPuzzleBoard(puzzle)
      boardStatus[key] = 'local'
      const rows = boards[key] ?? []
      const identity = name.toLocaleLowerCase()
      rank =
        rows.findIndex((row) => row.playerName.toLocaleLowerCase() === identity) + 1 || null
      note = `Saved on this device. The shared board is offline${
        error instanceof Error && error.message ? ` (${error.message})` : ''
      }.`
    } finally {
      submitting.value = false
    }

    lastResult.value = {
      puzzle,
      score: entry.score,
      equation: entry.equation,
      rank,
      improved,
      source,
      note,
      dungeon: null,
    }
    phase.value = 'puzzle-result'
  }

  function finishDungeonTrial(
    puzzle: PuzzleDefinition,
    score: number,
    equation: string
  ): void {
    const dungeon = puzzle.dungeon
    if (!dungeon) return
    dungeonProgress.value = recordDungeonClear(
      dungeonProgress.value,
      dungeon.gauntletId,
      dungeon.trialId,
      score
    )
    saveDungeonProgress(dungeonProgress.value)
    selectedGauntletId.value = dungeon.gauntletId
    lastResult.value = {
      puzzle,
      score,
      equation,
      rank: null,
      improved: true,
      source: 'dungeon',
      note: null,
      dungeon: { gauntletId: dungeon.gauntletId, trialId: dungeon.trialId },
    }
    phase.value = 'puzzle-result'
  }

  function retryPuzzle(): void {
    const puzzle = activePuzzle.value
    if (!puzzle) return
    if (puzzle.dungeon) {
      startDungeonTrial(puzzle.dungeon.gauntletId, puzzle.dungeon.trialId)
      return
    }
    if (isPeriodicKind(puzzle.kind)) startPuzzle(puzzle.kind)
  }

  /** The next trial in the current gauntlet, or null at the gatekeeper. */
  function nextDungeonTrial(): void {
    const dungeon = lastResult.value?.dungeon ?? activePuzzle.value?.dungeon
    if (!dungeon) return
    const next = nextTrialIn(dungeon.gauntletId, dungeon.trialId)
    if (next) startDungeonTrial(dungeon.gauntletId, next.id)
  }

  function exitPuzzleToHub(): void {
    const origin = activeOrigin.value
    const dungeon = activePuzzle.value?.dungeon ?? lastResult.value?.dungeon ?? null
    stopPolling()
    match.puzzleMode.value = false
    restoreSettings()
    activePuzzle.value = null
    activeOrigin.value = null
    lastResult.value = null
    if (origin === 'dungeon' && dungeon) {
      selectedGauntletId.value = dungeon.gauntletId
      phase.value = 'dungeon-gauntlet'
      return
    }
    phase.value = 'puzzles'
    void refreshPuzzleBoards()
  }

  function leavePuzzleForTitle(): void {
    stopPolling()
    match.puzzleMode.value = false
    restoreSettings()
    activePuzzle.value = null
    activeOrigin.value = null
    lastResult.value = null
    phase.value = 'title'
  }

  function restoreSettings(): void {
    if (!settingsBeforePuzzle) return
    Object.assign(settings, settingsBeforePuzzle)
    settingsBeforePuzzle = null
  }

  function startPolling(): void {
    stopPolling()
    pollTimer = setInterval(() => {
      if (activePuzzle.value && phase.value === 'playing') {
        void loadBoard(activePuzzle.value)
      }
    }, 30_000)
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function dispose(): void {
    stopPolling()
    if (clockTimer) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }

  /* -------------------------------- dungeon -------------------------------- */

  function trialCleared(gauntletId: string, trialId: string): boolean {
    return isTrialCleared(dungeonProgress.value, gauntletId, trialId)
  }

  function trialUnlocked(gauntlet: DungeonGauntlet, trialIndex: number): boolean {
    return isTrialUnlocked(dungeonProgress.value, gauntlet, trialIndex)
  }

  function gauntletProgress(gauntlet: DungeonGauntlet): number {
    return gauntletClearedCount(dungeonProgress.value, gauntlet)
  }

  function gauntletComplete(gauntlet: DungeonGauntlet): boolean {
    return gauntletIsCleared(dungeonProgress.value, gauntlet)
  }

  function gauntletUnlocked(gauntletId: string): boolean {
    return isGauntletUnlocked(dungeonProgress.value, gauntletId)
  }

  function gauntletBest(gauntletId: string, trialId: string): number | null {
    return trialBest(dungeonProgress.value, gauntletId, trialId)
  }

  function nextGauntletId(gauntletId: string): string | null {
    const index = gauntletIndex(gauntletId)
    return DUNGEON_GAUNTLETS[index + 1]?.id ?? null
  }

  /* --------------------------------- boards --------------------------------- */

  function topThree(puzzle: PuzzleDefinition): PuzzleLeaderboardEntry[] {
    if (!isPeriodicKind(puzzle.kind)) return []
    return (boards[puzzleLeaderboardKey(puzzle)] ?? []).slice(0, 3)
  }

  function yourBest(puzzle: PuzzleDefinition): number | null {
    if (!isPeriodicKind(puzzle.kind)) return null
    return bestPuzzleScore(
      boards[puzzleLeaderboardKey(puzzle)] ?? [],
      puzzlePlayerName.value
    )
  }

  function boardFor(puzzle: PuzzleDefinition): PuzzleLeaderboardEntry[] {
    if (!isPeriodicKind(puzzle.kind)) return []
    return boards[puzzleLeaderboardKey(puzzle)] ?? []
  }

  function boardState(puzzle: PuzzleDefinition): PuzzleBoardStatus {
    if (!isPeriodicKind(puzzle.kind)) return 'idle'
    return boardStatus[puzzleLeaderboardKey(puzzle)] ?? 'idle'
  }

  function resetLabel(puzzle: PuzzleDefinition): string {
    if (!isPeriodicKind(puzzle.kind)) return ''
    const remaining = Math.max(0, puzzle.endsAt - clockNow.value)
    if (remaining < 3_600_000) {
      return `${Math.max(1, Math.ceil(remaining / 60_000))}m left`
    }
    const hours = Math.floor(remaining / 3_600_000)
    const minutes = Math.max(1, Math.ceil((remaining % 3_600_000) / 60_000))
    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      return `${days}d ${hours % 24}h left`
    }
    return `${hours}h ${minutes}m left`
  }

  return {
    hourlyPuzzle,
    dailyPuzzle,
    secondDailyPuzzle,
    weeklyPuzzle,
    activePuzzle,
    activeOrigin,
    lastResult,
    puzzlePlayerName,
    boards,
    boardStatus,
    submitError,
    puzzleSubmitError: submitError,
    submitting,
    activeEntries,
    activeTopThree,
    activeStatus,
    activeGauntlet,
    missingCards,
    canSubmit,
    dungeonProgress,
    dungeonCleared,
    dungeonTotal,
    selectedGauntletId,
    selectedGauntlet,
    openPuzzleHub,
    openDungeon,
    openGauntlet,
    refreshPuzzleBoards,
    startPuzzle,
    startDungeonTrial,
    finishPuzzle,
    retryPuzzle,
    nextDungeonTrial,
    exitPuzzleToHub,
    leavePuzzleForTitle,
    trialCleared,
    trialUnlocked,
    gauntletProgress,
    gauntletComplete,
    gauntletUnlocked,
    gauntletBest,
    nextGauntletId,
    topThree,
    yourBest,
    boardFor,
    boardState,
    resetLabel,
    stopPolling,
    dispose,
  }
}

export type Puzzles = ReturnType<typeof usePuzzles>
