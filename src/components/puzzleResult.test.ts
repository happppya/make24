import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PuzzleResultScreen from './screens/PuzzleResultScreen.vue'
import { GAME_KEY } from '../app/context'
import type { PuzzleResult } from '../app/usePuzzles'
import type { GameContext } from '../app/useGame'
import { DUNGEON_GAUNTLETS, getDungeonPuzzle } from '../engine/dungeon'
import type { DungeonProgress } from '../engine/dungeon'

const GAUNTLET = DUNGEON_GAUNTLETS[0]!
const TRIAL = GAUNTLET.trials[0]!

function dungeonResult(): PuzzleResult {
  const puzzle = getDungeonPuzzle(GAUNTLET.id, TRIAL.id)!
  return {
    puzzle,
    score: 88,
    equation: '1 + 2 = 3',
    rank: null,
    improved: true,
    source: 'dungeon',
    note: null,
    dungeon: { gauntletId: GAUNTLET.id, trialId: TRIAL.id },
  }
}

function mountResult(options: {
  progress: DungeonProgress
  complete?: boolean
}) {
  const nextDungeonTrial = vi.fn()
  const exitPuzzleToHub = vi.fn()
  const openDungeon = vi.fn()
  const openGauntlet = vi.fn()
  const context = {
    menuOpen: ref(false),
    tutorialOpen: ref(false),
    lastResult: ref<PuzzleResult | null>(dungeonResult()),
    puzzlePlayerName: ref('Ada'),
    boardState: () => 'idle',
    topThree: () => [],
    retryPuzzle: vi.fn(),
    exitPuzzleToHub,
    nextDungeonTrial,
    gauntletProgress: () => Object.keys(options.progress).length,
    gauntletComplete: () => Boolean(options.complete),
    nextGauntletId: () => DUNGEON_GAUNTLETS[1]?.id ?? null,
    openGauntlet,
    openDungeon,
  } as unknown as GameContext

  const wrapper = mount(PuzzleResultScreen, {
    global: { provide: { [GAME_KEY]: context } },
  })
  return { wrapper, nextDungeonTrial, exitPuzzleToHub, openDungeon, openGauntlet }
}

describe('dungeon result screen', () => {
  it('shows trial progress and offers the next trial', async () => {
    const progress: DungeonProgress = {
      [`${GAUNTLET.id}/${TRIAL.id}`]: { score: 88, clearedAt: 1 },
    }
    const { wrapper, nextDungeonTrial, exitPuzzleToHub } = mountResult({ progress })

    expect(wrapper.text()).toContain('TRIAL CLEARED')
    expect(wrapper.text()).toContain('Gauntlet progress')
    expect(wrapper.text()).toContain('1 / 6 cleared')
    expect(wrapper.find('[data-testid="dungeon-result-progress"]').exists()).toBe(true)

    const next = wrapper.find('[data-testid="next-trial-btn"]')
    expect(next.exists()).toBe(true)
    expect(next.text()).toContain(GAUNTLET.trials[1]!.title)
    await next.trigger('click')
    expect(nextDungeonTrial).toHaveBeenCalledOnce()

    await wrapper.find('[data-testid="back-to-gauntlet-btn"]').trigger('click')
    expect(exitPuzzleToHub).toHaveBeenCalledOnce()
  })

  it('opens the next gauntlet when the gatekeeper falls', async () => {
    const progress: DungeonProgress = Object.fromEntries(
      GAUNTLET.trials.map((trial) => [
        `${GAUNTLET.id}/${trial.id}`,
        { score: 90, clearedAt: 1 },
      ])
    )
    const { wrapper, openGauntlet } = mountResult({ progress, complete: true })

    expect(wrapper.text()).toContain('6 / 6 cleared')
    expect(wrapper.text()).toContain('Every trial is cleared')
    const next = wrapper.find('[data-testid="next-gauntlet-btn"]')
    expect(next.exists()).toBe(true)
    await next.trigger('click')
    expect(openGauntlet).toHaveBeenCalledWith(DUNGEON_GAUNTLETS[1]!.id)
  })
})
