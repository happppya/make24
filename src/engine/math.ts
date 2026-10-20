import type {
  AllowedOperatorsConfig,
  BinaryOperator,
  ExprNode,
  ForbiddenMovesConfig,
  OperatorId,
  OperatorMeta,
  SolutionScoringMode,
  UnaryOperator,
} from './types'

/**
 * Accuracy penalty at the edge of the acceptance band, in score points.
 *
 * The band is normalised to 0–1, so the numbers mean the same thing at any
 * tolerance: cost-first only lets accuracy break a tie, balanced makes a
 * full-band miss cost as much as one binary operator, and accuracy-first makes
 * precision worth more than several operators.
 */
export const ACCURACY_WEIGHT: Record<SolutionScoringMode, number> = {
  'cost-first': 2,
  balanced: 30,
  'accuracy-first': 100,
}

export const OPERATOR_CATALOG: OperatorMeta[] = [
  // Basic binary
  {
    id: 'add',
    arity: 'binary',
    category: 'basic',
    label: 'Add',
    shortSymbol: '+',
    description: 'a + b',
    hotkey: '+',
  },
  {
    id: 'sub',
    arity: 'binary',
    category: 'basic',
    label: 'Subtract',
    shortSymbol: '−',
    description: 'a − b',
    hotkey: '-',
  },
  {
    id: 'mult',
    arity: 'binary',
    category: 'basic',
    label: 'Multiply',
    shortSymbol: '×',
    description: 'a × b',
    hotkey: '*',
  },
  {
    id: 'div',
    arity: 'binary',
    category: 'basic',
    label: 'Divide',
    shortSymbol: '÷',
    description: 'a ÷ b',
    hotkey: '/',
  },
  // Powers and roots
  {
    id: 'pow',
    arity: 'binary',
    category: 'powers',
    label: 'Power',
    shortSymbol: 'xʸ',
    description: 'a ^ b',
    hotkey: '^',
  },
  {
    id: 'root',
    arity: 'binary',
    category: 'powers',
    label: 'Root',
    shortSymbol: 'ʸ√x',
    description: 'a ^ (1/b)',
    hotkey: 'r',
  },
  // Factorials and gamma
  {
    id: 'fact',
    arity: 'unary',
    category: 'factorial',
    label: 'Factorial',
    shortSymbol: 'x!',
    description: 'Γ(x + 1)',
    hotkey: '!',
  },
  {
    id: 'gamma',
    arity: 'unary',
    category: 'factorial',
    label: 'Gamma',
    shortSymbol: 'Γ(x)',
    description: 'Γ(x)',
    hotkey: 'g',
  },
  {
    id: 'invgamma',
    arity: 'unary',
    category: 'factorial',
    label: 'Inv. Gamma',
    shortSymbol: 'Γ⁻¹(x)',
    description: 'x where Γ(x) = a',
    hotkey: 'G',
  },
  // Basic trig (degrees)
  {
    id: 'sin',
    arity: 'unary',
    category: 'trig',
    label: 'Sine',
    shortSymbol: 'sin°',
    description: 'sin(x°)',
    hotkey: 's',
  },
  {
    id: 'cos',
    arity: 'unary',
    category: 'trig',
    label: 'Cosine',
    shortSymbol: 'cos°',
    description: 'cos(x°)',
    hotkey: 'c',
  },
  {
    id: 'tan',
    arity: 'unary',
    category: 'trig',
    label: 'Tangent',
    shortSymbol: 'tan°',
    description: 'tan(x°)',
    hotkey: 't',
  },
  // Inverse
  {
    id: 'inv',
    arity: 'unary',
    category: 'inverse',
    label: 'Inverse',
    shortSymbol: '1/x',
    description: '1 ÷ x',
    hotkey: 'i',
  },
  // Bit shifting
  {
    id: 'lshift',
    arity: 'binary',
    category: 'bitshift',
    label: 'LSHIFT',
    shortSymbol: '<<',
    description: 'LSHIFT(a, b)',
    hotkey: '<',
  },
  {
    id: 'rshift',
    arity: 'binary',
    category: 'bitshift',
    label: 'RSHIFT',
    shortSymbol: '>>',
    description: 'RSHIFT(a, b)',
    hotkey: '>',
  },
  // Concatenation
  {
    id: 'concat',
    arity: 'binary',
    category: 'concat',
    label: 'Concat',
    shortSymbol: '||',
    description: 'a || b (digits joined)',
    hotkey: '|',
  },
]

