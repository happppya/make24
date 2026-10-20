import type { Decimal } from 'decimal.js'
import {
  DEFAULT_DECIMAL_PLACES,
  D,
  GAMMA_MIN_VALUE_EXACT,
  GAMMA_MIN_X_EXACT,
  decimalCosDegrees,
  decimalFactorial,
  decimalGamma,
  decimalInverseGamma,
  decimalIsFinite,
  decimalIsSafeInteger,
  decimalSinDegrees,
  decimalTanDegrees,
  decimalToNumber,
  formatNumber as formatDecimalNumber,
  normalizeDecimal,
  targetEpsilon,
  toDecimal,
  wholeDecimal,
  type NumericInput,
} from './decimal'
import type {
  AllowedOperatorsConfig,
  BinaryOperator,
  ExprNode,
  ForbiddenMovesConfig,
  OperatorCategory,
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
  // Binary computing
  {
    id: 'lshift',
    arity: 'binary',
    category: 'computing',
    label: 'LSHIFT',
    shortSymbol: '<<',
    description: 'LSHIFT(a, b)',
    hotkey: '<',
  },
  {
    id: 'bitand',
    arity: 'binary',
    category: 'computing',
    label: 'AND',
    shortSymbol: '&',
    description: 'AND(a, b) — bitwise and',
    hotkey: '&',
  },
  {
    id: 'bitor',
    arity: 'binary',
    category: 'computing',
    label: 'OR',
    shortSymbol: '|',
    description: 'OR(a, b) — bitwise or',
    hotkey: 'o',
  },
  {
    id: 'bitxor',
    arity: 'binary',
    category: 'computing',
    label: 'XOR',
    shortSymbol: '⊕',
    description: 'XOR(a, b) — bitwise exclusive or',
    hotkey: 'x',
  },
  {
    id: 'bitnot',
    arity: 'unary',
    category: 'computing',
    label: 'NOT',
    shortSymbol: '~',
    description: 'NOT(a) — bitwise complement',
    hotkey: 'n',
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
  // Analysis
  {
    id: 'exp',
    arity: 'unary',
    category: 'analysis',
    label: 'Exp',
    shortSymbol: 'eˣ',
    description: 'e^x',
    hotkey: 'e',
  },
  {
    id: 'ln',
    arity: 'unary',
    category: 'analysis',
    label: 'Natural log',
    shortSymbol: 'ln',
    description: 'ln(x), the natural logarithm',
    hotkey: 'l',
  },
  {
    id: 'log',
    arity: 'binary',
    category: 'analysis',
    label: 'Logarithm',
    shortSymbol: 'logₐ',
    description: 'log(a, b) — log base a of b',
    hotkey: 'L',
  },
  // Combinatorics
  {
    id: 'comb',
    arity: 'binary',
    category: 'combinatorics',
    label: 'Combinations',
    shortSymbol: 'C(n,k)',
    description: 'COMB(n, k) — n choose k',
    hotkey: 'C',
  },
  {
    id: 'perm',
    arity: 'binary',
    category: 'combinatorics',
    label: 'Permutations',
    shortSymbol: 'P(n,k)',
    description: 'PERM(n, k) — ordered selections of k from n',
    hotkey: 'P',
  },
  {
    id: 'stirling2',
    arity: 'binary',
    category: 'combinatorics',
    label: 'Stirling 2nd',
    shortSymbol: 'S(n,k)',
    description: 'STR2(n, k) — ways to split n items into k groups',
    hotkey: 'S',
  },
  {
    id: 'dfact',
    arity: 'unary',
    category: 'combinatorics',
    label: 'Double factorial',
    shortSymbol: 'n!!',
    description: 'n!! = n × (n−2) × …',
    hotkey: 'D',
  },
  {
    id: 'subfact',
    arity: 'unary',
    category: 'combinatorics',
    label: 'Subfactorial',
    shortSymbol: '!n',
    description: '!n — derangements of n items',
    hotkey: 'F',
  },
]

export interface OperatorGroupMeta {
  id: OperatorCategory
  label: string
  /** Short list of what the group contains, shown in the lobby. */
  hint: string
}

export interface OperatorGroup extends OperatorGroupMeta {
  operators: OperatorMeta[]
}

const OPERATOR_GROUP_META: OperatorGroupMeta[] = [
  { id: 'basic', label: 'Basic', hint: '+ − × ÷' },
  { id: 'powers', label: 'Powers & roots', hint: 'xʸ, ʸ√x' },
  { id: 'factorial', label: 'Factorials & gamma', hint: 'x!, Γ(x), Γ⁻¹(x)' },
  { id: 'trig', label: 'Basic trig', hint: 'sin°, cos°, tan°' },
  { id: 'inverse', label: 'Inverse', hint: '1/x' },
  { id: 'computing', label: 'Binary computing', hint: 'LSHIFT, AND, OR, XOR, NOT' },
  { id: 'concat', label: 'Concatenate', hint: 'digit joining with ||' },
  { id: 'analysis', label: 'Analysis', hint: 'eˣ, ln x, log base a' },
  {
    id: 'combinatorics',
    label: 'Combinatorics',
    hint: 'C(n,k), P(n,k), S(n,k), n!!, !n',
  },
]

export const OPERATOR_GROUPS: OperatorGroup[] = OPERATOR_GROUP_META.map((group) => ({
  ...group,
  operators: OPERATOR_CATALOG.filter((op) => op.category === group.id),
}))

/** A group is on by default; an explicit per-operator switch overrides it. */
export function isOperatorEnabled(
  allowed: AllowedOperatorsConfig,
  op: OperatorMeta
): boolean {
  const override = allowed.operators?.[op.id]
  return typeof override === 'boolean' ? override : Boolean(allowed[op.category])
}

export function getEnabledOperators(allowed: AllowedOperatorsConfig): OperatorMeta[] {
  return OPERATOR_CATALOG.filter((op) => isOperatorEnabled(allowed, op))
}

export function hasEnabledOperators(allowed: AllowedOperatorsConfig): boolean {
  return OPERATOR_CATALOG.some((op) => isOperatorEnabled(allowed, op))
}

export function isUnaryOperator(op: OperatorId): op is UnaryOperator {
  return (
    op === 'fact' ||
    op === 'gamma' ||
    op === 'invgamma' ||
    op === 'sin' ||
    op === 'cos' ||
    op === 'tan' ||
    op === 'inv' ||
    op === 'bitnot' ||
    op === 'exp' ||
    op === 'ln' ||
    op === 'dfact' ||
    op === 'subfact'
  )
}

const EPSILON = 1e-11
/** Doubles carry ~16 significant decimal digits; keep all of them when snapping noise. */
const SNAPPED_SIGNIFICANT_DIGITS = 16

/**
 * Compatibility helper for the old double-based API. Engine evaluation no
 * longer calls this, so it only cleans caller-supplied numbers.
 */
export function cleanFloat(n: number): number {
  if (!Number.isFinite(n)) return n
  const rounded = Math.round(n)
  if (Math.abs(n - rounded) < EPSILON) {
    return Object.is(rounded, -0) ? 0 : rounded
  }
  const snapped = Number(n.toPrecision(SNAPPED_SIGNIFICANT_DIGITS))
  if (Number.isFinite(snapped) && Math.abs(n - snapped) < EPSILON) {
    return Object.is(snapped, -0) ? 0 : snapped
  }
  return Object.is(n, -0) ? 0 : n
}

/** Display formatting; defaults to five decimal places from the Decimal engine. */
export function formatNumber(value: NumericInput, decimalPlaces = DEFAULT_DECIMAL_PLACES): string {
  return formatDecimalNumber(value, decimalPlaces)
}

/** Canonical exact value of a node, tolerating older trees without `exactValue`. */
export function nodeExactValue(node: ExprNode): string {
  if (typeof node.exactValue === 'string') return node.exactValue
  return Number.isFinite(node.value) ? String(node.value) : 'NaN'
}

export function formatNodeValue(
  node: ExprNode,
  decimalPlaces = DEFAULT_DECIMAL_PLACES
): string {
  return formatNumber(nodeExactValue(node), decimalPlaces)
}

/** Gamma and factorial keep the historical number API, computed at 50 digits. */
export function realGamma(z: number): number | null {
  const result = decimalGamma(z)
  return result ? decimalToNumber(result) : null
}

export function realFactorial(x: number): number | null {
  if (!Number.isFinite(x)) return null
  const result = decimalFactorial(x)
  return result ? decimalToNumber(result) : null
}

/** Where Γ bottoms out on the positive axis: Γ(1.46163214…) ≈ 0.88560319. */
export const GAMMA_MIN_X = decimalToNumber(GAMMA_MIN_X_EXACT)
export const GAMMA_MIN_VALUE = decimalToNumber(GAMMA_MIN_VALUE_EXACT)

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
  const result = decimalInverseGamma(y)
  return result ? decimalToNumber(result) : null
}

