import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import GauntletLoreDialog from './GauntletLoreDialog.vue'
import GauntletScreen from './screens/GauntletScreen.vue'
import { GAME_KEY } from '../app/context'
import type { GameContext } from '../app/useGame'
import { DUNGEON_GAUNTLETS } from '../engine/dungeon'

const wrappers: VueWrapper[] = []

function mountLore(gauntletId: string) {
  const wrapper = mount(GauntletLoreDialog, {
    props: { gauntletId },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()!.unmount()
})

describe('gauntlet lore', () => {
  it('gives every gauntlet a distinct page in the connected ledger', () => {
    expect(DUNGEON_GAUNTLETS).toHaveLength(14)

    const headings = DUNGEON_GAUNTLETS.map((gauntlet) => gauntlet.lore.heading)
    expect(new Set(headings).size).toBe(14)

    for (const gauntlet of DUNGEON_GAUNTLETS) {
      expect(gauntlet.lore.heading.length).toBeGreaterThan(8)
      expect(gauntlet.lore.epigraph.length).toBeGreaterThan(20)
      expect(gauntlet.lore.source.length).toBeGreaterThan(3)
      expect(gauntlet.lore.paragraphs.length).toBeGreaterThanOrEqual(2)
      for (const paragraph of gauntlet.lore.paragraphs) {
        expect(paragraph.length).toBeGreaterThan(80)
      }
    }

    const story = DUNGEON_GAUNTLETS.map(
      (gauntlet) =>
        `${gauntlet.lore.epigraph} ${gauntlet.lore.paragraphs.join(' ')}`
    ).join(' ')
    expect(story).toContain('Twenty-Fourth Card')
    expect(story).toContain('First Dealer')
    expect(story).toContain('lamplighter')
    expect(story).toContain('blank card')
    expect(story).toContain('daughter')
    expect(story.match(/Dealer/g)?.length ?? 0).toBeGreaterThanOrEqual(8)
    expect(story.match(/lamplighter/g)?.length ?? 0).toBeGreaterThanOrEqual(6)

    // The lore carries the story, not a glossary of the game's operators.
    for (const jargon of [
      'operator',
      'target',
      'factorial',
      'logarithm',
      'multiplication',
      'addition',
      'subtraction',
      'trigonometry',
    ]) {
      expect(story.toLowerCase()).not.toContain(jargon)
    }
  })

  it('reads the selected fragment and turns to the next gauntlet', async () => {
    const wrapper = mountLore('cellar')

    expect(wrapper.get('[data-testid="gauntlet-lore-dialog"]').text()).toContain(
      'The first chalk mark'
    )
    expect(wrapper.text()).toContain('Fragment 01 / 14')
    expect(wrapper.text()).toContain('CHAPTER I')
    expect(wrapper.text()).toContain('Into the Abyss')
    expect(wrapper.get('[data-testid="gauntlet-lore-prev"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="gauntlet-lore-next"]').trigger('click')
    expect(wrapper.text()).toContain('The deck is a mold')
    expect(wrapper.text()).toContain('Fragment 02 / 14')
    expect(wrapper.text()).toContain('The Cellar')
  })

  it('crosses from Chapter I into Chapter II as the ledger turns', async () => {
    const wrapper = mountLore('abyss')

    expect(wrapper.text()).toContain('The proof that failed')
    await wrapper.get('[data-testid="gauntlet-lore-next"]').trigger('click')

    expect(wrapper.text()).toContain('The remainder')
    expect(wrapper.text()).toContain('CHAPTER II')
    expect(wrapper.text()).toContain('Trials of Chaos')
    expect(wrapper.text()).toContain('Fragment 08 / 14')
  })

  it('turns pages and closes with the keyboard', async () => {
    const wrapper = mountLore('cellar')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('The deck is a mold')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('The first chalk mark')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes from the button or the backdrop', async () => {
    const buttonClose = mountLore('cellar')
    await buttonClose.get('[data-testid="gauntlet-lore-close"]').trigger('click')
    expect(buttonClose.emitted('close')).toHaveLength(1)

    const backdropClose = mountLore('cellar')
    await backdropClose.get('[data-testid="gauntlet-lore-overlay"]').trigger('click')
    expect(backdropClose.emitted('close')).toHaveLength(1)
  })

  it('opens the lore reader from the gauntlet page', async () => {
    const gauntlet = DUNGEON_GAUNTLETS[0]!
    const context = {
      menuOpen: ref(false),
      tutorialOpen: ref(false),
      selectedGauntlet: ref(gauntlet),
      gauntletComplete: () => false,
      gauntletProgress: () => 0,
      gauntletBest: () => null,
      trialCleared: () => false,
      trialRevealed: () => false,
      trialUnlocked: () => true,
      startDungeonTrial: vi.fn(),
      openDungeon: vi.fn(),
      openGauntlet: vi.fn(),
      nextGauntletId: () => null,
    } as unknown as GameContext

    const wrapper = mount(GauntletScreen, {
      global: { provide: { [GAME_KEY]: context } },
    })
    wrappers.push(wrapper)

    const button = wrapper.get('[data-testid="gauntlet-lore-btn"]')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')

    expect(wrapper.get('[data-testid="gauntlet-lore-dialog"]').text()).toContain(
      'The first chalk mark'
    )
    expect(wrapper.get('[data-testid="gauntlet-lore-btn"]').attributes('aria-expanded')).toBe(
      'true'
    )

    await wrapper.get('[data-testid="gauntlet-lore-close"]').trigger('click')
    expect(wrapper.find('[data-testid="gauntlet-lore-dialog"]').exists()).toBe(false)
  })
})
