import type { BinaryOperator, UnaryOperator } from './types'

/**
 * Fast double-precision probes used only by the deterministic puzzle search.
 *
 * Puzzle generation tests thousands of throwaway candidate trees. The accepted
 * tree is rebuilt with the Decimal engine before it becomes a puzzle, so this
 * approximation never reaches gameplay, a submission or a displayed value.
 */

export interface ApproxResult {
  ok: boolean
  value: number
}

const fail: ApproxResult = { ok: false, value: Number.NaN }
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
const GAMMA_MIN_X = 1.4616321449683623
const GAMMA_MIN_VALUE = 0.8856031944108887

function nearInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9
}

function gamma(z: number): number | null {
  if (!Number.isFinite(z)) return null
  if (z <= 0 && nearInteger(z)) return null
  const rounded = Math.round(z)
  if (rounded >= 1 && rounded <= 21 && nearInteger(z)) {
    let product = 1
    for (let i = 2; i < rounded; i += 1) product *= i
    return product
  }
  if (z > 171.6) return null
  if (z < 0.5) {
    const sin = Math.sin(Math.PI * z)
    if (Math.abs(sin) < 1e-12) return null
    const reflected = gamma(1 - z)
    if (reflected === null) return null
    return Math.PI / (sin * reflected)
  }

  const shifted = z - 1
  let x = LANCZOS_COEFFS[0]!
  for (let i = 1; i < LANCZOS_COEFFS.length; i += 1) {
    x += LANCZOS_COEFFS[i]! / (shifted + i)
  }
  const t = shifted + LANCZOS_G + 0.5
  const result = Math.sqrt(2 * Math.PI) * Math.pow(t, shifted + 0.5) * Math.exp(-t) * x
  return Number.isFinite(result) ? result : null
}

function factorial(x: number): number | null {
  if (!Number.isFinite(x)) return null
  return gamma(x + 1)
}

function inverseGamma(y: number): number | null {
  if (!Number.isFinite(y) || y <= 0) return null
  if (y < GAMMA_MIN_VALUE - 1e-12) return null
  if (y <= GAMMA_MIN_VALUE + 1e-12) return GAMMA_MIN_X

  let lo = GAMMA_MIN_X
  let hi = GAMMA_MIN_X + 1
  for (let i = 0; i < 64; i += 1) {
    const value = gamma(hi)
    if (value === null || value >= y) break
    lo = hi
    hi = GAMMA_MIN_X + (hi - GAMMA_MIN_X) * 2
  }
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2
    const value = gamma(mid)
    if (value === null || value >= y) hi = mid
    else lo = mid
    if (hi - lo < 1e-10) break
  }
  const root = (lo + hi) / 2
  const nearest = Math.round(root)
  if (Math.abs(root - nearest) < 1e-6) {
    const check = gamma(nearest)
    if (check !== null && Math.abs(check - y) <= Math.abs(y) * 1e-9) return nearest
  }
  return root
}

function whole(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return Math.abs(value - rounded) <= 1e-9 ? rounded : null
}

function safeBigInt(value: bigint): number | null {
  return value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)
    ? null
    : Number(value)
}

function combinations(n: number, k: number): bigint {
  const kk = Math.min(k, n - k)
  let result = 1n
  for (let i = 1; i <= kk; i += 1) {
    result = (result * BigInt(n - kk + i)) / BigInt(i)
  }
  return result
}

function permutations(n: number, k: number): bigint {
  let result = 1n
  for (let i = 0; i < k; i += 1) result *= BigInt(n - i)
  return result
}

function stirlingSecond(n: number, k: number): bigint {
  if (k === 0) return n === 0 ? 1n : 0n
  if (k > n) return 0n
  let row: bigint[] = [1n]
  for (let i = 1; i <= n; i += 1) {
    const size = Math.min(i, k)
    const next: bigint[] = new Array(size + 1).fill(0n)
    for (let j = 1; j <= size; j += 1) {
      next[j] = BigInt(j) * (row[j] ?? 0n) + (row[j - 1] ?? 0n)
    }
    row = next
  }
  return row[k] ?? 0n
}

function ok(value: number): ApproxResult {
  return Number.isFinite(value) ? { ok: true, value } : fail
}