export function getEnabledOperators(allowed: AllowedOperatorsConfig): OperatorMeta[] {
  return OPERATOR_CATALOG.filter((op) => allowed[op.category])
}

export function isUnaryOperator(op: OperatorId): op is UnaryOperator {
  return (
    op === 'fact' ||
    op === 'gamma' ||
    op === 'invgamma' ||
    op === 'sin' ||
    op === 'cos' ||
    op === 'tan' ||
    op === 'inv'
  )
}

const LANCZOS_G = 7
const LANCZOS_COEFFS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
]

const EPSILON = 1e-11
/** Doubles carry ~16 significant decimal digits; keep all of them when snapping noise. */
const SNAPPED_SIGNIFICANT_DIGITS = 16
/** Scientific notation keeps 15 significant digits (14 after the leading one). */
const SCIENTIFIC_DECIMALS = 14

export function cleanFloat(n: number): number {
  if (!Number.isFinite(n)) return n
  const rounded = Math.round(n)
  if (Math.abs(n - rounded) < EPSILON) {
    return Object.is(rounded, -0) ? 0 : rounded
  }
  // Snap away double-precision noise without throwing away real precision.
  // Rounding to a fixed number of decimal places (the old 9) made small values
  // coarser than the doubles underneath them; significant digits do not.
  const snapped = Number(n.toPrecision(SNAPPED_SIGNIFICANT_DIGITS))
  if (Number.isFinite(snapped) && Math.abs(n - snapped) < EPSILON) {
    return Object.is(snapped, -0) ? 0 : snapped
  }
  return Object.is(n, -0) ? 0 : n
}

function formatScientific(n: number): string {
  const [mantissa, exponent] = n.toExponential(SCIENTIFIC_DECIMALS).split('e')
  return `${Number(mantissa)}e${Number(exponent)}`
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Undefined'
  const clean = cleanFloat(n)
  if (Number.isInteger(clean)) {
    return String(clean)
  }
  const abs = Math.abs(clean)
  if (abs >= 1e7 || abs < 1e-4) {
    return formatScientific(clean)
  }
  return String(clean)
}

export function realGamma(z: number): number | null {
  if (!Number.isFinite(z)) return null
  // Poles at non-positive integers: 0, -1, -2, ...
  if (z <= 0 && Math.abs(z - Math.round(z)) < 1e-9) {
    return null
  }
  // Exact small positive integers: Gamma(n) = (n - 1)!
  const rounded = Math.round(z)
  if (rounded >= 1 && rounded <= 21 && Math.abs(z - rounded) < 1e-9) {
    let prod = 1
    for (let i = 1; i < rounded; i++) {
      prod *= i
    }
    return prod
  }
  if (z > 171.6) {
    return null // Overflows double precision
  }
  if (z < 0.5) {
    const sinTerm = Math.sin(Math.PI * z)
    if (Math.abs(sinTerm) < 1e-12) return null
    const reflected = realGamma(1 - z)
    if (reflected === null) return null
    const res = Math.PI / (sinTerm * reflected)
    return Number.isFinite(res) ? cleanFloat(res) : null
  }

  const shifted = z - 1
  let x = LANCZOS_COEFFS[0]!
  for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
    x += LANCZOS_COEFFS[i]! / (shifted + i)
  }
  const t = shifted + LANCZOS_G + 0.5
  const result = Math.sqrt(2 * Math.PI) * Math.pow(t, shifted + 0.5) * Math.exp(-t) * x
  if (!Number.isFinite(result)) return null
  return cleanFloat(result)
}

