import Decimal from 'decimal.js'

/**
 * Internal working precision. Every operator is evaluated at 50 significant
 * digits, which leaves plenty of guard digits behind the 32 the UI can expose.
 */
export const ENGINE_PRECISION = 50
/** The most decimal places (and significant digits) the in-game slider exposes. */
export const MAX_DECIMAL_PLACES = 32
/** Default display width: short enough for cards, precise enough for most sums. */
export const DEFAULT_DECIMAL_PLACES = 5

export const D = Decimal.clone({
  precision: ENGINE_PRECISION,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -ENGINE_PRECISION,
  toExpPos: ENGINE_PRECISION,
})

/** A value the engine can accept without first rounding it through a double. */
export type NumericInput = number | string | Decimal

const HALF = new D(0.5)
const ONE = new D(1)
const TWO = new D(2)
const DEGREES_IN_CIRCLE = new D(360)
const DEGREES_IN_HALF_CIRCLE = new D(180)
const WHOLE_TOLERANCE = new D('1e-30')
const EXACT_TOLERANCE = new D('1e-30')

/** π to more digits than the engine claims to expose. */
export const DECIMAL_PI = new D(
  '3.14159265358979323846264338327950288419716939937510'
)

/** Γ bottoms out here: Γ(1.46163214…) ≈ 0.88560319. */
export const GAMMA_MIN_X_EXACT = new D(
  '1.46163214496836234126265954232572132846819620400644'
)
export const GAMMA_MIN_VALUE_EXACT = new D(
  '0.88560319441088870027881590058258873320795153366990'
)

export function toDecimal(value: NumericInput): Decimal {
  return D.isDecimal(value) ? value : new D(value)
}

export function decimalToNumber(value: Decimal): number {
  return Number(value.toString())
}

export function decimalIsFinite(value: Decimal): boolean {
  return value.isFinite()
}

/** Removes a negative zero without rounding the value at all. */
export function normalizeDecimal(value: Decimal): Decimal {
  return value.isZero() ? new D(0) : value
}

/** Canonical exact string carried by expression nodes and wire payloads. */
export function decimalString(value: NumericInput): string {
  return normalizeDecimal(toDecimal(value)).toString()
}

/** A whole number, allowing only rounding noise far below display precision. */
export function wholeDecimal(value: NumericInput): Decimal | null {
  const d = toDecimal(value)
  if (!d.isFinite()) return null
  const rounded = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  return d.minus(rounded).abs().lte(WHOLE_TOLERANCE) ? rounded : null
}

export function decimalIsSafeInteger(value: Decimal): boolean {
  return value.isInteger() && value.abs().lte(Number.MAX_SAFE_INTEGER)
}

/* ------------------------------- gamma / factorial ------------------------------- */

/**
 * Spouge's approximation converges fast enough that 45 coefficients give us
 * well over the 32 digits the display exposes. Coefficients are expensive but
 * constant, so they are built once, lazily.
 */
const SPOUGE_A = 45
let spougeCoefficients: Decimal[] | null = null

function smallFactorial(n: number): Decimal {
  let product = ONE
  for (let i = 2; i <= n; i += 1) product = product.mul(i)
  return product
}

function spouge(): Decimal[] {
  if (spougeCoefficients) return spougeCoefficients
  const coefficients: Decimal[] = [TWO.mul(DECIMAL_PI).sqrt()]
  for (let k = 1; k < SPOUGE_A; k += 1) {
    const aMinusK = new D(SPOUGE_A - k)
    const term = aMinusK
      .pow(new D(k).minus(HALF))
      .mul(aMinusK.exp())
      .div(smallFactorial(k - 1))
    coefficients.push(k % 2 === 1 ? term : term.neg())
  }
  spougeCoefficients = coefficients
  return coefficients
}

const MAX_GAMMA_INPUT = 1_000_000
const SPECIAL_CACHE_LIMIT = 20_000

/**
 * Puzzle generation probes the same factorial/gamma values thousands of times.
 * The functions are pure, so a bounded cache turns that search from seconds
 * into milliseconds without changing any result.
 */
