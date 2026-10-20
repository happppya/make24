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
  /** Full-precision decimal string used by the Decimal engine. */
  exactValue: string
  /** One line, plain language: what the constant is. */
  description: string
}

export const CONSTANT_CATALOG = [
  {
    id: 'pi',
    name: 'Pi',
    symbol: 'π',
    value: Number('3.14159265358979323846264338327950288419716939937510'),
    exactValue: '3.14159265358979323846264338327950288419716939937510',
    description: "A circle's circumference divided by its diameter.",
  },
  {
    id: 'e',
    name: "Euler's number",
    symbol: 'e',
    value: Number('2.71828182845904523536028747135266249775724709369995'),
    exactValue: '2.71828182845904523536028747135266249775724709369995',
    description: 'Base of natural logarithms; the value of continuous 100% growth over one unit.',
  },
  {
    id: 'euler-gamma',
    name: "Euler's constant",
    symbol: 'γ',
    value: Number('0.57721566490153286060651209008240243104215933593992'),
    exactValue: '0.57721566490153286060651209008240243104215933593992',
    description: 'The limiting gap between the harmonic series and the natural logarithm.',
  },
  {
    id: 'golden-ratio',
    name: 'Golden ratio',
    symbol: 'φ',
    value: Number('1.61803398874989484820458683436563811772030917980576'),
    exactValue: '1.61803398874989484820458683436563811772030917980576',
    description: 'The positive root of x² = x + 1, and the self-similar cut of a segment.',
  },
  {
    id: 'sqrt2',
    name: 'Square root of 2',
    symbol: '√2',
    value: Number('1.41421356237309504880168872420969807856967187537694'),
    exactValue: '1.41421356237309504880168872420969807856967187537694',
    description: 'The diagonal of a unit square; the first number proved irrational.',
  },
  {
    id: 'sqrt3',
    name: 'Square root of 3',
    symbol: '√3',
    value: Number('1.73205080756887729352744634150587236694280525381038'),
    exactValue: '1.73205080756887729352744634150587236694280525381038',
    description: 'The space diagonal of a unit cube.',
  },
  {
    id: 'sqrt5',
    name: 'Square root of 5',
    symbol: '√5',
    value: Number('2.23606797749978969640917366873127623544061835961152'),
    exactValue: '2.23606797749978969640917366873127623544061835961152',
    description: 'The diagonal of a 1 × 2 rectangle, and the raw material of the golden ratio.',
  },
  {
    id: 'ln2',
    name: 'Natural log of 2',
    symbol: 'ln 2',
    value: Number('0.69314718055994530941723212145817656807550013436025'),
    exactValue: '0.69314718055994530941723212145817656807550013436025',
    description: 'The time to double at a continuous growth rate of 1.',
  },
  {
    id: 'catalan',
    name: "Catalan's constant",
    symbol: 'G',
    value: Number('0.91596559417721901505460351493238411077414937428167'),
    exactValue: '0.91596559417721901505460351493238411077414937428167',
    description: 'The alternating sum of the reciprocals of the odd squares.',
  },
  {
    id: 'apery',
    name: "Apéry's constant",
    symbol: 'ζ(3)',
    value: Number('1.20205690315959428539973816151144999076498629234049'),
    exactValue: '1.20205690315959428539973816151144999076498629234049',
    description: 'ζ(3): the sum of 1/n³ over every positive integer n.',
  },
  {
    id: 'plastic',
    name: 'Plastic number',
    symbol: 'ρ',
    value: Number('1.32471795724474602596090885447809734073440405690173'),
    exactValue: '1.32471795724474602596090885447809734073440405690173',
    description: 'The real root of x³ = x + 1; the smallest Pisot number.',
  },
  {
    id: 'feigenbaum-delta',
    name: 'Feigenbaum δ',
    symbol: 'δ',
    value: Number('4.66920160910299067185320382046620161725818557747576'),
    exactValue: '4.66920160910299067185320382046620161725818557747576',
    description: 'The ratio between successive period-doubling intervals in chaos.',
  },
  {
    id: 'feigenbaum-alpha',
    name: 'Feigenbaum α',
    symbol: 'α',
    value: Number('2.50290787509589282228390287321821578638127137672714'),
    exactValue: '2.50290787509589282228390287321821578638127137672714',
    description: 'The scaling ratio of the period-doubling cascade.',
  },
  {
    id: 'khinchin',
    name: "Khinchin's constant",
    symbol: 'K',
    value: Number('2.68545200106530644530971483548179569382038229399446'),
    exactValue: '2.68545200106530644530971483548179569382038229399446',
    description: 'The geometric mean of continued-fraction terms for almost every real number.',
  },
  {
    id: 'glaisher',
    name: 'Glaisher–Kinkelin constant',
    symbol: 'A',
    value: Number('1.28242712910062263687534256886979172776768892732500'),
    exactValue: '1.28242712910062263687534256886979172776768892732500',
    description: 'The constant in the asymptotic growth of the hyperfactorial.',
  },
  {
    id: 'conway',
    name: "Conway's constant",
    symbol: 'λ',
    value: Number('1.30357726903429639125709911215255189073070250465940'),
    exactValue: '1.30357726903429639125709911215255189073070250465940',
    description: 'The growth rate of the look-and-say sequence.',
  },
  {
    id: 'twin-prime',
    name: 'Twin prime constant',
    symbol: 'C₂',
    value: Number('0.66016181584686957392781211001455577843262336028473'),
    exactValue: '0.66016181584686957392781211001455577843262336028473',
    description: 'The density factor in the twin-prime conjecture.',
  },
  {
    id: 'somos',
    name: 'Somos constant',
    symbol: 'σ',
    value: Number('1.66168794963359412129581892274995074996441863502506'),
    exactValue: '1.66168794963359412129581892274995074996441863502506',
    description: 'The limit of a nested square-root recurrence.',
  },
  {
    id: 'mills',
    name: "Mills' constant",
    symbol: 'θ',
    value: Number('1.30637788386308069046861449260260571291678458515671'),
    exactValue: '1.30637788386308069046861449260260571291678458515671',
    description: 'The smallest base whose floor(a^(3ⁿ)) is prime for every n.',
  },
  {
    id: 'porter',
    name: 'Porter constant',
    symbol: 'C',
    value: Number('1.46707807943397547289779848470722995344990332241488'),
    exactValue: '1.46707807943397547289779848470722995344990332241488',
    description: 'A constant in the asymptotic expansion of the sum-of-divisors function.',
  },
  {
    id: 'tribonacci',
    name: 'Tribonacci constant',
    symbol: 'T',
    value: Number('1.83928675521416113255185256465328660042417874609759'),
    exactValue: '1.83928675521416113255185256465328660042417874609759',
    description: 'The root of x³ = x² + x + 1; the tribonacci growth rate.',
  },
  {
    id: 'dottie',
    name: 'Dottie number',
    symbol: 'D',
    value: Number('0.73908513321516064165531208767387340401341175890075'),
    exactValue: '0.73908513321516064165531208767387340401341175890075',
    description: 'The unique real fixed point of cos x.',
  },
  {
    id: 'omega',
    name: 'Omega constant',
    symbol: 'Ω',
    value: Number('0.56714329040978387299996866221035554975381578718651'),
    exactValue: '0.56714329040978387299996866221035554975381578718651',
    description: 'The solution of x·eˣ = 1; the Lambert W of 1.',
  },
  {
    id: 'erdos-borwein',
    name: 'Erdős–Borwein constant',
    symbol: 'E',
    value: Number('1.60669515241529176378330152319092458048057967150575'),
    exactValue: '1.60669515241529176378330152319092458048057967150575',
    description: 'The sum of the reciprocals of the Mersenne numbers minus one.',
  },
  {
    id: 'golomb-dickman',
    name: 'Golomb–Dickman constant',
    symbol: 'λ',
    value: Number('0.62432998854355087099293638310083724417964262018052'),
    exactValue: '0.62432998854355087099293638310083724417964262018052',
    description: 'The expected longest cycle in a random permutation, relative to its length.',
  },
  {
    id: 'landau-ramanujan',
    name: 'Landau–Ramanujan constant',
    symbol: 'K',
    value: Number('0.76422365358922066299069873125009232811663746722581'),
    exactValue: '0.76422365358922066299069873125009232811663746722581',
    description: 'The density of integers that are a sum of two squares.',
  },
  {
    id: 'meissel-mertens',
    name: 'Meissel–Mertens constant',
    symbol: 'M',
    value: Number('0.26149721284764278375542683860869585905156664826119'),
    exactValue: '0.26149721284764278375542683860869585905156664826119',
    description: 'The limit of the sum of reciprocal primes minus ln(ln n).',
  },
  {
    id: 'bernstein',
    name: "Bernstein's constant",
    symbol: 'β',
    value: Number('0.28016949902386913303643649123067200004248213981236'),
    exactValue: '0.28016949902386913303643649123067200004248213981236',
    description: 'The limiting error in the best polynomial approximation of |x|.',
  },
  {
    id: 'universal-parabolic',
    name: 'Universal parabolic constant',
    symbol: 'P',
    value: Number('2.29558714939263807403429804918949038759783220363850'),
    exactValue: '2.29558714939263807403429804918949038759783220363850',
    description: 'The arc-length constant shared by every parabola.',
  },
  {
    id: 'lemniscate',
    name: 'Lemniscate constant',
    symbol: 'ϖ',
    value: Number('2.62205755429211981046483958989111941368275495143162'),
    exactValue: '2.62205755429211981046483958989111941368275495143162',
    description: "Half the arc length of Bernoulli's lemniscate.",
  },
  {
    id: 'gauss',
    name: "Gauss's constant",
    symbol: 'G',
    value: Number('0.83462684167407318628142973279904680899399301349034'),
    exactValue: '0.83462684167407318628142973279904680899399301349034',
    description: 'The reciprocal of the arithmetic–geometric mean of 1 and √2.',
  },
  {
    id: 'laplace-limit',
    name: 'Laplace limit',
    symbol: 'L',
    value: Number('0.66274341934918158097474209710925290705623354911502'),
    exactValue: '0.66274341934918158097474209710925290705623354911502',
    description: "The eccentricity limit for convergence of Laplace's series.",
  },
  {
    id: 'cahen',
    name: "Cahen's constant",
    symbol: 'C',
    value: Number('0.64341054628833802618225430775756476328658786026823'),
    exactValue: '0.64341054628833802618225430775756476328658786026823',
    description: 'The value of an alternating series built from the Sylvester sequence.',
  },
  {
    id: 'ramanujan-soldner',
    name: 'Ramanujan–Soldner constant',
    symbol: 'μ',
    value: Number('1.45136923488338105028396848589202744949303228364801'),
    exactValue: '1.45136923488338105028396848589202744949303228364801',
    description: 'The unique positive zero of the logarithmic integral.',
  },
  {
    id: 'fransen-robinson',
    name: 'Fransén–Robinson constant',
    symbol: 'F',
    value: Number('2.80777024202851936522150118655777293230808592093019'),
    exactValue: '2.80777024202851936522150118655777293230808592093019',
    description: 'A constant defined by an integral involving the factorial function.',
  },
  {
    id: 'backhouse',
    name: "Backhouse's constant",
    symbol: 'B',
    value: Number('1.45607494858268967139959535111654355778296045670622'),
    exactValue: '1.45607494858268967139959535111654355778296045670622',
    description: 'A constant arising from a nested recurrence of prime numbers.',
  },
  {
    id: 'kepler-bouwkamp',
    name: 'Kepler–Bouwkamp constant',
    symbol: 'K',
    value: Number('0.11494204485329620070104015746959874283079533716292'),
    exactValue: '0.11494204485329620070104015746959874283079533716292',
    description: 'The limit size of the optimal circle packing in a square.',
  },
  {
    id: 'gelfond',
    name: "Gelfond's constant",
    symbol: 'e^π',
    value: Number('23.1406926327792690057290863679485473802661062426002'),
    exactValue: '23.1406926327792690057290863679485473802661062426002',
    description: 'e raised to π; transcendental by the Gelfond–Schneider theorem.',
  },
  {
    id: 'silver-ratio',
    name: 'Silver ratio',
    symbol: 'δ',
    value: Number('2.41421356237309504880168872420969807856967187537694'),
    exactValue: '2.41421356237309504880168872420969807856967187537694',
    description: 'The positive root of x² = 2x + 1; the silver analogue of φ.',
  },
  {
    id: 'mrb',
    name: 'MRB constant',
    symbol: 'C',
    value: Number('0.18785964246206712024851793405427323005590309490013'),
    exactValue: '0.18785964246206712024851793405427323005590309490013',
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