export function realFactorial(x: number): number | null {
  if (!Number.isFinite(x)) return null
  return realGamma(x + 1)
}

/** Where Γ bottoms out on the positive axis: Γ(1.46163214…) ≈ 0.88560319. */
export const GAMMA_MIN_X = 1.4616321449683623
export const GAMMA_MIN_VALUE = 0.8856031944108887

/**
 * Inverse gamma: the x with Γ(x) = y.
 *
 * On the positive axis Γ is U-shaped — it falls from +∞ to its minimum near
 * x ≈ 1.4616, then climbs again — so most inputs have two solutions. We expose
 * the principal (increasing) branch, the one that round-trips ordinary values:
 * Γ⁻¹(24) = 5, Γ⁻¹(120) = 6. Inputs at or below the minimum, and non-positive
 * inputs, have no solution on that branch.
 */
export function realInverseGamma(y: number): number | null {
  if (!Number.isFinite(y) || y <= 0) return null
  if (y < GAMMA_MIN_VALUE - 1e-12) return null
  if (y <= GAMMA_MIN_VALUE + 1e-12) return cleanFloat(GAMMA_MIN_X)

  // Bracket the root on the increasing half, widening until Γ overtakes y.
  let lo = GAMMA_MIN_X
  let hi = GAMMA_MIN_X + 1
  for (let i = 0; i < 64; i++) {
    const val = realGamma(hi)
    // A null here means Γ already overflowed double precision, so it is above y.
    if (val === null || val >= y) break
    lo = hi
    hi = GAMMA_MIN_X + (hi - GAMMA_MIN_X) * 2
  }

  // Bisection is slower than Newton but needs no derivative and cannot diverge.
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const val = realGamma(mid)
    if (val === null || val >= y) hi = mid
    else lo = mid
    if (hi - lo < 1e-13) break
  }

  // realGamma snaps arguments within 1e-9 of an integer to the exact value, which
  // leaves a thin flat band around roots like Γ⁻¹(24) = 5. Prefer the integer
  // whenever it really solves the equation.
  const root = (lo + hi) / 2
  const nearestInt = Math.round(root)
  if (Math.abs(root - nearestInt) < 1e-6) {
    const check = realGamma(nearestInt)
    if (check !== null && Math.abs(check - y) <= Math.abs(y) * 1e-9) return nearestInt
  }
  return cleanFloat(root)
}

export interface EvalResult {
  ok: boolean
  value: number
  headerText: string
  error?: string
}

export function applyUnaryOperator(op: UnaryOperator, x: number): EvalResult {
  const xStr = formatNumber(x)
  switch (op) {
    case 'fact': {
      const val = realFactorial(x)
      if (val === null) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: `Factorial of ${xStr} is undefined or overflows.`,
        }
      }
      return {
        ok: true,
        value: val,
        headerText: `${xStr}! = ${formatNumber(val)}`,
      }
    }
    case 'gamma': {
      const val = realGamma(x)
      if (val === null) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: `Γ(${xStr}) is undefined or overflows.`,
        }
      }
      return {
        ok: true,
        value: val,
        headerText: `Γ(${xStr}) = ${formatNumber(val)}`,
      }
    }
    case 'invgamma': {
      const val = realInverseGamma(x)
      if (val === null) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: `Γ⁻¹(${xStr}) is undefined.`,
        }
      }
      return {
        ok: true,
        value: val,
        headerText: `Γ⁻¹(${xStr}) = ${formatNumber(val)}`,
      }
    }
    case 'sin': {
      const rad = (x * Math.PI) / 180
      const val = cleanFloat(Math.sin(rad))
      return {
        ok: true,
        value: val,
        headerText: `sin(${xStr} deg) = ${formatNumber(val)}`,
      }
    }
    case 'cos': {
      const rad = (x * Math.PI) / 180
      const val = cleanFloat(Math.cos(rad))
      return {
        ok: true,
        value: val,
        headerText: `cos(${xStr} deg) = ${formatNumber(val)}`,
      }
    }
    case 'tan': {
      // Check odd multiples of 90 deg where cos(x) = 0
      const mod180 = ((x % 180) + 180) % 180
      if (Math.abs(mod180 - 90) < 1e-9) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: `tan(${xStr} deg) is undefined.`,
        }
      }
      const rad = (x * Math.PI) / 180
      const val = cleanFloat(Math.tan(rad))
      if (!Number.isFinite(val)) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: `tan(${xStr} deg) is undefined.`,
        }
      }
      return {
        ok: true,
        value: val,
        headerText: `tan(${xStr} deg) = ${formatNumber(val)}`,
      }
    }
    case 'inv': {
      if (Math.abs(x) < 1e-12) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Cannot take the inverse of 0.',
        }
      }
      const val = cleanFloat(1 / x)
      return {
        ok: true,
        value: val,
        headerText: `1 / ${xStr} = ${formatNumber(val)}`,
      }
    }
  }
}

