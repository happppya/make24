import { describe, expect, it } from 'vitest'
import { sanitizeName } from './protocol'
import { randomPlayerName } from './playerNames'

/** Small deterministic PRNG so a variety test does not flake. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('random player names', () => {
  it('draws a varied set of short, readable names', () => {
    const rng = seededRng(24)
    const names = Array.from({ length: 200 }, () => randomPlayerName(rng))

    // Two word banks of a couple dozen entries each should comfortably clear this.
    expect(new Set(names).size).toBeGreaterThan(100)
    for (const name of names) {
      expect(name).not.toBe('Player')
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
      expect(name.length).toBeLessThanOrEqual(18)
    }
  })

  it('fills a blank name with a generated handle, unless a fallback is given', () => {
    const generated = sanitizeName('   ')
    expect(generated).not.toBe('Player')
    expect(generated.length).toBeGreaterThan(3)
    expect(sanitizeName('', 'Named')).toBe('Named')
  })
})
