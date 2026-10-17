import type {
  AllowedOperatorsConfig,
  BinaryOperator,
  ExprNode,
  OperatorId,
  OperatorMeta,
  UnaryOperator,
} from './types'

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

export function cleanFloat(n: number): number {
  if (!Number.isFinite(n)) return n
  const rounded = Math.round(n)
  if (Math.abs(n - rounded) < EPSILON) {
    return Object.is(rounded, -0) ? 0 : rounded
  }
  // Also snap clean decimal fractions like 0.5, 0.25, etc.
  const scaled = Math.round(n * 1e9) / 1e9
  if (Math.abs(n - scaled) < EPSILON) {
    return Object.is(scaled, -0) ? 0 : scaled
  }
  return Object.is(n, -0) ? 0 : n
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Undefined'
  const clean = cleanFloat(n)
  if (Number.isInteger(clean)) {
    return String(clean)
  }
  const abs = Math.abs(clean)
  if (abs >= 1e7 || (abs > 0 && abs < 1e-4)) {
    return clean.toExponential(3)
  }
  return Number(clean.toFixed(4)).toString()
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

/**
 * Itemised cost of an expression tree. The rules:
 * - Lower score is better.
 * - 10 score is added for each binary operator used.
 * - The unary penalty increases per layer: the first unary operator is 10,
 *   then the second is 20, then the third is 30, and so on with 40, 50, 60...
 *   So, using o(o(x)) incurs 30 points while o(o(o(x))) incurs 60 points.
 * - Nested unary operators on the same group count as a consecutive unary,
 *   and a binary operation resets the chain.
 * - Factorial and inverse gamma nested together incur 200 points each time when
 *   nested: e.g. factorial(Γ⁻¹(x)) or Γ⁻¹(factorial(x)). Factorial and plain
 *   gamma together carry no extra penalty.
 */
export interface ScoreBreakdown {
  /** Total cost, identical to `calculateScore`. */
  total: number
  /** Number of binary operators in the tree and the 10 each one costs. */
  binaryOperators: number
  binaryCost: number
  /** Number of unary operators and the summed per-layer cost (10, 20, 30…). */
  unaryOperators: number
  unaryCost: number
  /** Nested factorial + inverse-gamma pairs and the 200 each pair costs. */
  nestingCount: number
  nestingCost: number
}

/**
 * Walks the tree once, tallying each cost source so the UI can show where the
 * bill came from instead of a single lump sum. `total` matches `calculateScore`.
 */
export function calculateScoreBreakdown(node: ExprNode): ScoreBreakdown {
  let binaryOperators = 0
  let unaryOperators = 0
  let unaryCost = 0
  let nestingCount = 0

  function walk(curr: ExprNode, unaryDepthAbove: number): void {
    if (curr.kind === 'card') {
      return
    }
    if (curr.kind === 'binary') {
      binaryOperators++
      walk(curr.left, 0)
      walk(curr.right, 0)
      return
    }
    unaryOperators++
    const currentLayer = unaryDepthAbove + 1
    unaryCost += currentLayer * 10

    if (curr.operand.kind === 'unary') {
      const outerOp = curr.operator
      const innerOp = curr.operand.operator
      if (
        (outerOp === 'fact' && innerOp === 'invgamma') ||
        (outerOp === 'invgamma' && innerOp === 'fact')
      ) {
        nestingCount++
      }
    }

    walk(curr.operand, currentLayer)
  }

  walk(node, 0)

  return {
    total: binaryOperators * 10 + unaryCost + nestingCount * 200,
    binaryOperators,
    binaryCost: binaryOperators * 10,
    unaryOperators,
    unaryCost,
    nestingCount,
    nestingCost: nestingCount * 200,
  }
}

/** Score of an expression tree; see `calculateScoreBreakdown` for the itemisation. */
export function calculateScore(node: ExprNode): number {
  return calculateScoreBreakdown(node).total
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
 * layer, so a second stacked unary costs 20, not the 10 a fresh one does. The
 * factorial/inverse-gamma pairing carries its 200-point penalty too.
 */
export function costOfUnaryOn(operator: UnaryOperator, operand: ExprNode): number {
  const layer = unaryChainDepth(operand) + 1
  const pairsFactorial =
    operand.kind === 'unary' &&
    ((operator === 'fact' && operand.operator === 'invgamma') ||
      (operator === 'invgamma' && operand.operator === 'fact'))
  return layer * 10 + (pairsFactorial ? 200 : 0)
}

function getBinaryPrecedence(op: BinaryOperator): number {
  switch (op) {
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

  const symbolMap: Record<Exclude<BinaryOperator, 'lshift' | 'rshift' | 'root'>, string> = {
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
