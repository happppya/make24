import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from './App.vue'

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
    expect(wrapper.text()).toContain('42')
    expect(wrapper.find('[data-testid="gauntlet-cellar"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="gauntlet-foundry"]').attributes('disabled')).toBeDefined()

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
