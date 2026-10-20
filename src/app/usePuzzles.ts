import { computed, reactive, ref, watch, type Ref } from 'vue'
import { playSfx } from '../audio/sfx'
import { countCardsInNode } from '../engine/workspace'
import {
  createPuzzle,
  puzzleLeaderboardKey,
  type PuzzleDefinition,
  type PuzzleKind,
  type PuzzleLeaderboardEntry,
} from '../engine/puzzles'
import type { GameSettings, ScreenPhase } from '../engine/types'
import { randomPlayerName } from '../multiplayer/playerNames'
import { cloneSettings } from './defaults'
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

export interface PuzzleResult {
  puzzle: PuzzleDefinition
  score: number
  equation: string
  rank: number | null
  improved: boolean
  source: 'online' | 'local'
  note: string | null
}

/**
 * Daily/weekly mode: a fixed puzzle, a local best, and the table server's shared
 * board when it is reachable. The composable also swaps the game's settings for
 * the puzzle rules and restores the player's previous table when they leave.
 */
export function usePuzzles(deps: {
  settings: GameSettings
  phase: Ref<ScreenPhase>
  match: Match
}) {
  const { settings, phase, match } = deps

  const dailyPuzzle = ref<PuzzleDefinition>(createPuzzle('daily'))
  const weeklyPuzzle = ref<PuzzleDefinition>(createPuzzle('weekly'))
  const activePuzzle = ref<PuzzleDefinition | null>(null)
  const lastResult = ref<PuzzleResult | null>(null)
  const puzzlePlayerName = ref(readPuzzlePlayerName() || randomPlayerName())
  const boards = reactive<Record<string, PuzzleLeaderboardEntry[]>>({})
  const boardStatus = reactive<Record<string, PuzzleBoardStatus>>({})
  const submitError = ref<string | null>(null)
  const submitting = ref(false)

  let settingsBeforePuzzle: GameSettings | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

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

  const activeBoardKey = computed(() =>
    activePuzzle.value ? puzzleLeaderboardKey(activePuzzle.value) : null
  )

  const activeEntries = computed(() =>
    activeBoardKey.value ? boards[activeBoardKey.value] ?? [] : []
  )

  const activeTopThree = computed(() => activeEntries.value.slice(0, 3))

  const activeStatus = computed<PuzzleBoardStatus>(() =>
    activeBoardKey.value ? boardStatus[activeBoardKey.value] ?? 'idle' : 'idle'
  )

  const missingCards = computed(() => {
    const puzzle = activePuzzle.value
    const root = match.currentEvaluation.value?.rootNode
    if (!puzzle || !root) return puzzle?.hand.length ?? 0
    return Math.max(0, puzzle.hand.length - countCardsInNode(root))
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

  function refreshPuzzles(): void {
    const now = new Date()
    const nextDaily = createPuzzle('daily', now)
    const nextWeekly = createPuzzle('weekly', now)
    if (nextDaily.key !== dailyPuzzle.value.key) dailyPuzzle.value = nextDaily
    if (nextWeekly.key !== weeklyPuzzle.value.key) weeklyPuzzle.value = nextWeekly
  }

  function openPuzzleHub(): void {
    refreshPuzzles()
    stopPolling()
    match.puzzleMode.value = false
    activePuzzle.value = null
    lastResult.value = null
    submitError.value = null
    phase.value = 'puzzles'
    void refreshPuzzleBoards()
  }

  function startPuzzle(kind: PuzzleKind): void {
    refreshPuzzles()
    const puzzle = kind === 'daily' ? dailyPuzzle.value : weeklyPuzzle.value
    if (!settingsBeforePuzzle) settingsBeforePuzzle = cloneSettings(settings)
    activePuzzle.value = puzzle
    lastResult.value = null
    submitError.value = null
    Object.assign(settings, cloneSettings(puzzle.settings))
    match.startPuzzleRound(puzzle)
    playSfx('select')
    void loadBoard(puzzle)
    startPolling()
  }

  async function refreshPuzzleBoards(): Promise<void> {
    await Promise.all([loadBoard(dailyPuzzle.value), loadBoard(weeklyPuzzle.value)])
  }

  async function loadBoard(puzzle: PuzzleDefinition): Promise<void> {
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
    }
    phase.value = 'puzzle-result'
  }

  function retryPuzzle(): void {
    if (activePuzzle.value) startPuzzle(activePuzzle.value.kind)
  }

  function exitPuzzleToHub(): void {
    stopPolling()
    match.puzzleMode.value = false
    restoreSettings()
    activePuzzle.value = null
    lastResult.value = null
    phase.value = 'puzzles'
    void refreshPuzzleBoards()
  }

  function leavePuzzleForTitle(): void {
    stopPolling()
    match.puzzleMode.value = false
    restoreSettings()
    activePuzzle.value = null
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

  function topThree(puzzle: PuzzleDefinition): PuzzleLeaderboardEntry[] {
    return (boards[puzzleLeaderboardKey(puzzle)] ?? []).slice(0, 3)
  }

  function yourBest(puzzle: PuzzleDefinition): number | null {
    return bestPuzzleScore(
      boards[puzzleLeaderboardKey(puzzle)] ?? [],
      puzzlePlayerName.value
    )
  }

  function boardFor(puzzle: PuzzleDefinition): PuzzleLeaderboardEntry[] {
    return boards[puzzleLeaderboardKey(puzzle)] ?? []
  }

  function boardState(puzzle: PuzzleDefinition): PuzzleBoardStatus {
    return boardStatus[puzzleLeaderboardKey(puzzle)] ?? 'idle'
  }

  function resetLabel(puzzle: PuzzleDefinition): string {
    const remaining = Math.max(0, puzzle.endsAt - Date.now())
    const hours = Math.floor(remaining / 3_600_000)
    const minutes = Math.max(1, Math.ceil((remaining % 3_600_000) / 60_000))
    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      return `${days}d ${hours % 24}h left`
    }
    return `${hours}h ${minutes}m left`
  }

  return {
    dailyPuzzle,
    weeklyPuzzle,
    activePuzzle,
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
    missingCards,
    canSubmit,
    openPuzzleHub,
    refreshPuzzleBoards,
    startPuzzle,
    finishPuzzle,
    retryPuzzle,
    exitPuzzleToHub,
    leavePuzzleForTitle,
    topThree,
    yourBest,
    boardFor,
    boardState,
    resetLabel,
    stopPolling,
  }
}

export type Puzzles = ReturnType<typeof usePuzzles>
