/**
 * Pure particle-burst maths for the felt's juice layer.
 *
 * Values are deterministic for a given seed so a burst can be replayed in tests,
 * and each particle is a plain object that a component can paint without
 * touching the DOM. Positions are target offsets from the burst origin, in
 * pixels; the CSS animation owns the actual flight.
 */
export type ParticleBurstKind = 'merge' | 'split' | 'operator' | 'hit' | 'error'
export type ParticleShape = 'square' | 'spark' | 'shard'

export interface BurstParticle {
  id: number
  originX: number
  originY: number
  dx: number
  dy: number
  size: number
  rotation: number
  delay: number
  duration: number
  color: string
  shape: ParticleShape
}

export const PARTICLE_BURST_COUNTS = {
  merge: 12,
  split: 16,
  operator: 8,
  hit: 30,
  error: 6,
} as const satisfies Record<ParticleBurstKind, number>

export const PARTICLE_PALETTES = {
  merge: ['#ffe169', '#ffbe0b', '#72efdd', '#f8f2e0'],
  split: ['#ff8fa3', '#fe4a49', '#b8b09c', '#f8f2e0'],
  operator: ['#ffe169', '#72efdd', '#f8f2e0', '#ffbe0b'],
  hit: ['#ffbe0b', '#ffe169', '#fe4a49', '#72efdd', '#f8f2e0', '#5bc0eb'],
  error: ['#fe4a49', '#ff8fa3', '#8c1c1c'],
} as const satisfies Record<ParticleBurstKind, readonly string[]>

interface BurstConfig {
  distance: [number, number]
  size: [number, number]
  duration: [number, number]
  delay: [number, number]
  yBias: number
  xScale: number
  shapes: readonly ParticleShape[]
}

const BURST_CONFIG: Record<ParticleBurstKind, BurstConfig> = {
  merge: {
    distance: [34, 86],
    size: [3, 6],
    duration: [620, 900],
    delay: [0, 70],
    yBias: -12,
    xScale: 1,
    shapes: ['square', 'square', 'spark'],
  },
  split: {
    distance: [48, 118],
    size: [2, 5],
    duration: [650, 950],
    delay: [0, 80],
    yBias: -8,
    xScale: 1,
    shapes: ['shard', 'shard', 'square'],
  },
  operator: {
    distance: [18, 52],
    size: [2, 4],
    duration: [480, 700],
    delay: [0, 60],
    yBias: -16,
    xScale: 1,
    shapes: ['spark', 'spark', 'square'],
  },
  hit: {
    distance: [80, 210],
    size: [3, 7],
    duration: [850, 1200],
    delay: [0, 140],
    yBias: -20,
    xScale: 1.05,
    shapes: ['square', 'square', 'spark', 'shard'],
  },
  error: {
    distance: [16, 44],
    size: [2, 4],
    duration: [420, 620],
    delay: [0, 40],
    yBias: 4,
    xScale: 1,
    shapes: ['spark', 'shard'],
  },
}

/** Small deterministic PRNG, so tests can assert exact burst shapes. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function between(random: () => number, [min, max]: [number, number]): number {
  return min + random() * (max - min)
}

/**
 * Builds one burst at `origin` (felt-local pixels). Merge and split effects fan
 * out in every direction; hits throw wider, slower confetti with a slight lift.
 */
export function createParticleBurst(
  kind: ParticleBurstKind,
  seed: number,
  origin: { x: number; y: number } = { x: 0, y: 0 }
): BurstParticle[] {
  const config = BURST_CONFIG[kind]
  const palette = PARTICLE_PALETTES[kind]
  const random = mulberry32(seed)
  const particles: BurstParticle[] = []

  for (let index = 0; index < PARTICLE_BURST_COUNTS[kind]; index += 1) {
    const angle = random() * Math.PI * 2
    const distance = between(random, config.distance)
    const shape = config.shapes[Math.floor(random() * config.shapes.length)] ?? 'square'
    particles.push({
      id: index,
      originX: origin.x,
      originY: origin.y,
      dx: Math.cos(angle) * distance * config.xScale,
      dy: Math.sin(angle) * distance + config.yBias,
      size: between(random, config.size),
      rotation: random() * 540 - 270,
      delay: between(random, config.delay),
      duration: between(random, config.duration),
      color: palette[Math.floor(random() * palette.length)] ?? palette[0],
      shape,
    })
  }

  return particles
}