export function applyBinaryOperator(op: BinaryOperator, a: number, b: number): EvalResult {
  const aStr = formatNumber(a)
  const bStr = formatNumber(b)
  switch (op) {
    case 'add': {
      const val = cleanFloat(a + b)
      return { ok: true, value: val, headerText: `${aStr} + ${bStr} = ${formatNumber(val)}` }
    }
    case 'sub': {
      const val = cleanFloat(a - b)
      return { ok: true, value: val, headerText: `${aStr} - ${bStr} = ${formatNumber(val)}` }
    }
    case 'mult': {
      const val = cleanFloat(a * b)
      return { ok: true, value: val, headerText: `${aStr} × ${bStr} = ${formatNumber(val)}` }
    }
    case 'div': {
      if (Math.abs(b) < 1e-12) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Cannot divide by 0.',
        }
      }
      const val = cleanFloat(a / b)
      return { ok: true, value: val, headerText: `${aStr} ÷ ${bStr} = ${formatNumber(val)}` }
    }
    case 'pow': {
      if (Math.abs(a) < 1e-12 && b < 0) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: '0 cannot be raised to a negative power.',
        }
      }
      const raw = Math.pow(a, b)
      if (!Number.isFinite(raw) || Number.isNaN(raw)) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: `${aStr} ^ ${bStr} is undefined or overflows.`,
        }
      }
      const val = cleanFloat(raw)
      return { ok: true, value: val, headerText: `${aStr} ^ ${bStr} = ${formatNumber(val)}` }
    }
    case 'root': {
      if (Math.abs(b) < 1e-12) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Cannot take the 0th root.',
        }
      }
      let raw: number
      if (a < 0) {
        const bInt = Math.round(b)
        if (Math.abs(b - bInt) < 1e-9 && Math.abs(bInt % 2) === 1) {
          raw = -Math.pow(-a, 1 / bInt)
        } else {
          return {
            ok: false,
            value: NaN,
            headerText: '',
            error: `Real ${bStr}-th root of negative number ${aStr} is undefined.`,
          }
        }
      } else {
        raw = Math.pow(a, 1 / b)
      }
      if (!Number.isFinite(raw) || Number.isNaN(raw)) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: `${aStr} root ${bStr} is undefined or overflows.`,
        }
      }
      const val = cleanFloat(raw)
      return {
        ok: true,
        value: val,
        headerText: `${aStr} root ${bStr} = ${formatNumber(val)}`,
      }
    }
    case 'lshift': {
      const aInt = Math.round(a)
      const bInt = Math.round(b)
      if (Math.abs(a - aInt) > 1e-9 || Math.abs(b - bInt) > 1e-9) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Bit shifting requires integer values.',
        }
      }
      if (bInt < 0 || bInt > 52) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Shift amount must be between 0 and 52.',
        }
      }
      const val = cleanFloat(aInt * Math.pow(2, bInt))
      return {
        ok: true,
        value: val,
        headerText: `LSHIFT(${aInt}, ${bInt}) = ${formatNumber(val)}`,
      }
    }
    case 'rshift': {
      const aInt = Math.round(a)
      const bInt = Math.round(b)
      if (Math.abs(a - aInt) > 1e-9 || Math.abs(b - bInt) > 1e-9) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Bit shifting requires integer values.',
        }
      }
      if (bInt < 0 || bInt > 52) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Shift amount must be between 0 and 52.',
        }
      }
      const val = Math.floor(aInt / Math.pow(2, bInt))
      return {
        ok: true,
        value: val,
        headerText: `RSHIFT(${aInt}, ${bInt}) = ${formatNumber(val)}`,
      }
    }
    case 'concat': {
      // Only exact, non-negative integers have an unambiguous digit string;
      // numbers above 2^53 would round, and `String()` would switch to exponent
      // notation, so both sides and the result stay inside the safe range.
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'Concat needs two whole numbers, zero or higher.',
        }
      }
      const digits = `${a}${b}`
      const val = Number(digits)
      if (!Number.isSafeInteger(val)) {
        return {
          ok: false,
          value: NaN,
          headerText: '',
          error: 'That concatenation is too long to use as a number.',
        }
      }
      return {
        ok: true,
        value: val,
        headerText: `${aStr} || ${bStr} = ${formatNumber(val)}`,
      }
    }
  }
}