const MAX_COMBINATORICS_INPUT = 1_000
const MAX_STIRLING_INPUT = 200

/** A whole number close enough to its rounded value, for combinatorial inputs. */
function wholeNumber(value: NumericInput): number | null {
  const rounded = wholeDecimal(value)
  if (!rounded || !decimalIsSafeInteger(rounded)) return null
  return rounded.toNumber()
}

function safeBigInt(value: bigint): number | null {
  return value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)
    ? null
    : Number(value)
}

function combinationsBigInt(n: number, k: number): bigint {
  const kk = Math.min(k, n - k)
  let result = 1n
  for (let i = 1; i <= kk; i++) {
    result = (result * BigInt(n - kk + i)) / BigInt(i)
  }
  return result
}

function permutationsBigInt(n: number, k: number): bigint {
  let result = 1n
  for (let i = 0; i < k; i++) result *= BigInt(n - i)
  return result
}

function stirlingSecondBigInt(n: number, k: number): bigint {
  if (k === 0) return n === 0 ? 1n : 0n
  if (k > n) return 0n
  let row: bigint[] = [1n]
  for (let i = 1; i <= n; i++) {
    const size = Math.min(i, k)
    const next: bigint[] = new Array(size + 1).fill(0n)
    for (let j = 1; j <= size; j++) {
      next[j] = BigInt(j) * (row[j] ?? 0n) + (row[j - 1] ?? 0n)
    }
    row = next
  }
  return row[k] ?? 0n
}

