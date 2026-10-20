import { describe, expect, it } from 'vitest'
import {
  PARTICLE_BURST_COUNTS,
  PARTICLE_PALETTES,
  createParticleBurst,
} from './particles'

describe('pixel particle bursts', () => {
  it('produces the same burst for the same seed and kind', () => {
    const first = createParticleBurst('merge', 1234)
    const second = createParticleBurst('merge', 1234)
    expect(second).toEqual(first)
    expect(first).toHaveLength(PARTICLE_BURST_COUNTS.merge)
  })

  it('gives different seeds different shapes', () => {
    const first = createParticleBurst('hit', 1)
    const second = createParticleBurst('hit', 2)
    expect(second).not.toEqual(first)
  })

  it('keeps every particle finite, colourful and bounded', () => {
    for (const kind of Object.keys(PARTICLE_BURST_COUNTS) as Array<
      keyof typeof PARTICLE_BURST_COUNTS
    >) {
      const particles = createParticleBurst(kind, 99)
      expect(particles).toHaveLength(PARTICLE_BURST_COUNTS[kind])
      for (const particle of particles) {
        expect(Number.isFinite(particle.dx)).toBe(true)
        expect(Number.isFinite(particle.dy)).toBe(true)
        expect(Number.isFinite(particle.rotation)).toBe(true)
        expect(particle.size).toBeGreaterThan(0)
        expect(particle.delay).toBeGreaterThanOrEqual(0)
        expect(particle.duration).toBeGreaterThan(300)
        expect(Math.abs(particle.dx)).toBeLessThanOrEqual(240)
        expect(Math.abs(particle.dy)).toBeLessThanOrEqual(260)
        expect(PARTICLE_PALETTES[kind]).toContain(particle.color)
      }
    }
  })

  it('sets the origin on every particle in a burst', () => {
    const particles = createParticleBurst('operator', 7, { x: 120, y: 84 })
    expect(particles.every((particle) => particle.originX === 120)).toBe(true)
    expect(particles.every((particle) => particle.originY === 84)).toBe(true)
  })
})