export interface TargetCheckResult {
  acceptable: boolean
  minAcceptable: number
  maxAcceptable: number
  errorPercent: number
}

export function checkTargetAcceptance(
  value: number,
  target: number,
  approximationPercent: number
): TargetCheckResult {
  if (!Number.isFinite(value)) {
    return {
      acceptable: false,
      minAcceptable: target,
      maxAcceptable: target,
      errorPercent: Infinity,
    }
  }
  const cleanTarget = cleanFloat(target)
  const cleanVal = cleanFloat(value)

  // Target of 0 just has 0 tolerable error
  if (Math.abs(cleanTarget) < 1e-12 || approximationPercent <= 0) {
    const diff = Math.abs(cleanVal - cleanTarget)
    const acceptable = diff < 1e-7
    const errorPercent =
      Math.abs(cleanTarget) < 1e-12
        ? acceptable
          ? 0
          : 100
        : (diff / Math.abs(cleanTarget)) * 100
    return {
      acceptable,
      minAcceptable: cleanTarget,
      maxAcceptable: cleanTarget,
      errorPercent: cleanFloat(errorPercent),
    }
  }

  const band = Math.abs(cleanTarget) * (approximationPercent / 100)
  const minAcceptable = cleanFloat(cleanTarget - band)
  const maxAcceptable = cleanFloat(cleanTarget + band)
  const acceptable =
    cleanVal >= minAcceptable - 1e-7 && cleanVal <= maxAcceptable + 1e-7
  const errorPercent = (Math.abs(cleanVal - cleanTarget) / Math.abs(cleanTarget)) * 100

  return {
    acceptable,
    minAcceptable,
    maxAcceptable,
    errorPercent: cleanFloat(errorPercent),
  }
}

export interface AccuracyScoring {
  errorPercent: number
  approximationPercent: number
  mode: SolutionScoringMode
}

/**
 * Penalty for missing the target, scaled by how much of the allowed band the
 * miss uses. Exact hits pay nothing; the edge of the band pays the mode's
 * weight. Approximations being off means accuracy is not scored at all.
 */
export function accuracyPenaltyFor(
  errorPercent: number,
  approximationPercent: number,
  mode: SolutionScoringMode
): number {
  if (!(approximationPercent > 0) || !Number.isFinite(errorPercent)) return 0
  const bandUsed = Math.min(1, Math.max(0, Math.abs(errorPercent) / approximationPercent))
  return cleanFloat(bandUsed * ACCURACY_WEIGHT[mode])
}