export interface EvalResult {
  ok: boolean
  /** Double mirror for older consumers; `exactValue` is authoritative. */
  value: number
  exactValue: string
  headerText: string
  error?: string
}

function evalFailure(error: string): EvalResult {
  return { ok: false, value: NaN, exactValue: 'NaN', headerText: '', error }
}

function evalSuccess(value: NumericInput, headerText: string): EvalResult {
  const exact = normalizeDecimal(toDecimal(value))
  const mirror = decimalToNumber(exact)
  // The exact string stays authoritative, but a value outside the double range
  // cannot be shown or compared consistently by older consumers.
  if (!Number.isFinite(mirror)) return evalFailure('That result is too large to use as a number.')
  return {
    ok: true,
    value: mirror,
    exactValue: exact.toString(),
    headerText,
  }
}

/** Rebuilds an operator header at any display width from the exact operands. */
export function formatUnaryHeader(
  op: UnaryOperator,
  x: NumericInput,
  value: NumericInput,
  decimalPlaces = DEFAULT_DECIMAL_PLACES
): string {
  const xStr = formatNumber(x, decimalPlaces)
  const val = formatNumber(value, decimalPlaces)
  switch (op) {
    case 'fact':
      return `${xStr}! = ${val}`
    case 'gamma':
      return `Γ(${xStr}) = ${val}`
    case 'invgamma':
      return `Γ⁻¹(${xStr}) = ${val}`
    case 'sin':
      return `sin(${xStr} deg) = ${val}`
    case 'cos':
      return `cos(${xStr} deg) = ${val}`
    case 'tan':
      return `tan(${xStr} deg) = ${val}`
    case 'inv':
      return `1 / ${xStr} = ${val}`
    case 'bitnot':
      return `NOT(${xStr}) = ${val}`
    case 'exp':
      return `e^(${xStr}) = ${val}`
    case 'ln':
      return `ln(${xStr}) = ${val}`
    case 'dfact':
      return `${xStr}!! = ${val}`
    case 'subfact':
      return `!${xStr} = ${val}`
  }
}

