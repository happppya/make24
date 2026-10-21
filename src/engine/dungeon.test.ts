import { describe, expect, it } from 'vitest'
import {
  DUNGEON_GAUNTLETS,
  DUNGEON_TRIAL_COUNT,
  dungeonClearedCount,
  gauntletById,
  gauntletClearedCount,
  gauntletIsCleared,
  getDungeonPuzzle,
  isGauntletUnlocked,
  isTrialUnlocked,
  nextGauntletAfter,
  nextTrialIn,
  trialBest,
  type DungeonProgress,
} from './dungeon'
import {
  createDungeonPuzzle,
  difficultyRank,
  puzzleRecipe,
  validatePuzzleAttempt,
} from './puzzles'
import type { ExprNode } from './types'

describe('dungeon content', () => {
  it('lays out seven themed gauntlets of six trials each', () => {
    expect(DUNGEON_GAUNTLETS).toHaveLength(7)
    expect(DUNGEON_TRIAL_COUNT).toBe(42)

    const gauntletIds = new Set<string>()
    for (const gauntlet of DUNGEON_GAUNTLETS) {
      expect(gauntletIds.has(gauntlet.id)).toBe(false)
      gauntletIds.add(gauntlet.id)
      expect(gauntlet.name.length).toBeGreaterThan(3)
      expect(gauntlet.theme.length).toBeGreaterThan(10)
      expect(gauntlet.intro.length).toBeGreaterThan(30)
      expect(gauntlet.sigil.length).toBeGreaterThan(0)
      expect(gauntlet.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(gauntlet.trials).toHaveLength(6)
      expect(new Set(gauntlet.trials.map((trial) => trial.id)).size).toBe(6)

      for (const trial of gauntlet.trials) {
        expect(trial.title.length).toBeGreaterThan(2)
        expect(trial.blurb.length).toBeGreaterThan(20)
        expect(puzzleRecipe(trial.recipeId)).toBeDefined()
        expect(puzzleRecipe(trial.recipeId)!.difficulty).toBe(trial.difficulty)
      }
    }
  })

  it('ramps every gauntlet upward and the campaign from easy to impossible', () => {
    for (const gauntlet of DUNGEON_GAUNTLETS) {
      const ranks = gauntlet.trials.map((trial) => difficultyRank(trial.difficulty))
      for (let index = 1; index < ranks.length; index += 1) {
        expect(
          ranks[index],
          `${gauntlet.id} trial ${index + 1} should not be easier than the one before`
        ).toBeGreaterThanOrEqual(ranks[index - 1]!)
      }
    }

    expect(DUNGEON_GAUNTLETS[0]!.trials[0]!.difficulty).toBe('easy')
    expect(DUNGEON_GAUNTLETS[0]!.trials.at(-1)!.difficulty).toBe('hard')
    expect(DUNGEON_GAUNTLETS.at(-1)!.trials.at(-1)!.difficulty).toBe('impossible')
    expect(
      difficultyRank(DUNGEON_GAUNTLETS.at(-1)!.trials[0]!.difficulty)
    ).toBeGreaterThan(difficultyRank(DUNGEON_GAUNTLETS[0]!.trials[0]!.difficulty))
  })

  it('generates every trial deterministically with a playable reference board', () => {
    for (const gauntlet of DUNGEON_GAUNTLETS) {
      for (const trial of gauntlet.trials) {
        const puzzle = getDungeonPuzzle(gauntlet.id, trial.id)
        expect(puzzle, `${gauntlet.id}/${trial.id}`).not.toBeNull()
        if (!puzzle) continue

        expect(puzzle.kind).toBe('dungeon')
        expect(puzzle.key).toBe(`${gauntlet.id}/${trial.id}`)
        expect(puzzle.name).toBe(trial.title)
        expect(puzzle.difficulty).toBe(trial.difficulty)
        expect(puzzle.recipeId).toBe(trial.recipeId)
        expect(puzzle.dungeon).toMatchObject({
          gauntletId: gauntlet.id,
          gauntletName: gauntlet.name,
          trialId: trial.id,
        })
        expect(puzzle.hand).toHaveLength(puzzle.settings.numCards)

        // The same trial always opens the same door.
        const again = getDungeonPuzzle(gauntlet.id, trial.id)
        expect(again?.target).toBe(puzzle.target)
        expect(again?.hand.map((card) => card.id)).toEqual(puzzle.hand.map((card) => card.id))

        const attempt = validatePuzzleAttempt(
          puzzle,
          JSON.parse(JSON.stringify(puzzle.referenceSolution))
        )
        expect(
          attempt.ok,
          `${gauntlet.id}/${trial.id}: ${attempt.ok ? '' : attempt.error}`
        ).toBe(true)
        if (!attempt.ok) continue
        expect(puzzle.target).toBeGreaterThan(0)
        expect(attempt.finalValue).toBe(puzzle.target)
        expect(sortedCardIds(puzzle.referenceSolution)).toEqual(
          puzzle.hand.map((card) => card.id).sort()
        )
        expect(puzzle.settings.allowedOperators.basic).toBe(true)
      }
    }
  })

  it('returns null for unknown gauntlets, trials and recipes', () => {
    expect(getDungeonPuzzle('nowhere', 'first-light')).toBeNull()
    expect(getDungeonPuzzle('cellar', 'nowhere')).toBeNull()
    expect(
      createDungeonPuzzle({
        gauntletId: 'cellar',
        gauntletName: 'The Cellar',
        trialId: 'missing-recipe',
        trialNumber: 1,
        trialCount: 6,
        title: 'Broken Trial',
        difficulty: 'easy',
        recipeId: 'no-such-recipe',
      })
    ).toBeNull()
  })
})

describe('dungeon progression', () => {
  const cellar = DUNGEON_GAUNTLETS[0]!
  const foundry = DUNGEON_GAUNTLETS[1]!

  function clear(progress: DungeonProgress, gauntletId: string, score = 100): DungeonProgress {
    const gauntlet = gauntletById(gauntletId)!
    const next = { ...progress }
    for (const trial of gauntlet.trials) {
      next[`${gauntlet.id}/${trial.id}`] = { score, clearedAt: 1 }
    }
    return next
  }

  it('opens the first trial only until it is cleared', () => {
    const empty: DungeonProgress = {}
    expect(isTrialUnlocked(empty, cellar, 0)).toBe(true)
    expect(isTrialUnlocked(empty, cellar, 1)).toBe(false)
    expect(isGauntletUnlocked(empty, cellar.id)).toBe(true)
    expect(isGauntletUnlocked(empty, foundry.id)).toBe(false)

    const firstCleared: DungeonProgress = {
      [`${cellar.id}/${cellar.trials[0]!.id}`]: { score: 90, clearedAt: 1 },
    }
    expect(isTrialUnlocked(firstCleared, cellar, 1)).toBe(true)
    expect(isTrialUnlocked(firstCleared, cellar, 2)).toBe(false)
    expect(gauntletClearedCount(firstCleared, cellar)).toBe(1)
    expect(gauntletIsCleared(firstCleared, cellar)).toBe(false)
  })

  it('unlocks the next gauntlet only after every trial is cleared', () => {
    const cellarCleared = clear({}, cellar.id)
    expect(gauntletIsCleared(cellarCleared, cellar)).toBe(true)
    expect(isGauntletUnlocked(cellarCleared, foundry.id)).toBe(true)
    expect(dungeonClearedCount(cellarCleared)).toBe(6)
    expect(trialBest(cellarCleared, cellar.id, cellar.trials[0]!.id)).toBe(100)
    expect(nextTrialIn(cellar.id, cellar.trials[0]!.id)?.id).toBe(cellar.trials[1]!.id)
    expect(nextTrialIn(cellar.id, cellar.trials.at(-1)!.id)).toBeNull()
    expect(nextGauntletAfter(cellar.id)?.id).toBe(foundry.id)
    expect(nextGauntletAfter(DUNGEON_GAUNTLETS.at(-1)!.id)).toBeNull()
  })
})

function sortedCardIds(node: ExprNode): string[] {
  if (node.kind === 'card') return [node.card.id]
  if (node.kind === 'bind') return node.cards.map((leaf) => leaf.card.id)
  if (node.kind === 'unary') return sortedCardIds(node.operand)
  return [...sortedCardIds(node.left), ...sortedCardIds(node.right)].sort()
}
