import { describe, expect, it } from 'vitest'
import {
  decimalGamma,
  decimalInverseGamma,
  formatNumber,
  toDecimal,
} from './decimal'
import { constantById } from './constants'
import {
  applyBinaryOperator,
  applyUnaryOperator,
  calculateScoreBreakdown,
  checkTargetAcceptance,
} from './math'
import type { BinaryGroupNode, Card } from './types'

describe('high-precision Decimal engine', () => {
  it('carries division and roots far beyond double precision', () => {
    const third = applyBinaryOperator('div', 1, 3)
    expect(third.ok).toBe(true)
    expect(formatNumber(third.exactValue, 32)).toBe(
      '0.33333333333333333333333333333333'
    )

    const roundTrip = applyBinaryOperator('mult', third.exactValue, 3)
    expect(formatNumber(roundTrip.exactValue, 32)).toBe('1')

    const sqrt2 = applyBinaryOperator('root', 2, 2)
    expect(formatNumber(sqrt2.exactValue, 32)).toBe(
      '1.4142135623730950488016887242097'
    )
    const cubeRoot5 = applyBinaryOperator('root', 5, 3)
    expect(formatNumber(cubeRoot5.exactValue, 32)).toBe(
      '1.70997594667669698935310887254386'
    )
  })

  it('keeps the catalogue constants at full precision', () => {
    const pi = constantById('pi')
    expect(pi).not.toBeNull()
    expect(formatNumber(pi!.exactValue, 32)).toBe(
      '3.1415926535897932384626433832795'
    )
    expect(formatNumber(pi!.exactValue)).toBe('3.14159')
    expect(pi!.value).toBe(Math.PI)
  })

  it('evaluates gamma and inverse gamma at more than 32 significant digits', () => {
    const half = decimalGamma(0.5)
    expect(half).not.toBeNull()
    expect(formatNumber(half!, 32)).toBe('1.77245385090551602729816748334115')

    const inverse = decimalInverseGamma(20)
    expect(inverse).not.toBeNull()
    const back = decimalGamma(inverse!)
    expect(back).not.toBeNull()
    expect(
      back!.minus(20).abs().lt(toDecimal('1e-30'))
    ).toBe(true)
  })

  it('uses exact values for acceptance instead of a loose double epsilon', () => {
    const third = applyBinaryOperator('div', 1, 3)
    const roundTrip = applyBinaryOperator('mult', third.exactValue, 3)
    expect(
      checkTargetAcceptance(roundTrip.exactValue, '1', 0).acceptable
    ).toBe(true)
    expect(
      checkTargetAcceptance('1.0000000000000000000001', '1', 0).acceptable
    ).toBe(false)
  })

  it('still recognises a base made equal to 1 through decimal division', () => {
    const one: Card = {
      id: 'one',
      rank: 1,
      suit: 'clubs',
      value: 1,
      label: 'A',
      spritePath: '',
    }
    const three: Card = {
      id: 'three',
      rank: 3,
      suit: 'spades',
      value: 3,
      label: '3',
      spritePath: '',
    }
    const five: Card = {
      id: 'five',
      rank: 5,
      suit: 'hearts',
      value: 5,
      label: '5',
      spritePath: '',
    }
    const div = applyBinaryOperator('div', 1, 3)
    const mul = applyBinaryOperator('mult', div.exactValue, 3)
    const pow = applyBinaryOperator('pow', mul.exactValue, 5)
    const divNode: BinaryGroupNode = {
      kind: 'binary',
      id: 'div',
      operator: 'div',
      left: { kind: 'card', id: 'one', card: one, value: 1, exactValue: '1' },
      right: { kind: 'card', id: 'three', card: three, value: 3, exactValue: '3' },
      value: div.value,
      exactValue: div.exactValue,
      headerText: div.headerText,
    }
    const mulNode: BinaryGroupNode = {
      kind: 'binary',
      id: 'mul',
      operator: 'mult',
      left: divNode,
      right: { kind: 'card', id: 'three', card: three, value: 3, exactValue: '3' },
      value: mul.value,
      exactValue: mul.exactValue,
      headerText: mul.headerText,
    }
    const powNode: BinaryGroupNode = {
      kind: 'binary',
      id: 'pow',
      operator: 'pow',
      left: mulNode,
      right: { kind: 'card', id: 'five', card: five, value: 5, exactValue: '5' },
      value: pow.value,
      exactValue: pow.exactValue,
      headerText: pow.headerText,
    }

    const breakdown = calculateScoreBreakdown(powNode, undefined, {
      moves: { factorialInvgamma: false, oneToPower: true },
      penalty: 200,
    })
    expect(breakdown.forbiddenCount).toBe(1)
    expect(breakdown.total).toBe(230)
  })

  it('formats integers, fractions and tiny values at the requested width', () => {
    expect(formatNumber('24')).toBe('24')
    expect(formatNumber('1.999999')).toBe('2')
    expect(formatNumber('0.000012345678901234567890123456789', 32)).toBe(
      '1.2345678901234567890123456789e-5'
    )
    expect(applyUnaryOperator('sin', 90).exactValue).toBe('1')
    expect(formatNumber(applyUnaryOperator('cos', 60).exactValue, 32)).toBe(
      '0.5'
    )
  })
})
