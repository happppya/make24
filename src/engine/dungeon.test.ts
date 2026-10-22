import { describe, expect, it } from 'vitest'
import {
  DUNGEON_GAUNTLETS,
  DUNGEON_GROUPS,
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
  trialRevealed,
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
  it('lays out two chapters of seven themed gauntlets, six trials each', () => {
    expect(DUNGEON_GROUPS).toHaveLength(2)
    expect(DUNGEON_GAUNTLETS).toHaveLength(14)
    expect(DUNGEON_TRIAL_COUNT).toBe(84)
    expect(DUNGEON_GROUPS[0]!.name).toBe('Into the Abyss')
    expect(DUNGEON_GROUPS[1]!.name).toBe('Trials of Chaos')
    for (const group of DUNGEON_GROUPS) {
      expect(group.chapter).toMatch(/^CHAPTER /)
      expect(group.gauntlets).toHaveLength(7)
      expect(group.theme.length).toBeGreaterThan(10)
    }

    const gauntletIds = new Set<string>()
    const trialIds = new Set<string>()
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
        expect(trialIds.has(trial.id)).toBe(false)
        trialIds.add(trial.id)
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

    // Trials of Chaos is the harder chapter: it opens at medium or above.
    for (const gauntlet of DUNGEON_GROUPS[1]!.gauntlets) {
      expect(difficultyRank(gauntlet.trials[0]!.difficulty)).toBeGreaterThanOrEqual(1)
      expect(difficultyRank(gauntlet.trials.at(-1)!.difficulty)).toBeGreaterThanOrEqual(2)
    }
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
        const recipe = puzzleRecipe(trial.recipeId)!
        if (recipe.allowNegative) {
          expect(puzzle.target, `${gauntlet.id}/${trial.id} should target a negative`).toBeLessThan(0)
        } else {
          expect(puzzle.target).toBeGreaterThan(0)
        }
        if (recipe.allowFractional) {
          expect(Number.isInteger(puzzle.target)).toBe(false)
          expect(puzzle.targetExact).toBeDefined()
          expect(Number(puzzle.targetExact)).toBeCloseTo(puzzle.target, 6)
          expect(attempt.finalValue).toBeCloseTo(puzzle.target, 6)
        } else {
          expect(puzzle.targetExact).toBeUndefined()
          expect(attempt.finalValue).toBe(puzzle.target)
        }
        expect(sortedCardIds(puzzle.referenceSolution)).toEqual(
          puzzle.hand.map((card) => card.id).sort()
        )
        expect(puzzle.settings.allowedOperators.basic).toBe(true)
      }
    }
  })

  it('gives every Trials of Chaos gauntlet the theme it advertises', () => {
    const gauntlet = (id: string) => DUNGEON_GAUNTLETS.find((entry) => entry.id === id)!
    const puzzleFor = (gauntletId: string) =>
      gauntlet(gauntletId).trials.map((trial) => getDungeonPuzzle(gauntletId, trial.id)!)

    for (const puzzle of puzzleFor('decimal-sea')) {
      expect(Number.isInteger(puzzle.target)).toBe(false)
      expect(puzzle.targetExact).toBeDefined()
    }
    for (const puzzle of puzzleFor('scrapheap')) {
      expect(puzzle.settings.numCards).toBeGreaterThanOrEqual(8)
      expect(puzzle.settings.allowedOperators.operators.mult).toBe(false)
      expect(puzzle.settings.allowedOperators.operators.add).toBe(false)
    }
    for (const trial of gauntlet('billion-vault').trials) {
      const puzzle = getDungeonPuzzle('billion-vault', trial.id)!
      expect(puzzle.target, trial.id).toBeGreaterThanOrEqual(10_000_000)
    }
    for (const puzzle of puzzleFor('undertow')) {
      expect(puzzle.target).toBeLessThan(0)
    }
    for (const puzzle of puzzleFor('last-light')) {
      expect(puzzle.settings.numCards).toBeGreaterThanOrEqual(8)
    }
  })

  it('gives every Chaos door its own recipe and lets the last doors grow to twenty cards', () => {
    const chaos = DUNGEON_GROUPS[1]!
    const trials = chaos.gauntlets.flatMap((gauntlet) =>
      gauntlet.trials.map((trial) => ({ gauntlet, trial }))
    )

    // A gauntlet is a run of different ideas, not the same puzzle re-labelled.
    expect(new Set(trials.map(({ trial }) => trial.recipeId)).size).toBe(trials.length)

    for (const { gauntlet, trial } of trials) {
      const puzzle = getDungeonPuzzle(gauntlet.id, trial.id)!
      const recipe = puzzleRecipe(trial.recipeId)!
      // A last-resort fold falls outside the recipe's own target band and would
      // quietly replace the advertised puzzle with a plain sum.
      expect(puzzle.target, `${gauntlet.id}/${trial.id}`).toBeGreaterThanOrEqual(
        recipe.targetMin
      )
      expect(puzzle.target, `${gauntlet.id}/${trial.id}`).toBeLessThanOrEqual(
        recipe.targetMax
      )
      expect(puzzle.settings.numCards).toBe(recipe.cardCounts[0])
    }

    const impossible = chaos.gauntlets.flatMap((gauntlet) =>
      gauntlet.trials
        .filter((trial) => trial.difficulty === 'impossible')
        .map((trial) => getDungeonPuzzle(gauntlet.id, trial.id)!)
    )
    expect(impossible.length).toBeGreaterThanOrEqual(6)
    expect(Math.max(...impossible.map((puzzle) => puzzle.settings.numCards))).toBe(20)
    expect(impossible.every((puzzle) => puzzle.settings.numCards >= 17)).toBe(true)

    const door = (gauntletId: string, trialId: string) => getDungeonPuzzle(gauntletId, trialId)!

    const halfTide = door('decimal-sea', 'half-tide')
    expect(halfTide.target).toBeGreaterThan(0)
    expect(halfTide.target).toBeLessThan(1)

    const oddParts = door('scrapheap', 'odd-parts')
    expect(oddParts.settings.binds.rook.enabled).toBe(true)
    expect(oddParts.settings.binds.dragon.enabled).toBe(false)

    const salvage = door('scrapheap', 'salvage')
    expect(salvage.settings.binds.dragon.enabled).toBe(true)
    expect(salvage.settings.binds.rook.enabled).toBe(false)

    const backwash = door('undertow', 'backwash')
    expect(backwash.settings.allowedOperators.operators.add).toBe(false)

    const brine = door('undertow', 'sinkhole')
    expect(brine.target).toBeLessThan(0)
    expect(Number.isInteger(brine.target)).toBe(false)

    const titan = door('scrapheap', 'nine-scraps')
    expect(titan.settings.numCards).toBeGreaterThanOrEqual(18)
    expect(titan.settings.allowedOperators.operators.add).toBe(false)
    expect(titan.settings.allowedOperators.operators.mult).toBe(false)

    // The two twenty-card crown doors are loose hands: no free locks to hide behind.
    for (const [gauntletId, trialId] of [
      ['billion-vault', 'vault-of-nine'],
      ['sphinx', 'the-answer'],
    ] as const) {
      const puzzle = door(gauntletId, trialId)
      expect(puzzle.settings.numCards).toBe(20)
      expect(puzzle.bindLabels).toHaveLength(0)
    }

    // The final door inverts the theme: a huge hand over a tiny target.
    const lastLight = door('last-light', 'last-light')
    expect(lastLight.settings.numCards).toBe(20)
    expect(lastLight.target).toBeLessThan(10_000)
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

  it('opens the first trial and the first gauntlet of each chapter', () => {
    const empty: DungeonProgress = {}
    const chaos = DUNGEON_GROUPS[1]!
    expect(isTrialUnlocked(empty, cellar, 0)).toBe(true)
    expect(isTrialUnlocked(empty, cellar, 1)).toBe(false)
    expect(isGauntletUnlocked(empty, cellar.id)).toBe(true)
    expect(isGauntletUnlocked(empty, foundry.id)).toBe(false)
    // Both chapters are open from the start, but each ramps on its own.
    expect(isGauntletUnlocked(empty, chaos.gauntlets[0]!.id)).toBe(true)
    expect(isGauntletUnlocked(empty, chaos.gauntlets[1]!.id)).toBe(false)

    const firstCleared: DungeonProgress = {
      [`${cellar.id}/${cellar.trials[0]!.id}`]: { score: 90, clearedAt: 1 },
    }
    expect(isTrialUnlocked(firstCleared, cellar, 1)).toBe(true)
    expect(isTrialUnlocked(firstCleared, cellar, 2)).toBe(false)
    expect(gauntletClearedCount(firstCleared, cellar)).toBe(1)
    expect(gauntletIsCleared(firstCleared, cellar)).toBe(false)
  })

  it('treats a revealed trial as cleared so the next one opens', () => {
    const progress: DungeonProgress = {
      [`${cellar.id}/${cellar.trials[0]!.id}`]: { score: 0, clearedAt: 1, revealed: true },
    }

    expect(trialRevealed(progress, cellar.id, cellar.trials[0]!.id)).toBe(true)
    expect(trialRevealed(progress, cellar.id, cellar.trials[1]!.id)).toBe(false)
    expect(isTrialUnlocked(progress, cellar, 1)).toBe(true)
    expect(isTrialUnlocked(progress, cellar, 2)).toBe(false)
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
    // Clearing Chapter I does not skip the second gauntlet of Chapter II.
    const abyss = DUNGEON_GROUPS[0]!.gauntlets.at(-1)!
    expect(nextGauntletAfter(abyss.id)?.id).toBe('decimal-sea')
    const abyssCleared = clear({}, abyss.id)
    expect(isGauntletUnlocked(abyssCleared, 'scrapheap')).toBe(false)
    expect(isGauntletUnlocked(abyssCleared, 'decimal-sea')).toBe(true)
  })
})

function sortedCardIds(node: ExprNode): string[] {
  if (node.kind === 'card') return [node.card.id]
  if (node.kind === 'bind') return node.cards.map((leaf) => leaf.card.id)
  if (node.kind === 'unary') return sortedCardIds(node.operand)
  return [...sortedCardIds(node.left), ...sortedCardIds(node.right)].sort()
}
