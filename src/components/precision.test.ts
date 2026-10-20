import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import CardGroupNode from './CardGroupNode.vue'
import ScorePanel from './ScorePanel.vue'
import {
  decimalPlaces,
  resetDecimalPlaces,
} from '../app/displayPrecision'
import { applyBinaryOperator } from '../engine/math'
import type { Card, BinaryGroupNode } from '../engine/types'

const PI_EXACT = '3.14159265358979323846264338327950288419716939937510'

function card(rank: number, suit: Card['suit'], id: string): Card {
  return {
    id,
    rank: rank as Card['rank'],
    suit,
    value: rank,
    label: String(rank),
    spritePath: `/card-sprites/${rank}-of-${suit}.png`,
  }
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  window.localStorage.clear()
  resetDecimalPlaces()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  resetDecimalPlaces()
})

describe('in-game decimal precision', () => {
  it('starts at five places and reveals the exact target at 32', async () => {
    wrapper = mount(ScorePanel, {
      props: {
        roundNumber: 1,
        target: Math.PI,
        targetExact: PI_EXACT,
        approximationPercent: 0.5,
        scoringMode: 'balanced',
        value: null,
        errorPercent: null,
        acceptable: false,
        costBreakdown: null,
        hitSignal: 0,
      },
    })

    expect(wrapper.find('[data-testid="target-display"]').text()).toBe('3.14159')
    expect(wrapper.find('[data-testid="precision-value"]').text()).toBe('5')

    await wrapper.find('[data-testid="decimal-slider"]').setValue('32')
    expect(wrapper.find('[data-testid="target-display"]').text()).toBe(
      '3.1415926535897932384626433832795'
    )
    expect(wrapper.find('[data-testid="precision-value"]').text()).toBe('ALL 32')
    expect(window.localStorage.getItem('make24-decimal-places')).toBe('32')

    await wrapper.find('[data-testid="reset-decimals"]').trigger('click')
    expect(wrapper.find('[data-testid="target-display"]').text()).toBe('3.14159')
  })

  it('offers the control on the live gameplay screen', async () => {
    wrapper = mount(App)
    await wrapper.find('[data-testid="enter-singleplayer"]').trigger('click')
    await wrapper.find('[data-testid="start-round-btn"]').trigger('click')

    expect(wrapper.find('.screen-playing').exists()).toBe(true)
    const slider = wrapper.find('[data-testid="decimal-slider"]')
    expect(slider.exists()).toBe(true)
    expect((slider.element as HTMLInputElement).value).toBe('5')

    await slider.setValue('32')
    expect(wrapper.find('[data-testid="precision-value"]').text()).toBe('ALL 32')
  })

  it('reformats board headers as the slider moves', async () => {
    const third = applyBinaryOperator('div', 1, 3)
    const node: BinaryGroupNode = {
      kind: 'binary',
      id: 'precision-bin',
      operator: 'div',
      left: { kind: 'card', id: 'one', card: card(1, 'clubs', 'one'), value: 1, exactValue: '1' },
      right: { kind: 'card', id: 'three', card: card(3, 'spades', 'three'), value: 3, exactValue: '3' },
      value: third.value,
      exactValue: third.exactValue,
      headerText: third.headerText,
    }

    wrapper = mount(CardGroupNode, { props: { node, isRoot: false } })
    expect(wrapper.find('.group-header-eq').text()).toBe('1 ÷ 3 = 0.33333')

    decimalPlaces.value = 32
    await nextTick()
    expect(wrapper.find('.group-header-eq').text()).toBe(
      '1 ÷ 3 = 0.33333333333333333333333333333333'
    )
  })
})
