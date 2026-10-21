import {
  dungeonTrialKey,
  type DungeonClear,
  type DungeonProgress,
} from '../engine/dungeon'

const STORAGE_KEY = 'make24-dungeon-progress-v1'

/**
 * Dungeon progress lives on the device: the campaign is a solo run, so there is
 * no shared board to reconcile. A missing or corrupt record simply starts over.
 */
export function readDungeonProgress(): DungeonProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const progress: DungeonProgress = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const row = value as Partial<DungeonClear>
      if (typeof row.score !== 'number' || !Number.isFinite(row.score)) continue
      progress[key] = {
        score: row.score,
        clearedAt: typeof row.clearedAt === 'number' ? row.clearedAt : 0,
      }
    }
    return progress
  } catch {
    return {}
  }
}

export function saveDungeonProgress(progress: DungeonProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Private windows and full storage still allow a campaign for this session.
  }
}

/**
 * Marks a trial cleared and keeps the lowest score. Returns a fresh object so
 * Vue's reactive helpers see the change.
 */
export function recordDungeonClear(
  progress: DungeonProgress,
  gauntletId: string,
  trialId: string,
  score: number
): DungeonProgress {
  const key = dungeonTrialKey(gauntletId, trialId)
  const existing = progress[key]
  if (existing && existing.score <= score) return progress
  return {
    ...progress,
    [key]: { score, clearedAt: Date.now() },
  }
}
