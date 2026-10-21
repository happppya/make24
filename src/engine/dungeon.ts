import { createDungeonPuzzle, type PuzzleDefinition } from './puzzles'
import {
  DUNGEON_GAUNTLETS,
  DUNGEON_GROUPS,
  type DungeonGauntlet,
  type DungeonGroup,
  type DungeonTrial,
} from './dungeonContent'

export {
  DUNGEON_GAUNTLETS,
  DUNGEON_GROUPS,
  DUNGEON_TRIAL_COUNT,
  type DungeonGauntlet,
  type DungeonGroup,
  type DungeonTrial,
} from './dungeonContent'

export function gauntletById(id: string): DungeonGauntlet | undefined {
  return DUNGEON_GAUNTLETS.find((gauntlet) => gauntlet.id === id)
}

export function gauntletIndex(id: string): number {
  return DUNGEON_GAUNTLETS.findIndex((gauntlet) => gauntlet.id === id)
}

/** The chapter a gauntlet belongs to. */
export function gauntletGroup(id: string): DungeonGroup | undefined {
  return DUNGEON_GROUPS.find((group) => group.gauntlets.some((gauntlet) => gauntlet.id === id))
}

/** The generated board for one trial, memoised by the puzzle engine. */
export function getDungeonPuzzle(gauntletId: string, trialId: string): PuzzleDefinition | null {
  const gauntlet = gauntletById(gauntletId)
  if (!gauntlet) return null
  const index = gauntlet.trials.findIndex((trial) => trial.id === trialId)
  const trial = gauntlet.trials[index]
  if (!trial) return null
  return createDungeonPuzzle({
    gauntletId: gauntlet.id,
    gauntletName: gauntlet.name,
    trialId: trial.id,
    trialNumber: index + 1,
    trialCount: gauntlet.trials.length,
    title: trial.title,
    difficulty: trial.difficulty,
    recipeId: trial.recipeId,
  })
}

/* --------------------------------- progress --------------------------------- */

export interface DungeonClear {
  score: number
  clearedAt: number
  /** Opened by revealing the reference solution instead of solving it. */
  revealed?: boolean
}

/** Cleared trials keyed by `gauntletId/trialId`. */
export type DungeonProgress = Record<string, DungeonClear>

export function dungeonTrialKey(gauntletId: string, trialId: string): string {
  return `${gauntletId}/${trialId}`
}

export function isTrialCleared(
  progress: DungeonProgress,
  gauntletId: string,
  trialId: string
): boolean {
  return Boolean(progress[dungeonTrialKey(gauntletId, trialId)])
}

export function trialBest(
  progress: DungeonProgress,
  gauntletId: string,
  trialId: string
): number | null {
  return progress[dungeonTrialKey(gauntletId, trialId)]?.score ?? null
}

/** True when the trial was cleared by giving up and revealing its solution. */
export function trialRevealed(
  progress: DungeonProgress,
  gauntletId: string,
  trialId: string
): boolean {
  return Boolean(progress[dungeonTrialKey(gauntletId, trialId)]?.revealed)
}

export function gauntletClearedCount(
  progress: DungeonProgress,
  gauntlet: DungeonGauntlet
): number {
  return gauntlet.trials.filter((trial) => isTrialCleared(progress, gauntlet.id, trial.id)).length
}

export function gauntletIsCleared(progress: DungeonProgress, gauntlet: DungeonGauntlet): boolean {
  return gauntletClearedCount(progress, gauntlet) === gauntlet.trials.length
}

/** A trial opens when the one before it is cleared. */
export function isTrialUnlocked(
  progress: DungeonProgress,
  gauntlet: DungeonGauntlet,
  trialIndex: number
): boolean {
  if (trialIndex <= 0) return true
  const previous = gauntlet.trials[trialIndex - 1]
  return previous ? isTrialCleared(progress, gauntlet.id, previous.id) : false
}

/**
 * A gauntlet opens when every trial in the one before it, in the same chapter,
 * is cleared. Each chapter's first gauntlet is always open, so Trials of Chaos
 * is available from the start.
 */
export function isGauntletUnlocked(progress: DungeonProgress, gauntletId: string): boolean {
  const group = gauntletGroup(gauntletId)
  if (!group) return false
  const index = group.gauntlets.findIndex((gauntlet) => gauntlet.id === gauntletId)
  if (index < 0) return false
  if (index === 0) return true
  const previous = group.gauntlets[index - 1]
  return previous ? gauntletIsCleared(progress, previous) : false
}

export function dungeonClearedCount(progress: DungeonProgress): number {
  let cleared = 0
  for (const gauntlet of DUNGEON_GAUNTLETS) {
    cleared += gauntletClearedCount(progress, gauntlet)
  }
  return cleared
}

export function nextTrialIn(gauntletId: string, trialId: string): DungeonTrial | null {
  const gauntlet = gauntletById(gauntletId)
  if (!gauntlet) return null
  const index = gauntlet.trials.findIndex((trial) => trial.id === trialId)
  if (index < 0) return null
  return gauntlet.trials[index + 1] ?? null
}

export function nextGauntletAfter(gauntletId: string): DungeonGauntlet | null {
  const index = gauntletIndex(gauntletId)
  if (index < 0) return null
  return DUNGEON_GAUNTLETS[index + 1] ?? null
}