const gammaCache = new Map<string, Decimal | null>()
const factorialCache = new Map<string, Decimal | null>()
const inverseGammaCache = new Map<string, Decimal | null>()

function remember(
  cache: Map<string, Decimal | null>,
  key: string,
  value: Decimal | null
): Decimal | null {
  if (cache.size >= SPECIAL_CACHE_LIMIT) cache.clear()
  cache.set(key, value)
  return value
}

/**
 * Γ(z) at engine precision. Poles at non-positive integers return null, as do
 * inputs so large that a useful result stops being practical.
 */
export function decimalGamma(input: NumericInput): Decimal | null {
  const z = toDecimal(input)
  if (!z.isFinite() || z.abs().gt(MAX_GAMMA_INPUT)) return null
  const key = z.toString()
  if (gammaCache.has(key)) return gammaCache.get(key) ?? null
  if (z.lte(0) && z.isInteger()) return remember(gammaCache, key, null)

  // Reflection keeps the Spouge series on the well-behaved positive axis.
  if (z.lt(HALF)) {
    const reflected = decimalGamma(ONE.minus(z))
    if (!reflected) return remember(gammaCache, key, null)
    const sin = DECIMAL_PI.mul(z).sin()
    if (sin.isZero()) return remember(gammaCache, key, null)
    return remember(
      gammaCache,
      key,
      normalizeDecimal(DECIMAL_PI.div(sin.mul(reflected)))
    )
  }

  // Small whole arguments are exact products, avoiding approximation noise.
  if (z.isInteger() && z.lte(10_000)) {
    return remember(gammaCache, key, smallFactorial(z.toNumber() - 1))
  }

  const coefficients = spouge()
  const shifted = z.minus(1)
  let sum = coefficients[0]!
  for (let k = 1; k < SPOUGE_A; k += 1) {
    sum = sum.add(coefficients[k]!.div(shifted.add(k)))
  }
  const t = shifted.add(SPOUGE_A)
  const result = t.pow(shifted.add(HALF)).mul(t.neg().exp()).mul(sum)
  return remember(
    gammaCache,
    key,
    result.isFinite() ? normalizeDecimal(result) : null
  )
}

export function decimalFactorial(input: NumericInput): Decimal | null {
  const x = toDecimal(input)
  if (!x.isFinite()) return null
  const key = x.toString()
  if (factorialCache.has(key)) return factorialCache.get(key) ?? null
  const result =
    x.isInteger() && x.gte(0) && x.lte(10_000)
      ? smallFactorial(x.toNumber())
      : decimalGamma(x.add(1))
  return remember(factorialCache, key, result)
}

/** Principal (increasing) branch of the inverse gamma function. */
export function decimalInverseGamma(input: NumericInput): Decimal | null {
  const y = toDecimal(input)
  if (!y.isFinite() || y.lte(0)) return null
  const key = y.toString()
  if (inverseGammaCache.has(key)) return inverseGammaCache.get(key) ?? null
  if (y.lt(GAMMA_MIN_VALUE_EXACT)) return remember(inverseGammaCache, key, null)
  if (y.eq(GAMMA_MIN_VALUE_EXACT)) {
    return remember(inverseGammaCache, key, GAMMA_MIN_X_EXACT)
  }

  // Bracket Γ on its increasing half, doubling until it overtakes y.
  let lo = GAMMA_MIN_X_EXACT
  let hi = GAMMA_MIN_X_EXACT.add(1)
  for (let i = 0; i < 80; i += 1) {
    const value = decimalGamma(hi)
    if (!value || value.gte(y)) break
    lo = hi
    hi = GAMMA_MIN_X_EXACT.add(hi.minus(GAMMA_MIN_X_EXACT).mul(2))
  }

  // Bisection needs no derivative and cannot overshoot a pole.
  for (let i = 0; i < 260; i += 1) {
    const mid = lo.add(hi).div(2)
    const value = decimalGamma(mid)
    if (!value || value.gte(y)) hi = mid
    else lo = mid
    if (hi.minus(lo).abs().lte('1e-45')) break
  }

  const root = lo.add(hi).div(2)
  const nearest = root.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  if (root.minus(nearest).abs().lte(WHOLE_TOLERANCE)) {
    const check = decimalGamma(nearest)
    if (check && check.minus(y).abs().lte(y.abs().mul('1e-40'))) {
      return remember(inverseGammaCache, key, normalizeDecimal(nearest))
    }
  }
  return remember(inverseGammaCache, key, normalizeDecimal(root))
}

