import { beforeEach, describe, expect, it } from 'vitest'
import {
  readDungeonProgress,
  recordDungeonClear,
  recordDungeonReveal,
  saveDungeonProgress,
} from './dungeonProgress'

const STORAGE_KEY = 'make24-dungeon-progress-v1'

beforeEach(() => {
  window.localStorage.clear()
})

describe('dungeon progress storage', () => {
  it('starts empty and survives a save/read round-trip', () => {
    expect(readDungeonProgress()).toEqual({})

    const progress = recordDungeonClear({}, 'cellar', 'first-light', 120)
    saveDungeonProgress(progress)

    expect(readDungeonProgress()).toEqual({
      'cellar/first-light': { score: 120, clearedAt: expect.any(Number) },
    })
  })

  it('keeps the lowest score for a cleared trial', () => {
    const first = recordDungeonClear({}, 'cellar', 'first-light', 120)
    const better = recordDungeonClear(first, 'cellar', 'first-light', 90)
    const worse = recordDungeonClear(better, 'cellar', 'first-light', 140)

    expect(better['cellar/first-light']?.score).toBe(90)
    expect(worse).toBe(better)
    expect(worse['cellar/first-light']?.score).toBe(90)
  })

  it('records a revealed trial as cleared and survives a round-trip', () => {
    const progress = recordDungeonReveal({}, 'cellar', 'first-light')
    saveDungeonProgress(progress)

    expect(readDungeonProgress()).toEqual({
      'cellar/first-light': {
        score: 0,
        clearedAt: expect.any(Number),
        revealed: true,
      },
    })
  })

  it('keeps a real best when a cleared trial is revealed again', () => {
    const cleared = recordDungeonClear({}, 'cellar', 'first-light', 90)
    expect(recordDungeonReveal(cleared, 'cellar', 'first-light')).toBe(cleared)
  })

  it('lets a real solve replace a revealed trial, even with a higher score', () => {
    const revealed = recordDungeonReveal({}, 'cellar', 'first-light')
    const solved = recordDungeonClear(revealed, 'cellar', 'first-light', 120)

    expect(solved['cellar/first-light']).toEqual({
      score: 120,
      clearedAt: expect.any(Number),
    })
    expect(solved['cellar/first-light']?.revealed).toBeUndefined()
  })

  it('ignores corrupt records instead of losing the campaign', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"cellar/first-light":{"score":"nope"}}')
    expect(readDungeonProgress()).toEqual({})

    window.localStorage.setItem(STORAGE_KEY, 'not json')
    expect(readDungeonProgress()).toEqual({})
  })
})
