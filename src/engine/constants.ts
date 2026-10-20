/**
 * Famous constants that can be dealt as a target when the table's target preset
 * is `constant`. The value is the target the player approximates; the rest is
 * shown in the HUD so the number is not just a mystery.
 */
export interface ConstantInfo {
  id: string
  name: string
  symbol: string
  value: number
  /** One line, plain language: what the constant is. */
  description: string
}

export const CONSTANT_CATALOG = [
  {
    id: 'pi',
    name: 'Pi',
    symbol: 'π',
    value: Math.PI,
    description: "A circle's circumference divided by its diameter.",
  },
  {
    id: 'e',
    name: "Euler's number",
    symbol: 'e',
    value: Math.E,
    description: 'Base of natural logarithms; the value of continuous 100% growth over one unit.',
  },
  {
    id: 'euler-gamma',
    name: "Euler's constant",
    symbol: 'γ',
    value: 0.5772156649015329,
    description: 'The limiting gap between the harmonic series and the natural logarithm.',
  },
  {
    id: 'golden-ratio',
    name: 'Golden ratio',
    symbol: 'φ',
    value: 1.618033988749895,
    description: 'The positive root of x² = x + 1, and the self-similar cut of a segment.',
  },
  {
    id: 'sqrt2',
    name: 'Square root of 2',
    symbol: '√2',
    value: Math.SQRT2,
    description: 'The diagonal of a unit square; the first number proved irrational.',
  },
  {
    id: 'sqrt3',
    name: 'Square root of 3',
    symbol: '√3',
    value: Math.sqrt(3),
    description: 'The space diagonal of a unit cube.',
  },
  {
    id: 'sqrt5',
    name: 'Square root of 5',
    symbol: '√5',
    value: Math.sqrt(5),
    description: 'The diagonal of a 1 × 2 rectangle, and the raw material of the golden ratio.',
  },
  {
    id: 'ln2',
    name: 'Natural log of 2',
    symbol: 'ln 2',
    value: Math.LN2,
    description: 'The time to double at a continuous growth rate of 1.',
  },
  {
    id: 'catalan',
    name: "Catalan's constant",
    symbol: 'G',
    value: 0.915965594177219,
    description: 'The alternating sum of the reciprocals of the odd squares.',
  },
  {
    id: 'apery',
    name: "Apéry's constant",
    symbol: 'ζ(3)',
    value: 1.2020569031595942,
    description: 'ζ(3): the sum of 1/n³ over every positive integer n.',
  },
  {
    id: 'plastic',
    name: 'Plastic number',
    symbol: 'ρ',
    value: 1.324717957244746,
    description: 'The real root of x³ = x + 1; the smallest Pisot number.',
  },
  {
    id: 'feigenbaum-delta',
    name: 'Feigenbaum δ',
    symbol: 'δ',
    value: 4.669201609102991,
    description: 'The ratio between successive period-doubling intervals in chaos.',
  },
  {
    id: 'feigenbaum-alpha',
    name: 'Feigenbaum α',
    symbol: 'α',
    value: 2.5029078750958926,
    description: 'The scaling ratio of the period-doubling cascade.',
  },
  {
    id: 'khinchin',
    name: "Khinchin's constant",
    symbol: 'K',
    value: 2.6854520010653064,
    description: 'The geometric mean of continued-fraction terms for almost every real number.',
  },
  {
    id: 'glaisher',
    name: 'Glaisher–Kinkelin constant',
    symbol: 'A',
    value: 1.2824271291006226,
    description: 'The constant in the asymptotic growth of the hyperfactorial.',
  },
  {
    id: 'conway',
    name: "Conway's constant",
    symbol: 'λ',
    value: 1.3035772690342964,
    description: 'The growth rate of the look-and-say sequence.',
  },
  {
    id: 'twin-prime',
    name: 'Twin prime constant',
    symbol: 'C₂',
    value: 0.6601618158468696,
    description: 'The density factor in the twin-prime conjecture.',
  },
  {
    id: 'somos',
    name: 'Somos constant',
    symbol: 'σ',
    value: 1.6616879496335941,
    description: 'The limit of a nested square-root recurrence.',
  },
  {
    id: 'mills',
    name: "Mills' constant",
    symbol: 'θ',
    value: 1.3063778838630806,
    description: 'The smallest base whose floor(a^(3ⁿ)) is prime for every n.',
  },
  {
    id: 'porter',
    name: 'Porter constant',
    symbol: 'C',
    value: 1.4670780794339755,
    description: 'A constant in the asymptotic expansion of the sum-of-divisors function.',
  },
  {
    id: 'tribonacci',
    name: 'Tribonacci constant',
    symbol: 'T',
    value: 1.8392867552141612,
    description: 'The root of x³ = x² + x + 1; the tribonacci growth rate.',
  },
  {
    id: 'dottie',
    name: 'Dottie number',
    symbol: 'D',
    value: 0.7390851332151607,
    description: 'The unique real fixed point of cos x.',
  },
  {
    id: 'omega',
    name: 'Omega constant',
    symbol: 'Ω',
    value: 0.5671432904097838,
    description: 'The solution of x·eˣ = 1; the Lambert W of 1.',
  },
  {
    id: 'erdos-borwein',
    name: 'Erdős–Borwein constant',
    symbol: 'E',
    value: 1.6066951524152917,
    description: 'The sum of the reciprocals of the Mersenne numbers minus one.',
  },
  {
    id: 'golomb-dickman',
    name: 'Golomb–Dickman constant',
    symbol: 'λ',
    value: 0.6243299885435509,
    description: 'The expected longest cycle in a random permutation, relative to its length.',
  },
  {
    id: 'landau-ramanujan',
    name: 'Landau–Ramanujan constant',
    symbol: 'K',
    value: 0.7642236535892206,
    description: 'The density of integers that are a sum of two squares.',
  },
  {
    id: 'meissel-mertens',
    name: 'Meissel–Mertens constant',
    symbol: 'M',
    value: 0.2614972128476428,
    description: 'The limit of the sum of reciprocal primes minus ln(ln n).',
  },
  {
    id: 'bernstein',
    name: "Bernstein's constant",
    symbol: 'β',
    value: 0.2801694990238691,
    description: 'The limiting error in the best polynomial approximation of |x|.',
  },
  {
    id: 'universal-parabolic',
    name: 'Universal parabolic constant',
    symbol: 'P',
    value: 2.295587149392638,
    description: 'The arc-length constant shared by every parabola.',
  },
  {
    id: 'lemniscate',
    name: 'Lemniscate constant',
    symbol: 'ϖ',
    value: 2.6220575542921198,
    description: "Half the arc length of Bernoulli's lemniscate.",
  },
  {
    id: 'gauss',
    name: "Gauss's constant",
    symbol: 'G',
    value: 0.8346268416740732,
    description: 'The reciprocal of the arithmetic–geometric mean of 1 and √2.',
  },
  {
    id: 'laplace-limit',
    name: 'Laplace limit',
    symbol: 'L',
    value: 0.6627434193491816,
    description: "The eccentricity limit for convergence of Laplace's series.",
  },
  {
    id: 'cahen',
    name: "Cahen's constant",
    symbol: 'C',
    value: 0.643410546288338,
    description: 'The value of an alternating series built from the Sylvester sequence.',
  },
  {
    id: 'ramanujan-soldner',
    name: 'Ramanujan–Soldner constant',
    symbol: 'μ',
    value: 1.451369234883381,
    description: 'The unique positive zero of the logarithmic integral.',
  },
  {
    id: 'fransen-robinson',
    name: 'Fransén–Robinson constant',
    symbol: 'F',
    value: 2.8077702420285194,
    description: 'A constant defined by an integral involving the factorial function.',
  },
  {
    id: 'backhouse',
    name: "Backhouse's constant",
    symbol: 'B',
    value: 1.4560749485826896,
    description: 'A constant arising from a nested recurrence of prime numbers.',
  },
  {
    id: 'kepler-bouwkamp',
    name: 'Kepler–Bouwkamp constant',
    symbol: 'K',
    value: 0.1149420448532962,
    description: 'The limit size of the optimal circle packing in a square.',
  },
  {
    id: 'gelfond',
    name: "Gelfond's constant",
    symbol: 'e^π',
    value: 23.140692632779267,
    description: 'e raised to π; transcendental by the Gelfond–Schneider theorem.',
  },
  {
    id: 'silver-ratio',
    name: 'Silver ratio',
    symbol: 'δ',
    value: 2.4142135623730954,
    description: 'The positive root of x² = 2x + 1; the silver analogue of φ.',
  },
  {
    id: 'mrb',
    name: 'MRB constant',
    symbol: 'C',
    value: 0.1878596424620671,
    description: "Marvin Ray Burns' constant, an alternating sum of nested radicals.",
  },
] as const satisfies readonly ConstantInfo[]

export type ConstantId = (typeof CONSTANT_CATALOG)[number]['id']

/** The lobby can pin one constant or let each round pick a different one. */
export type ConstantChoice = ConstantId | 'random'

export const CONSTANT_IDS: readonly ConstantId[] = CONSTANT_CATALOG.map(
  (constant) => constant.id
)

export const CONSTANT_CHOICES: readonly ConstantChoice[] = ['random', ...CONSTANT_IDS]

export function constantById(id: string): ConstantInfo | null {
  return CONSTANT_CATALOG.find((constant) => constant.id === id) ?? null
}

/** Maps a dealt target back to its catalogue entry. */
export function constantByValue(value: number): ConstantInfo | null {
  return (
    CONSTANT_CATALOG.find(
      (constant) => Math.abs(constant.value - value) <= Math.abs(constant.value) * 1e-12
    ) ?? null
  )
}

export function pickConstant(rng: () => number = Math.random): ConstantInfo {
  const index = Math.min(
    CONSTANT_CATALOG.length - 1,
    Math.max(0, Math.floor(rng() * CONSTANT_CATALOG.length))
  )
  return CONSTANT_CATALOG[index]!
}