/* ------------------------------------ trig ------------------------------------ */

/** Remaining degrees in [0, period), used to make cardinal angles exact. */
function degreesMod(value: Decimal, period: Decimal): Decimal {
  const remainder = value.mod(period)
  return remainder.isNeg() ? remainder.add(period) : remainder
}

export function decimalSinDegrees(input: NumericInput): Decimal {
  const degrees = toDecimal(input)
  const turn = degreesMod(degrees, DEGREES_IN_CIRCLE)
  if (turn.isZero() || turn.eq(DEGREES_IN_HALF_CIRCLE)) return new D(0)
  if (turn.eq(90)) return new D(1)
  if (turn.eq(270)) return new D(-1)
  return DECIMAL_PI.mul(degrees).div(180).sin()
}

export function decimalCosDegrees(input: NumericInput): Decimal {
  const degrees = toDecimal(input)
  const turn = degreesMod(degrees, DEGREES_IN_CIRCLE)
  if (turn.isZero()) return new D(1)
  if (turn.eq(DEGREES_IN_HALF_CIRCLE)) return new D(-1)
  if (turn.eq(90) || turn.eq(270)) return new D(0)
  return DECIMAL_PI.mul(degrees).div(180).cos()
}

export function decimalTanDegrees(input: NumericInput): Decimal | null {
  const degrees = toDecimal(input)
  const turn = degreesMod(degrees, DEGREES_IN_HALF_CIRCLE)
  if (turn.eq(90)) return null
  if (turn.isZero()) return new D(0)
  return decimalSinDegrees(degrees).div(decimalCosDegrees(degrees))
}

/* --------------------------------- formatting --------------------------------- */

function clampPlaces(decimalPlaces: number): number {
  if (!Number.isFinite(decimalPlaces)) return DEFAULT_DECIMAL_PLACES
  return Math.min(MAX_DECIMAL_PLACES, Math.max(0, Math.round(decimalPlaces)))
}

function trimFixed(text: string): string {
  if (!text.includes('.')) return text
  return text.replace(/0+$/, '').replace(/\.$/, '')
}

function trimExponential(text: string): string {
  const [mantissa, exponent = '0'] = text.split('e')
  const shortened = trimFixed(mantissa!)
  return `${shortened}e${Number(exponent)}`
}

/**
 * Formats a value for the HUD. The default is five decimal places; pass more
 * places to reveal the precision the engine is carrying underneath.
 */
export function formatNumber(value: NumericInput, decimalPlaces = DEFAULT_DECIMAL_PLACES): string {
  let d: Decimal
  try {
    d = toDecimal(value)
  } catch {
    return 'Undefined'
  }
  if (!d.isFinite()) return 'Undefined'
  if (d.isZero()) return '0'

  const places = clampPlaces(decimalPlaces)
  const abs = d.abs()

  // Very small or very large values read better in scientific notation; doing
  // this before the integer check also stops a tiny value from rounding to 0.
  if (abs.gte('1e7') || abs.lt('1e-4')) {
    return trimExponential(d.toExponential(places))
  }

  const rounded = d.toDecimalPlaces(places, Decimal.ROUND_HALF_UP)
  if (rounded.isInteger()) return rounded.toFixed(0)
  return trimFixed(rounded.toFixed(places))
}

/** Shared exact-match epsilon for acceptance checks. */
export const targetEpsilon = EXACT_TOLERANCE