/** Rebuilds a binary node's header at any display width. */
export function formatBinaryHeader(
  op: BinaryOperator,
  a: NumericInput,
  b: NumericInput,
  value: NumericInput,
  decimalPlaces = DEFAULT_DECIMAL_PLACES
): string {
  const aStr = formatNumber(a, decimalPlaces)
  const bStr = formatNumber(b, decimalPlaces)
  const val = formatNumber(value, decimalPlaces)
  switch (op) {
    case 'add':
      return `${aStr} + ${bStr} = ${val}`
    case 'sub':
      return `${aStr} - ${bStr} = ${val}`
    case 'mult':
      return `${aStr} × ${bStr} = ${val}`
    case 'div':
      return `${aStr} ÷ ${bStr} = ${val}`
    case 'pow':
      return `${aStr} ^ ${bStr} = ${val}`
    case 'root':
      return `${aStr} root ${bStr} = ${val}`
    case 'lshift':
      return `LSHIFT(${aStr}, ${bStr}) = ${val}`
    case 'bitand':
      return `AND(${aStr}, ${bStr}) = ${val}`
    case 'bitor':
      return `OR(${aStr}, ${bStr}) = ${val}`
    case 'bitxor':
      return `XOR(${aStr}, ${bStr}) = ${val}`
    case 'log':
      return `log(${aStr}, ${bStr}) = ${val}`
    case 'comb':
      return `COMB(${aStr}, ${bStr}) = ${val}`
    case 'perm':
      return `PERM(${aStr}, ${bStr}) = ${val}`
    case 'stirling2':
      return `STR2(${aStr}, ${bStr}) = ${val}`
    case 'concat':
      return `${aStr} || ${bStr} = ${val}`
  }
}

/** Header text for any board node, recalculated for the current display width. */
export function formatNodeHeader(
  node: ExprNode,
  decimalPlaces = DEFAULT_DECIMAL_PLACES
): string {
  if (node.kind === 'card') return String(node.card.value)
  if (node.kind === 'bind') {
    return `${node.cards.map((card) => card.card.value).join(' × ')} = ${formatNumber(
      nodeExactValue(node),
      decimalPlaces
    )}`
  }
  if (node.kind === 'unary') {
    return formatUnaryHeader(
      node.operator,
      nodeExactValue(node.operand),
      nodeExactValue(node),
      decimalPlaces
    )
  }
  return formatBinaryHeader(
    node.operator,
    nodeExactValue(node.left),
    nodeExactValue(node.right),
    nodeExactValue(node),
    decimalPlaces
  )
}