export function approxUnary(op: UnaryOperator, x: number): ApproxResult {
  switch (op) {
    case 'fact': {
      const value = factorial(x)
      return value === null ? fail : ok(value)
    }
    case 'gamma': {
      const value = gamma(x)
      return value === null ? fail : ok(value)
    }
    case 'invgamma': {
      const value = inverseGamma(x)
      return value === null ? fail : ok(value)
    }
    case 'sin': {
      const mod = ((x % 360) + 360) % 360
      if (mod === 0 || mod === 180) return ok(0)
      if (mod === 90) return ok(1)
      if (mod === 270) return ok(-1)
      return ok(Math.sin((x * Math.PI) / 180))
    }
    case 'cos': {
      const mod = ((x % 360) + 360) % 360
      if (mod === 0) return ok(1)
      if (mod === 180) return ok(-1)
      if (mod === 90 || mod === 270) return ok(0)
      return ok(Math.cos((x * Math.PI) / 180))
    }
    case 'tan': {
      const mod = ((x % 180) + 180) % 180
      if (Math.abs(mod - 90) < 1e-9) return fail
      if (mod === 0) return ok(0)
      return ok(Math.tan((x * Math.PI) / 180))
    }
    case 'inv':
      return Math.abs(x) < 1e-12 ? fail : ok(1 / x)
    case 'bitnot': {
      if (!Number.isSafeInteger(x)) return fail
      const value = Number(~BigInt(x))
      return Number.isSafeInteger(value) ? ok(value) : fail
    }
    case 'exp':
      return ok(Math.exp(x))
    case 'ln':
      return x > 0 ? ok(Math.log(x)) : fail
    case 'dfact': {
      const n = whole(x)
      if (n === null || n < 0 || n > 170) return fail
      let value = 1
      for (let i = n; i > 1; i -= 2) value *= i
      return Number.isFinite(value) ? ok(value) : fail
    }
    case 'subfact': {
      const n = whole(x)
      if (n === null || n < 0 || n > 170) return fail
      let value = 1
      for (let i = 1; i <= n; i += 1) value = i * value + (i % 2 === 0 ? 1 : -1)
      return Number.isFinite(value) ? ok(value) : fail
    }
  }
}

export function approxBinary(op: BinaryOperator, a: number, b: number): ApproxResult {
  switch (op) {
    case 'add':
      return ok(a + b)
    case 'sub':
      return ok(a - b)
    case 'mult':
      return ok(a * b)
    case 'div':
      return b === 0 ? fail : ok(a / b)
    case 'pow': {
      if (a === 0 && b < 0) return fail
      return ok(Math.pow(a, b))
    }
    case 'root': {
      if (b === 0) return fail
      if (a < 0) {
        const wholeB = whole(b)
        if (wholeB === null || Math.abs(wholeB % 2) === 0) return fail
        return ok(-Math.pow(-a, 1 / wholeB))
      }
      return ok(Math.pow(a, 1 / b))
    }
    case 'lshift': {
      const left = whole(a)
      const right = whole(b)
      if (left === null || right === null || right < 0 || right > 52) return fail
      return ok(left * Math.pow(2, right))
    }
    case 'bitand':
    case 'bitor':
    case 'bitxor': {
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return fail
      const left = BigInt(a)
      const right = BigInt(b)
      const value =
        op === 'bitand' ? left & right : op === 'bitor' ? left | right : left ^ right
      return Number.isSafeInteger(Number(value)) ? ok(Number(value)) : fail
    }
    case 'log': {
      if (a <= 0 || Math.abs(a - 1) < 1e-12 || b <= 0) return fail
      return ok(Math.log(b) / Math.log(a))
    }
    case 'comb':
    case 'perm':
    case 'stirling2': {
      const n = whole(a)
      const k = whole(b)
      if (n === null || k === null || n < 0 || k < 0) return fail
      if (op !== 'stirling2' && k > n) return fail
      if (op === 'stirling2' && k > n) return ok(0)
      if (n > (op === 'stirling2' ? 200 : 1000)) return fail
      const raw =
        op === 'comb'
          ? combinations(n, k)
          : op === 'perm'
            ? permutations(n, k)
            : stirlingSecond(n, k)
      const value = safeBigInt(raw)
      return value === null ? fail : ok(value)
    }
    case 'concat': {
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0) {
        return fail
      }
      const value = Number(`${a}${b}`)
      return Number.isSafeInteger(value) ? ok(value) : fail
    }
  }
}
