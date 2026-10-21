import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from './App.vue'
import { DUNGEON_GAUNTLETS } from './engine/dungeon'

const board = {
  entries: [
    { playerName: 'Ada', score: 30, equation: '...', lhs: '...', finalValue: 24, submittedAt: 1 },
    { playerName: 'Bo', score: 40, equation: '...', lhs: '...', finalValue: 24, submittedAt: 2 },
    { playerName: 'Cy', score: 50, equation: '...', lhs: '...', finalValue: 24, submittedAt: 3 },
    { playerName: 'Dee', score: 60, equation: '...', lhs: '...', finalValue: 24, submittedAt: 4 },
  ],
  serverTime: 1,
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => board,
    }))
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

describe('calendar and dungeon puzzles', () => {
  it('opens the puzzle hub from the main menu with both puzzles and their top three', async () => {
    wrapper = mount(App)
    const entry = wrapper.find('[data-testid="open-puzzles"]')
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')
    await flushPromises()

    expect(wrapper.find('.screen-puzzles').exists()).toBe(true)
    expect(wrapper.find('[data-testid="puzzle-daily-card"]').text()).toContain('Daily')
    expect(wrapper.find('[data-testid="puzzle-weekly-card"]').text()).toContain('Weekly')
    expect(wrapper.find('[data-testid="puzzle-daily-card"]').text()).toContain('Ada')
    expect(wrapper.find('[data-testid="puzzle-daily-card"]').text()).toContain('Bo')
    expect(wrapper.find('[data-testid="puzzle-daily-card"]').text()).toContain('Cy')
    expect(wrapper.find('[data-testid="puzzle-daily-card"]').text()).not.toContain('Dee')

    // The puzzle ledger is separate from the multiplayer display name.
    await wrapper.find('[data-testid="puzzle-name-input"]').setValue('Ada Lovelace')
    expect(window.localStorage.getItem('make24-puzzle-name')).toBe('Ada Lovelace')
  })

  it('shows all four calendar boards with their difficulty tiers and reset clocks', async () => {
    wrapper = mount(App)
    await wrapper.find('[data-testid="open-puzzles"]').trigger('click')
    await flushPromises()

    const hourly = wrapper.find('[data-testid="puzzle-hourly-card"]')
    const daily = wrapper.find('[data-testid="puzzle-daily-card"]')
    const secondDaily = wrapper.find('[data-testid="puzzle-daily-2-card"]')
    const weekly = wrapper.find('[data-testid="puzzle-weekly-card"]')
    expect(hourly.text()).toContain('HOURLY')
    expect(daily.text()).toContain('DAILY I')
    expect(secondDaily.text()).toContain('DAILY II')
    expect(weekly.text()).toContain('WEEKLY')
    expect(hourly.find('.puzzle-card__reset').text()).toMatch(/m left/)

    const hourlyChip = hourly.find('[data-difficulty]').attributes('data-difficulty')
    const weeklyChip = weekly.find('[data-difficulty]').attributes('data-difficulty')
    expect(['easy', 'medium']).toContain(hourlyChip)
    expect(['expert', 'extreme', 'confounding', 'impossible']).toContain(weeklyChip)
  })

  it('opens the dungeon from the main menu and gates the gauntlets in order', async () => {
    wrapper = mount(App)
    const entry = wrapper.find('[data-testid="open-dungeon"]')
    expect(entry.exists()).toBe(true)
    expect(entry.attributes('aria-label')).toBe('The Dungeon')
    await entry.trigger('click')
    await flushPromises()

    expect(wrapper.find('.screen-dungeon').exists()).toBe(true)
    expect(wrapper.text()).toContain('The Cellar')
    expect(wrapper.text()).toContain('The Abyss')
    expect(wrapper.text()).toContain('84')
    // Two chapters, each with its first gauntlet open.
    expect(wrapper.find('[data-testid="dungeon-group-into-the-abyss"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dungeon-group-trials-of-chaos"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Into the Abyss')
    expect(wrapper.text()).toContain('Trials of Chaos')
    expect(wrapper.find('[data-testid="gauntlet-cellar"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="gauntlet-foundry"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="gauntlet-decimal-sea"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="gauntlet-scrapheap"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="gauntlet-cellar"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.screen-gauntlet').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trial-first-light"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="trial-mousetrap"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="trial-first-light"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.screen-playing').exists()).toBe(true)
    const header = wrapper.find('[data-testid="puzzle-play-header"]')
    expect(header.text()).toContain('DUNGEON')
    expect(header.text()).toContain('Trial 1 of 6')
    expect(header.text()).toContain('The Cellar')
    expect(wrapper.find('[data-testid="puzzle-submit-btn"]').exists()).toBe(true)
  })

  it('opens every dungeon door when the hidden code is entered', async () => {
    wrapper = mount(App)
    await wrapper.find('[data-testid="open-dungeon"]').trigger('click')
    await flushPromises()

    const code = wrapper.find('[data-testid="dungeon-code-input"]')
    expect(code.exists()).toBe(true)
    expect(wrapper.find('[data-testid="gauntlet-last-light"]').attributes('disabled')).toBeDefined()

    await code.setValue('not-the-code')
    await wrapper.find('[data-testid="dungeon-code-form"]').trigger('submit')
    expect(wrapper.find('[data-testid="gauntlet-last-light"]').attributes('disabled')).toBeDefined()

    await code.setValue('ilovecheating')
    await wrapper.find('[data-testid="dungeon-code-form"]').trigger('submit')
    await flushPromises()

    for (const id of ['foundry', 'abyss', 'scrapheap', 'last-light']) {
      expect(
        wrapper.find(`[data-testid="gauntlet-${id}"]`).attributes('disabled'),
        id
      ).toBeUndefined()
    }

    await wrapper.find('[data-testid="gauntlet-last-light"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="trial-last-light"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-testid="trial-last-light"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.screen-playing').exists()).toBe(true)
    expect(wrapper.find('[data-testid="puzzle-play-header"]').text()).toContain('Last Light')
  })

  it('opens the second chapter with fractional and negative trials', async () => {
    // Chaos ramps its own gauntlets in order, so clear the three before the
    // Undertow to reach its negative targets.
    const progress: Record<string, { score: number; clearedAt: number }> = {}
    for (const id of ['decimal-sea', 'scrapheap', 'billion-vault']) {
      const gauntlet = DUNGEON_GAUNTLETS.find((entry) => entry.id === id)!
      for (const trial of gauntlet.trials) {
        progress[`${gauntlet.id}/${trial.id}`] = { score: 100, clearedAt: 1 }
      }
    }
    window.localStorage.setItem('make24-dungeon-progress-v1', JSON.stringify(progress))

    wrapper = mount(App)
    await wrapper.find('[data-testid="open-dungeon"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="gauntlet-decimal-sea"]').trigger('click')
    await flushPromises()
    const saltwater = wrapper.find('[data-testid="trial-saltwater"]')
    // Fractional targets keep their digits after the point.
    expect(saltwater.find('.trial-card__stats').text()).toMatch(/\d\.\d/)

    await wrapper.find('[data-testid="gauntlet-back-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="gauntlet-undertow"]').trigger('click')
    await flushPromises()
    const lowTide = wrapper.find('[data-testid="trial-low-tide"]')
    expect(lowTide.find('.trial-card__stats').text()).toMatch(/-\d/)

    await lowTide.trigger('click')
    await flushPromises()
    expect(wrapper.find('.screen-playing').exists()).toBe(true)
    expect(wrapper.find('[data-testid="target-display"]').text()).toMatch(/^-/)
  })

  it('lets a player give up on a dungeon trial, reveals the solution and opens the next one', async () => {
    wrapper = mount(App)
    await wrapper.find('[data-testid="open-dungeon"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="gauntlet-cellar"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="trial-first-light"]').trigger('click')
    await flushPromises()

    // Other puzzle kinds have no next challenge, so they offer no give-up.
    expect(wrapper.find('[data-testid="puzzle-reveal-btn"]').exists()).toBe(false)

    await wrapper.find('[data-testid="puzzle-give-up-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="give-up-note"]').exists()).toBe(true)
    await wrapper.find('[data-testid="puzzle-keep-trying-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="puzzle-give-up-btn"]').exists()).toBe(true)
    expect(window.localStorage.getItem('make24-dungeon-progress-v1')).toBeNull()

    await wrapper.find('[data-testid="puzzle-give-up-btn"]').trigger('click')
    await wrapper.find('[data-testid="puzzle-reveal-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.screen-puzzle-result').exists()).toBe(true)
    expect(wrapper.find('[data-testid="puzzle-result-stamp"]').text()).toContain(
      'SOLUTION REVEALED'
    )
    expect(wrapper.find('[data-testid="revealed-solution"]').exists()).toBe(true)
    const progress = JSON.parse(
      window.localStorage.getItem('make24-dungeon-progress-v1') ?? '{}'
    )
    expect(progress['cellar/first-light']).toMatchObject({ revealed: true })

    await wrapper.find('[data-testid="back-to-gauntlet-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.screen-gauntlet').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trial-mousetrap"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="trial-first-light"]').text()).toContain('REVEALED')
  })

  it('starts the hourly board from its card', async () => {
    wrapper = mount(App)
    await wrapper.find('[data-testid="open-puzzles"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="play-hourly-puzzle"]').trigger('click')
    await flushPromises()

    const header = wrapper.find('[data-testid="puzzle-play-header"]')
    expect(header.text()).toContain('HOURLY')
    expect(header.text()).not.toContain('DAILY')
    expect(wrapper.find('.screen-playing').exists()).toBe(true)
  })

  it('shows the top three while solving and offers a puzzle-specific submit flow', async () => {
    wrapper = mount(App)
    await wrapper.find('[data-testid="open-puzzles"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="play-daily-puzzle"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.screen-playing').exists()).toBe(true)
    const header = wrapper.find('[data-testid="puzzle-play-header"]')
    expect(header.exists()).toBe(true)
    expect(header.text()).toContain('DAILY')
    expect(header.text()).toContain('Ada')
    expect(header.text()).toContain('Bo')
    expect(header.text()).toContain('Cy')
    expect(header.text()).not.toContain('Dee')
    expect(wrapper.find('[data-testid="puzzle-submit-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="skip-round-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="end-match-btn"]').exists()).toBe(false)
  })
})