/** Default price of one forbidden move, in score points. */
export const DEFAULT_FORBIDDEN_MOVE_PENALTY = 200

/** Out of the box, both house rules are on at the classic 200-point price. */
export const DEFAULT_FORBIDDEN_MOVES: ForbiddenMovesConfig = {
  factorialInvgamma: true,
  oneToPower: true,
}

/** Which forbidden moves are active, and what each occurrence costs. */
export interface ForbiddenMoveRules {
  moves: ForbiddenMovesConfig
  penalty: number
}

function resolvedForbiddenRules(rules?: ForbiddenMoveRules): ForbiddenMoveRules {
  if (!rules) return { moves: DEFAULT_FORBIDDEN_MOVES, penalty: DEFAULT_FORBIDDEN_MOVE_PENALTY }
  // A negative or missing price must never turn a forbidden move into a rebate.
  const penalty = Number.isFinite(rules.penalty) ? Math.max(0, rules.penalty) : 0
  return { moves: rules.moves, penalty }
}

function isFactorialInvgammaPair(outer: UnaryOperator, inner: UnaryOperator): boolean {
  return (
    (outer === 'fact' && inner === 'invgamma') ||
    (outer === 'invgamma' && inner === 'fact')
  )
}

/** A power whose base evaluates to 1, however that 1 was made. */
function isOneToPower(operator: BinaryOperator, base: ExprNode): boolean {
  return operator === 'pow' && base.value === 1
}

/**
 * Itemised cost of an expression tree. The rules:
 * - Lower score is better.
 * - Accuracy can add a weighted penalty; without `accuracy`, `total` is the
 *   plain operator cost returned by `calculateScore`.
 * - 10 score is added for each binary operator used.
 * - The unary penalty increases per layer: the first unary operator is 10,
 *   then the second is 20, then the third is 30, and so on with 40, 50, 60...
 *   So, using o(o(x)) incurs 30 points while o(o(o(x))) incurs 60 points.
 * - Nested unary operators on the same group count as a consecutive unary,
 *   and a binary operation resets the chain.
 * - House rules can forbid shortcut moves: `!` and `Γ⁻¹` nested directly
 *   together, and a power whose base is 1 (`1 ^ x`). Each occurrence adds the
 *   forbidden-move penalty (200 by default, host-configurable). Factorial and
 *   plain gamma together carry no extra penalty.
 */
export interface ScoreBreakdown {
  /** Operator cost plus any accuracy penalty; plain cost without `accuracy`. */
  total: number
  /** Number of binary operators in the tree and the 10 each one costs. */
  binaryOperators: number
  binaryCost: number
  /** Number of unary operators and the summed per-layer cost (10, 20, 30…). */
  unaryOperators: number
  unaryCost: number
  /** Forbidden-move occurrences and the penalty each one adds. */
  forbiddenCount: number
  forbiddenCost: number
  /** Weighted distance from the target, when accuracy scoring is supplied. */
  accuracyCost: number
}

/**
 * Walks the tree once, tallying each cost source so the UI can show where the
 * bill came from instead of a single lump sum.
 */
