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

describe('daily and weekly puzzles', () => {
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