export function applyUnaryOperator(
  op: UnaryOperator,
  x: NumericInput
): EvalResult {
  const xd = toDecimal(x)
  const xStr = formatNumber(xd)
  switch (op) {
    case 'fact': {
      const val = decimalFactorial(xd)
      if (val === null) return evalFailure(`Factorial of ${xStr} is undefined or overflows.`)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'gamma': {
      const val = decimalGamma(xd)
      if (val === null) return evalFailure(`Γ(${xStr}) is undefined or overflows.`)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'invgamma': {
      const val = decimalInverseGamma(xd)
      if (val === null) return evalFailure(`Γ⁻¹(${xStr}) is undefined.`)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'sin': {
      const val = decimalSinDegrees(xd)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'cos': {
      const val = decimalCosDegrees(xd)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'tan': {
      const val = decimalTanDegrees(xd)
      if (val === null || !decimalIsFinite(val)) {
        return evalFailure(`tan(${xStr} deg) is undefined.`)
      }
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'inv': {
      if (xd.isZero()) return evalFailure('Cannot take the inverse of 0.')
      const val = D(1).div(xd)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'bitnot': {
      const whole = wholeDecimal(xd)
      if (!whole || !decimalIsSafeInteger(whole)) return evalFailure('NOT needs a whole number.')
      const raw = Number(~BigInt(whole.toFixed(0)))
      if (!Number.isSafeInteger(raw)) return evalFailure(`NOT(${xStr}) is too large.`)
      return evalSuccess(raw, formatUnaryHeader(op, xd, raw))
    }
    case 'exp': {
      const val = xd.exp()
      if (!decimalIsFinite(val)) return evalFailure(`e^(${xStr}) is undefined or overflows.`)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'ln': {
      if (!xd.gt(0)) {
        return evalFailure(`ln(${xStr}) is undefined for values at or below 0.`)
      }
      const val = xd.ln()
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'dfact': {
      const n = wholeDecimal(xd)
      if (!n || n.isNeg()) {
        return evalFailure('Double factorial needs a whole number, zero or higher.')
      }
      if (n.gt(300)) return evalFailure(`${xStr}!! is too large to use as a number.`)
      let val = D(1)
      for (let i = n.toNumber(); i > 1; i -= 2) val = val.mul(i)
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
    case 'subfact': {
      const n = wholeDecimal(xd)
      if (!n || n.isNeg()) {
        return evalFailure('Subfactorial needs a whole number, zero or higher.')
      }
      if (n.gt(170)) return evalFailure(`!${xStr} is too large to use as a number.`)
      let val = D(1)
      for (let i = 1; i <= n.toNumber(); i += 1) {
        val = val.mul(i).add(i % 2 === 0 ? 1 : -1)
      }
      return evalSuccess(val, formatUnaryHeader(op, xd, val))
    }
  }
}

/**
 * Bitwise AND/OR/XOR over exact whole numbers. BigInt keeps the two's-complement
 * semantics without silently truncating values that LSHIFT can push past 32 bits.
 */
function applyBitwiseBinary(
  op: 'bitand' | 'bitor' | 'bitxor',
  a: NumericInput,
  b: NumericInput
): EvalResult {
  const ad = toDecimal(a)
  const bd = toDecimal(b)
  const aWhole = wholeDecimal(ad)
  const bWhole = wholeDecimal(bd)
  if (!aWhole || !bWhole || !decimalIsSafeInteger(aWhole) || !decimalIsSafeInteger(bWhole)) {
    return evalFailure('Bitwise operators need whole numbers.')
  }
  const left = BigInt(aWhole.toFixed(0))
  const right = BigInt(bWhole.toFixed(0))
  const raw = op === 'bitand' ? left & right : op === 'bitor' ? left | right : left ^ right
  const result = Number(raw)
  if (!Number.isSafeInteger(result)) return evalFailure('That bitwise result is too large.')
  return evalSuccess(result, formatBinaryHeader(op, ad, bd, result))
}

export function applyBinaryOperator(
  op: BinaryOperator,
  a: NumericInput,
  b: NumericInput
): EvalResult {
  const ad = toDecimal(a)
  const bd = toDecimal(b)
  const aStr = formatNumber(ad)
  const bStr = formatNumber(bd)
  switch (op) {
    case 'add': {
      const val = ad.add(bd)
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'sub': {
      const val = ad.sub(bd)
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'mult': {
      const val = ad.mul(bd)
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'div': {
      if (bd.isZero()) return evalFailure('Cannot divide by 0.')
      const val = ad.div(bd)
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'pow': {
      if (ad.isZero() && bd.isNeg()) {
        return evalFailure('0 cannot be raised to a negative power.')
      }
      let val: Decimal
      try {
        val = ad.pow(bd)
      } catch {
        return evalFailure(`${aStr} ^ ${bStr} is undefined or overflows.`)
      }
      if (!decimalIsFinite(val)) {
        return evalFailure(`${aStr} ^ ${bStr} is undefined or overflows.`)
      }
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'root': {
      if (bd.isZero()) return evalFailure('Cannot take the 0th root.')
      let val: Decimal
      try {
        if (ad.isNeg()) {
          const bWhole = wholeDecimal(bd)
          if (!bWhole || !bWhole.isInteger() || bWhole.mod(2).abs().eq(0)) {
            return evalFailure(
              `Real ${bStr}-th root of negative number ${aStr} is undefined.`
            )
          }
          val = ad.abs().pow(new D(1).div(bWhole)).neg()
        } else {
          val = ad.pow(new D(1).div(bd))
        }
      } catch {
        return evalFailure(`${aStr} root ${bStr} is undefined or overflows.`)
      }
      if (!decimalIsFinite(val)) {
        return evalFailure(`${aStr} root ${bStr} is undefined or overflows.`)
      }
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'lshift': {
      const aWhole = wholeDecimal(ad)
      const bWhole = wholeDecimal(bd)
      if (!aWhole || !bWhole) return evalFailure('Bit shifting requires integer values.')
      const shift = bWhole.toNumber()
      if (shift < 0 || shift > 52) {
        return evalFailure('Shift amount must be between 0 and 52.')
      }
      const val = aWhole.mul(new D(2).pow(shift))
      return evalSuccess(
        val,
        formatBinaryHeader(op, aWhole, shift, val)
      )
    }
    case 'bitand':
    case 'bitor':
    case 'bitxor':
      return applyBitwiseBinary(op, ad, bd)
    case 'log': {
      if (ad.lte(0) || ad.eq(1) || bd.lte(0)) {
        return evalFailure('Log needs a positive base other than 1, and a positive argument.')
      }
      const val = bd.ln().div(ad.ln())
      if (!decimalIsFinite(val)) {
        return evalFailure('That logarithm is undefined or overflows.')
      }
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'comb':
    case 'perm':
    case 'stirling2': {
      const n = wholeNumber(ad)
      const k = wholeNumber(bd)
      const name = op === 'comb' ? 'COMB' : op === 'perm' ? 'PERM' : 'STR2'
      if (n === null || k === null || n < 0 || k < 0) {
        return evalFailure(`${name} needs two whole numbers, zero or higher.`)
      }
      if (op !== 'stirling2' && k > n) {
        return evalFailure(`${name} needs k between 0 and n.`)
      }
      if (op === 'stirling2' && k > n) {
        return evalSuccess(0, formatBinaryHeader(op, ad, bd, 0))
      }
      if (n > (op === 'stirling2' ? MAX_STIRLING_INPUT : MAX_COMBINATORICS_INPUT)) {
        return evalFailure(`${name} input is too large to compute exactly.`)
      }
      const raw =
        op === 'comb'
          ? combinationsBigInt(n, k)
          : op === 'perm'
            ? permutationsBigInt(n, k)
            : stirlingSecondBigInt(n, k)
      const val = safeBigInt(raw)
      if (val === null) {
        return evalFailure(`${name}(${aStr}, ${bStr}) is too large to use as a number.`)
      }
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
    }
    case 'concat': {
      // Only exact, non-negative integers have an unambiguous digit string;
      // numbers above 2^53 would round, and `String()` would switch to exponent
      // notation, so both sides and the result stay inside the safe range.
      const aWhole = wholeDecimal(ad)
      const bWhole = wholeDecimal(bd)
      if (
        !aWhole ||
        !bWhole ||
        !decimalIsSafeInteger(aWhole) ||
        !decimalIsSafeInteger(bWhole) ||
        aWhole.isNeg() ||
        bWhole.isNeg()
      ) {
        return evalFailure('Concat needs two whole numbers, zero or higher.')
      }
      const digits = `${aWhole.toFixed(0)}${bWhole.toFixed(0)}`
      const val = Number(digits)
      if (!Number.isSafeInteger(val)) {
        return evalFailure('That concatenation is too long to use as a number.')
      }
      return evalSuccess(val, formatBinaryHeader(op, ad, bd, val))
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
  value: NumericInput,
  target: NumericInput,
  approximationPercent: number
): TargetCheckResult {
  const val = toDecimal(value)
  const targetValue = toDecimal(target)
  const targetNumber = decimalToNumber(targetValue)
  if (!decimalIsFinite(val) || !decimalIsFinite(targetValue)) {
    return {
      acceptable: false,
      minAcceptable: targetNumber,
      maxAcceptable: targetNumber,
      errorPercent: Infinity,
    }
  }

  const diff = val.minus(targetValue).abs()
  const percent = (difference: Decimal): number =>
    difference.div(targetValue.abs()).mul(100).toNumber()

  // Target of 0 just has 0 tolerable error. The tolerance is far below display
  // precision, so a board only reads as exact when the engine really says so.
  if (targetValue.isZero() || approximationPercent <= 0) {
    const acceptable = diff.lte(targetEpsilon)
    const errorPercent = targetValue.isZero()
      ? acceptable
        ? 0
        : 100
      : percent(diff)
    return {
      acceptable,
      minAcceptable: targetNumber,
      maxAcceptable: targetNumber,
      errorPercent,
    }
  }

  const band = targetValue.abs().mul(approximationPercent).div(100)
  const minimum = targetValue.minus(band)
  const maximum = targetValue.add(band)
  const acceptable = val.gte(minimum) && val.lte(maximum)

  return {
    acceptable,
    minAcceptable: decimalToNumber(minimum),
    maxAcceptable: decimalToNumber(maximum),
    errorPercent: percent(diff),
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
  if (operator !== 'pow') return false
  // Decimal division keeps guard digits, so (1 / 3) * 3 lands one ulp below 1.
  // Use the same exactness tolerance as target acceptance so the house rule
  // still recognises a base the player legitimately made equal to 1.
  return toDecimal(nodeExactValue(base)).minus(1).abs().lte(targetEpsilon)
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
    // A bind is a free opening group: its product costs no operator points.
    if (curr.kind === 'bind') {
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
    case 'bitand':
    case 'bitor':
    case 'bitxor':
    case 'log':
    case 'comb':
    case 'perm':
    case 'stirling2':
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

  if (node.kind === 'bind') {
    return node.cards.map((card) => String(card.card.value)).join(' × ')
  }

  if (node.kind === 'unary') {
    const inner = formatExpressionLhs(node.operand)
    const needsParens = node.operand.kind !== 'card'
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
      case 'bitnot':
        return `NOT(${inner})`
      case 'exp':
        return `e^(${inner})`
      case 'ln':
        return `ln(${inner})`
      case 'dfact':
        return node.operand.kind === 'card' ? `${inner}!!` : `(${inner})!!`
      case 'subfact':
        return node.operand.kind === 'card' ? `!${inner}` : `!(${inner})`
    }
  }

  // Binary
  const leftStr = formatExpressionLhs(node.left)
  const rightStr = formatExpressionLhs(node.right)
  const groupLike = (child: ExprNode): boolean => child.kind === 'binary' || child.kind === 'bind'
  const precedenceOf = (child: ExprNode): number | null =>
    child.kind === 'binary' ? getBinaryPrecedence(child.operator) : child.kind === 'bind' ? 3 : null

  if (node.operator === 'lshift') {
    return `LSHIFT(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'bitand') {
    return `AND(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'bitor') {
    return `OR(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'bitxor') {
    return `XOR(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'log') {
    return `log(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'comb') {
    return `COMB(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'perm') {
    return `PERM(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'stirling2') {
    return `STR2(${leftStr}, ${rightStr})`
  }
  if (node.operator === 'root') {
    const leftWrapped = groupLike(node.left) ? `(${leftStr})` : leftStr
    return `${leftWrapped} ^ (1 / ${groupLike(node.right) ? `(${rightStr})` : rightStr})`
  }

  // `6 + 4 || 2` reads two ways, so any arithmetic operand of a concat is
  // always bracketed: `(6 + 4) || 2`.
  if (node.operator === 'concat') {
    const leftWrapped = groupLike(node.left) ? `(${leftStr})` : leftStr
    const rightWrapped = groupLike(node.right) ? `(${rightStr})` : rightStr
    return `${leftWrapped} || ${rightWrapped}`
  }

  const prec = getBinaryPrecedence(node.operator)
  const wordStyle = (op: BinaryOperator): boolean =>
    op === 'lshift' ||
    op === 'bitand' ||
    op === 'bitor' ||
    op === 'bitxor' ||
    op === 'log' ||
    op === 'comb' ||
    op === 'perm' ||
    op === 'stirling2'

  const leftPrec = precedenceOf(node.left)
  const rightPrec = precedenceOf(node.right)
  const leftWord =
    node.left.kind === 'binary' ? wordStyle(node.left.operator) : false
  const rightWord =
    node.right.kind === 'binary' ? wordStyle(node.right.operator) : false

  const wrapLeft =
    leftPrec !== null &&
    !leftWord &&
    (leftPrec < prec || (node.operator === 'pow' && leftPrec <= prec))

  const wrapRight =
    rightPrec !== null &&
    !rightWord &&
    (rightPrec < prec ||
      ((node.operator === 'sub' || node.operator === 'div' || node.operator === 'pow') &&
        rightPrec === prec))

  const lFinal = wrapLeft ? `(${leftStr})` : leftStr
  const rFinal = wrapRight ? `(${rightStr})` : rightStr

  const symbolMap: Record<
    Exclude<
      BinaryOperator,
      | 'lshift'
      | 'bitand'
      | 'bitor'
      | 'bitxor'
      | 'root'
      | 'concat'
      | 'log'
      | 'comb'
      | 'perm'
      | 'stirling2'
    >,
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

export function formatFullEquation(
  node: ExprNode,
  decimalPlaces = DEFAULT_DECIMAL_PLACES
): string {
  return `${formatExpressionLhs(node)} = ${formatNumber(nodeExactValue(node), decimalPlaces)}`
}