export function calculateScoreBreakdown(
  node: ExprNode,
  accuracy?: AccuracyScoring,
  forbidden?: ForbiddenMoveRules
): ScoreBreakdown {
  const rules = resolvedForbiddenRules(forbidden)
  let binaryOperators = 0
  let unaryOperators = 0
  let unaryCost = 0
  let forbiddenCount = 0

  function walk(curr: ExprNode, unaryDepthAbove: number): void {
    if (curr.kind === 'card') {
      return
    }
    if (curr.kind === 'binary') {
      binaryOperators++
      if (rules.moves.oneToPower && isOneToPower(curr.operator, curr.left)) {
        forbiddenCount++
      }
      walk(curr.left, 0)
      walk(curr.right, 0)
      return
    }
    unaryOperators++
    const currentLayer = unaryDepthAbove + 1
    unaryCost += currentLayer * 10

    if (
      rules.moves.factorialInvgamma &&
      curr.operand.kind === 'unary' &&
      isFactorialInvgammaPair(curr.operator, curr.operand.operator)
    ) {
      forbiddenCount++
    }

    walk(curr.operand, currentLayer)
  }

  walk(node, 0)

  const accuracyCost = accuracy
    ? accuracyPenaltyFor(accuracy.errorPercent, accuracy.approximationPercent, accuracy.mode)
    : 0
  const forbiddenCost = forbiddenCount * rules.penalty

  return {
    total: binaryOperators * 10 + unaryCost + forbiddenCost + accuracyCost,
    binaryOperators,
    binaryCost: binaryOperators * 10,
    unaryOperators,
    unaryCost,
    forbiddenCount,
    forbiddenCost,
    accuracyCost,
  }
}

/** Score of an expression tree; see `calculateScoreBreakdown` for the itemisation. */
export function calculateScore(node: ExprNode): number {
  return calculateScoreBreakdown(node).total
}

/**
 * Cost of every group on a board, so the HUD can bill the player as they build
 * instead of only once a solution exists. Accuracy still belongs to a finished
 * board, so the caller supplies it only when one group remains.
 */
export function calculateBoardBreakdown(
  groups: ExprNode[],
  accuracy?: AccuracyScoring,
  forbidden?: ForbiddenMoveRules
): ScoreBreakdown {
  let binaryOperators = 0
  let binaryCost = 0
  let unaryOperators = 0
  let unaryCost = 0
  let forbiddenCount = 0
  let forbiddenCost = 0

  for (const group of groups) {
    const part = calculateScoreBreakdown(group, undefined, forbidden)
    binaryOperators += part.binaryOperators
    binaryCost += part.binaryCost
    unaryOperators += part.unaryOperators
    unaryCost += part.unaryCost
    forbiddenCount += part.forbiddenCount
    forbiddenCost += part.forbiddenCost
  }

  const accuracyCost = accuracy
    ? accuracyPenaltyFor(accuracy.errorPercent, accuracy.approximationPercent, accuracy.mode)
    : 0

  return {
    total: binaryCost + unaryCost + forbiddenCost + accuracyCost,
    binaryOperators,
    binaryCost,
    unaryOperators,
    unaryCost,
    forbiddenCount,
    forbiddenCost,
    accuracyCost,
  }
}

/** How many unary operators sit directly on top of `node` (0 for anything else). */
export function unaryChainDepth(node: ExprNode): number {
  let depth = 0
  let current: ExprNode = node
  while (current.kind === 'unary') {
    depth += 1
    current = current.operand
  }
  return depth
}

/**
 * Points that stacking `operator` on top of `operand` adds to the score.
 *
 * The new unary becomes layer one and pushes the chain underneath it down a
 * layer, so a second stacked unary costs 20, not the 10 a fresh one does. A
 * forbidden factorial/inverse-gamma pairing adds the configured penalty.
 */
export function costOfUnaryOn(
  operator: UnaryOperator,
  operand: ExprNode,
  forbidden?: ForbiddenMoveRules
): number {
  const rules = resolvedForbiddenRules(forbidden)
  const layer = unaryChainDepth(operand) + 1
  const pairsFactorial =
    rules.moves.factorialInvgamma &&
    operand.kind === 'unary' &&
    isFactorialInvgammaPair(operator, operand.operator)
  return layer * 10 + (pairsFactorial ? rules.penalty : 0)
}

/**
 * Points that merging two groups with a binary operator adds to the score.
 * A power with a base of 1 only costs extra while that house rule is on.
 */
