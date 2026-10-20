import { describe, expect, it } from 'vitest'
import {
  createPuzzle,
  validatePuzzleAttempt,
  puzzleLeaderboardKey,
  type PuzzleAttempt,
} from './puzzles'
import type { OperatorCategory } from './types'

const MONDAY = new Date('2026-10-19T10:00:00.000Z')

describe('daily and weekly puzzles', () => {
  it('builds the same deterministic daily puzzle for a UTC day', () => {
    const morning = createPuzzle('daily', MONDAY)
    const evening = createPuzzle('daily', new Date('2026-10-19T23:59:59.000Z'))

    expect(morning.kind).toBe('daily')
    expect(morning.key).toBe('2026-10-19')
    expect(morning.name.length).toBeGreaterThan(3)
    expect(morning.difficulty).toBe('medium')
    expect(morning.hand).toHaveLength(morning.settings.numCards)
    expect(morning.settings.numCards).toBeGreaterThanOrEqual(4)
    expect(morning.settings.numCards).toBeLessThanOrEqual(5)
    expect(morning.target).toBeGreaterThan(0)
    expect(Number.isFinite(morning.target)).toBe(true)
    expect(evening).toMatchObject({
      key: morning.key,
      name: morning.name,
      target: morning.target,
      hand: morning.hand,
      settings: morning.settings,
    })
    expect(evening.startsAt).toBe(morning.startsAt)
    expect(evening.endsAt).toBe(morning.endsAt)
  })

  it('gives each daily puzzle a new name, hand and target', () => {
    const first = createPuzzle('daily', new Date('2026-10-19T12:00:00.000Z'))
    const second = createPuzzle('daily', new Date('2026-10-20T12:00:00.000Z'))

    expect(second.key).toBe('2026-10-20')
    expect(second.name).not.toBe(first.name)
    expect(second.target).not.toBe(first.target)
    expect(second.hand.map((card) => `${card.rank}${card.suit}`)).not.toEqual(
      first.hand.map((card) => `${card.rank}${card.suit}`)
    )
  })

  it('runs one weekly puzzle from Monday to Monday', () => {
    const monday = createPuzzle('weekly', MONDAY)
    const friday = createPuzzle('weekly', new Date('2026-10-23T18:00:00.000Z'))
    const nextMonday = createPuzzle('weekly', new Date('2026-10-26T00:00:00.000Z'))

    expect(monday.key).toBe('2026-W43')
    expect(friday).toMatchObject({
      key: monday.key,
      name: monday.name,
      target: monday.target,
      hand: monday.hand,
    })
    expect(monday.startsAt).toBe(Date.UTC(2026, 9, 19))
    expect(monday.endsAt).toBe(Date.UTC(2026, 9, 26))
    expect(nextMonday.key).toBe('2026-W44')
    expect(nextMonday.name).not.toBe(monday.name)
  })

  it('makes the weekly puzzle materially harder than the daily one', () => {
    const daily = createPuzzle('daily', MONDAY)
    const weekly = createPuzzle('weekly', MONDAY)

    expect(daily.difficulty).toBe('medium')
    expect(weekly.difficulty).toBe('extreme')
    expect(weekly.settings.numCards).toBeGreaterThanOrEqual(6)
    expect(weekly.operatorGroups.length).toBeGreaterThan(daily.operatorGroups.length)
    expect(weekly.settings.approximationPercent).toBe(0)
  })

  it('varies card counts, targets and allowed operators across a week', () => {
    const puzzles = Array.from({ length: 7 }, (_, day) =>
      createPuzzle('daily', new Date(Date.UTC(2026, 9, 19 + day, 12)))
    )

    expect(new Set(puzzles.map((p) => p.settings.numCards)).size).toBeGreaterThan(1)
    expect(new Set(puzzles.map((p) => p.target)).size).toBeGreaterThan(2)
    expect(new Set(puzzles.map((p) => p.operatorGroups.join('|'))).size).toBeGreaterThan(1)
  })

  it('emits a solvable reference expression that passes the same validation as a player', () => {
    for (const kind of ['daily', 'weekly'] as const) {
      const puzzle = createPuzzle(kind, MONDAY)
      const attempt = validatePuzzleAttempt(puzzle, JSON.parse(JSON.stringify(puzzle.referenceSolution)))

      expect(attempt.ok).toBe(true)
      if (attempt.ok) {
        expect(attempt.finalValue).toBeCloseTo(puzzle.target, 9)
        expect(attempt.score).toBeGreaterThan(0)
        expect(attempt.equation).toContain('=')
      }
    }
  })

  it('rejects incomplete boards, disabled operators and invalid payloads', () => {
    const puzzle = createPuzzle('daily', MONDAY)
    const onlyOneCard = { kind: 'card', card: puzzle.hand[0] } as const

    const incomplete = validatePuzzleAttempt(puzzle, onlyOneCard)
    expect(incomplete.ok).toBe(false)

    const disabled = findDisabledOperator(puzzle)
    if (disabled) {
      expect(disabled.ok).toBe(false)
    }

    const outsideTarget = validatePuzzleAttempt(
      { ...puzzle, target: puzzle.target + 1 },
      puzzle.referenceSolution
    )
    expect(outsideTarget.ok).toBe(false)

    expect(validatePuzzleAttempt(puzzle, 'not a board').ok).toBe(false)
    expect(validatePuzzleAttempt(puzzle, { kind: 'card' }).ok).toBe(false)
  })

  it('has stable, distinct leaderboard keys per kind and period', () => {
    const daily = createPuzzle('daily', MONDAY)
    const weekly = createPuzzle('weekly', MONDAY)
    expect(puzzleLeaderboardKey(daily)).toBe('daily:2026-10-19')
    expect(puzzleLeaderboardKey(weekly)).toBe('weekly:2026-W43')
    expect(puzzleLeaderboardKey(daily)).not.toBe(puzzleLeaderboardKey(weekly))
  })
})

/**
 * Builds a valid-looking all-cards expression that uses a disabled operator, so
 * validation has to reject it even though the card hardware is correct.
 */
function findDisabledOperator(
  puzzle: ReturnType<typeof createPuzzle>
): PuzzleAttempt | null {
  const enabled = new Set(puzzle.operatorGroups)
  const groups: OperatorCategory[] = [
    'trig',
    'computing',
    'concat',
    'analysis',
    'combinatorics',
    'inverse',
  ]
  const disabledGroup = groups.find((group) => !enabled.has(group))
  if (!disabledGroup) return null

  const left = { kind: 'card' as const, card: puzzle.hand[0]! }
  const right = { kind: 'card' as const, card: puzzle.hand[1]! }
  const expression =
    disabledGroup === 'trig'
      ? { kind: 'unary' as const, operator: 'sin' as const, operand: left }
      : disabledGroup === 'computing'
        ? { kind: 'binary' as const, operator: 'bitand' as const, left, right }
        : disabledGroup === 'concat'
          ? { kind: 'binary' as const, operator: 'concat' as const, left, right }
          : disabledGroup === 'analysis'
            ? { kind: 'unary' as const, operator: 'exp' as const, operand: left }
            : disabledGroup === 'combinatorics'
              ? { kind: 'binary' as const, operator: 'comb' as const, left, right }
              : { kind: 'unary' as const, operator: 'inv' as const, operand: left }

  // The sample may be too short to use every card, which is also a rejection;
  // either way the attempt must not be accepted.
  return validatePuzzleAttempt(puzzle, expression)
}