export function costOfBinaryOn(
  operator: BinaryOperator,
  left: ExprNode,
  forbidden?: ForbiddenMoveRules
): number {
  const rules = resolvedForbiddenRules(forbidden)
  const forbiddenMove = rules.moves.oneToPower && isOneToPower(operator, left)
  return 10 + (forbiddenMove ? rules.penalty : 0)
}

function getBinaryPrecedence(op: BinaryOperator): number {
  switch (op) {
    // Concatenation is formatted with explicit brackets on binary operands, so
    // its numeric precedence only matters for how arithmetic above it wraps.
    case 'concat':
      return 0
    case 'lshift':
    case 'rshift':
      return 1
    case 'add':
    case 'sub':
      return 2
    case 'mult':
    case 'div':
      return 3
    case 'pow':
    case 'root':
      return 4
  }
}

export function formatExpressionLhs(node: ExprNode): string {
  if (node.kind === 'card') {
    return String(node.card.value)
  }

  if (node.kind === 'unary') {
    const inner = formatExpressionLhs(node.operand)
    const needsParens =
      node.operand.kind === 'binary' ||
      (node.operator === 'fact' && node.operand.kind === 'unary' && node.operand.operator === 'fact') ||
      (node.operator === 'inv' && node.operand.kind !== 'card')
    switch (node.operator) {
      case 'fact':
        return needsParens ? `(${inner})!` : `${inner}!`
      case 'gamma':
        return `Γ(${inner})`
      case 'invgamma':
        return `Γ⁻¹(${inner})`
      case 'sin':
        return `sin(${inner}°)`
      case 'cos':
        return `cos(${inner}°)`
      case 'tan':
        return `tan(${inner}°)`
      case 'inv':
        return needsParens ? `1 / (${inner})` : `1 / ${inner}`
    }
  }

  // Binary
  const leftStr = formatExpressionLhs(node.left)
  const rightStr = formatExpressionLhs(node.right)

  if (node.operator === 'lshift') {
    return `LSHIFT(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'rshift') {
    return `RSHIFT(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'root') {
    const leftWrapped = node.left.kind === 'binary' ? `(${leftStr})` : leftStr
    return `${leftWrapped} ^ (1 / ${node.right.kind === 'binary' ? `(${rightStr})` : rightStr})`
  }

  // `6 + 4 || 2` reads two ways, so any arithmetic operand of a concat is
  // always bracketed: `(6 + 4) || 2`.
  if (node.operator === 'concat') {
    const leftWrapped = node.left.kind === 'binary' ? `(${leftStr})` : leftStr
    const rightWrapped = node.right.kind === 'binary' ? `(${rightStr})` : rightStr
    return `${leftWrapped} || ${rightWrapped}`
  }

  const prec = getBinaryPrecedence(node.operator)
  const wrapLeft =
    node.left.kind === 'binary' &&
    node.left.operator !== 'lshift' &&
    node.left.operator !== 'rshift' &&
    (getBinaryPrecedence(node.left.operator) < prec ||
      (node.operator === 'pow' && getBinaryPrecedence(node.left.operator) <= prec))

  const wrapRight =
    node.right.kind === 'binary' &&
    node.right.operator !== 'lshift' &&
    node.right.operator !== 'rshift' &&
    (getBinaryPrecedence(node.right.operator) < prec ||
      ((node.operator === 'sub' || node.operator === 'div' || node.operator === 'pow') &&
        getBinaryPrecedence(node.right.operator) === prec))

  const lFinal = wrapLeft ? `(${leftStr})` : leftStr
  const rFinal = wrapRight ? `(${rightStr})` : rightStr

  const symbolMap: Record<
    Exclude<BinaryOperator, 'lshift' | 'rshift' | 'root' | 'concat'>,
    string
  > = {
    add: '+',
    sub: '-',
    mult: '*',
    div: '/',
    pow: '^',
  }

  return `${lFinal} ${symbolMap[node.operator]} ${rFinal}`
}

export function formatFullEquation(node: ExprNode): string {
  return `${formatExpressionLhs(node)} = ${formatNumber(node.value)}`
}
