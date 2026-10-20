import { describe, expect, it } from 'vitest'
import {
  addRoomPlayer,
  createRoomState,
  generateRoomCode,
  handleClientMessage,
  removeRoomPlayer,
  roomIsEmpty,
  sanitizeSettings,
  tickRoom,
} from './room'
import type { ClientMessage, RoomState } from './protocol'
import { createCard } from '../engine/deck'
import type { Card, ExprNode, GameSettings } from '../engine/types'

function seat(room: RoomState, id: string, name: string): void {
  const result = addRoomPlayer(room, { id, name })
  expect(result.error).toBeUndefined()
}

function startMatch(room: RoomState, hostId = 'p1'): void {
  const result = handleClientMessage(room, hostId, { t: 'start-match' }, 1_000)
  expect(result.error).toBeUndefined()
}

function submit(room: RoomState, playerId: string, score: number, lhs = `${playerId}-expr`) {
  return handleClientMessage(
    room,
    playerId,
    {
      t: 'submit',
      solution: {
        equation: `${lhs} = 24`,
        lhs,
        finalValue: 24,
        score,
        errorPercent: 0,
        workspaceIndex: 1,
      },
    },
    2_000
  )
}

/** A single add chain over the whole hand, for exercising the card-board snapshot. */
function addTree(cards: Card[]): ExprNode {
  const toLeaf = (card: Card): ExprNode => ({
    kind: 'card',
    id: `leaf-${card.id}`,
    card,
    value: card.value,
  })
  return cards.slice(1).reduce<ExprNode>(
    (left, card) => ({
      kind: 'binary',
      id: `add-${card.id}`,
      operator: 'add',
      left,
      right: toLeaf(card),
      value: left.value + card.value,
      headerText: '',
    }),
    toLeaf(cards[0]!)
  )
}

describe('multiplayer room — seating and lobby', () => {
  it('seats players, makes the first host, and de-duplicates names', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Ace')
    seat(room, 'p2', 'Ace')

    expect(room.players).toHaveLength(2)
    expect(room.hostId).toBe('p1')
    expect(room.players[0]!.isHost).toBe(true)
    expect(room.players[0]!.isReady).toBe(true)
    expect(room.players[1]!.name).toBe('Ace 2')
    expect(room.players[1]!.isReady).toBe(false)
    expect(room.phase).toBe('lobby')
  })

  it('promotes the next player when the host leaves and reports empty rooms', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')

    expect(removeRoomPlayer(room, 'p1').changed).toBe(true)
    expect(room.hostId).toBe('p2')
    expect(room.players[0]!.isHost).toBe(true)
    expect(room.players[0]!.isReady).toBe(true)

    removeRoomPlayer(room, 'p2')
    expect(roomIsEmpty(room)).toBe(true)
    expect(room.hostId).toBeNull()
  })

  it('lets only the host change rules, and clamps impossible values', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')

    // Both house rules start on, priced at the classic 200 points.
    expect(room.settings.forbiddenMoves).toEqual({
      factorialInvgamma: true,
      oneToPower: true,
    })
    expect(room.settings.forbiddenMovePenalty).toBe(200)

    const asGuest = handleClientMessage(room, 'p2', {
      t: 'update-settings',
      settings: { ...room.settings, numCards: 10 },
    })
    expect(asGuest.error?.code).toBe('not-host')

    const wild = {
      ...room.settings,
      numCards: 99,
      firstToPoints: 500,
      approximationPercent: -4,
      mode: 'nonsense',
      cardPool: 'dozens',
      scoringMode: 'closest-wins',
      forbiddenMoves: { factorialInvgamma: 'yes', oneToPower: 0 },
      forbiddenMovePenalty: 99_999,
    } as unknown as GameSettings
    expect(sanitizeSettings(wild, room.settings)).toMatchObject({
      numCards: 10,
      firstToPoints: 25,
      approximationPercent: 0,
      mode: room.settings.mode,
      cardPool: room.settings.cardPool,
      scoringMode: room.settings.scoringMode,
      forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
      forbiddenMovePenalty: 9_999,
    })
    expect(
      sanitizeSettings({ ...room.settings, forbiddenMovePenalty: -5 }, room.settings)
        .forbiddenMovePenalty
    ).toBe(0)

    // The three weighted modes survive the trip through the wire.
    for (const scoringMode of ['cost-first', 'balanced', 'accuracy-first'] as const) {
      const next = sanitizeSettings({ ...room.settings, scoringMode }, room.settings)
      expect(next.scoringMode).toBe(scoringMode)
    }

    const asHost = handleClientMessage(room, 'p1', {
      t: 'update-settings',
      settings: { ...room.settings, numCards: 6 },
    })
    expect(asHost.error).toBeUndefined()
    expect(room.settings.numCards).toBe(6)

    // The concat group is a setting like any other and survives sanitising.
    expect(room.settings.allowedOperators.concat).toBe(false)
    handleClientMessage(room, 'p1', {
      t: 'update-settings',
      settings: {
        ...room.settings,
        allowedOperators: { ...room.settings.allowedOperators, concat: true },
      },
    })
    expect(room.settings.allowedOperators.concat).toBe(true)
  })

  it('deals a constant target, records which constant, and sanitises the choice', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')

    handleClientMessage(room, 'p1', {
      t: 'update-settings',
      settings: {
        ...room.settings,
        targetPreset: 'constant',
        targetConstant: 'e',
        approximationPercent: 2,
      },
    })
    expect(room.settings.targetPreset).toBe('constant')
    expect(room.settings.targetConstant).toBe('e')

    startMatch(room)
    expect(room.round?.target).toBe(Math.E)
    expect(room.round?.constantId).toBe('e')

    // Unknown constants fall back to the base rules instead of reaching play.
    expect(
      sanitizeSettings({ ...room.settings, targetConstant: 'not-real' }, room.settings)
        .targetConstant
    ).toBe('e')
    expect(
      sanitizeSettings({ ...room.settings, targetConstant: 'pi' }, room.settings)
        .targetConstant
    ).toBe('pi')
  })

  it('sanitises per-operator switches alongside the group switches', () => {
    const room = createRoomState('operators')

    const next = sanitizeSettings(
      {
        ...room.settings,
        allowedOperators: {
          ...room.settings.allowedOperators,
          analysis: true,
          combinatorics: true,
          operators: { exp: false, log: true, comb: true, nonsense: true },
        },
      } as unknown as GameSettings,
      room.settings
    )

    expect(next.allowedOperators.analysis).toBe(true)
    expect(next.allowedOperators.combinatorics).toBe(true)
    expect(next.allowedOperators.operators).toEqual({ exp: false, log: true, comb: true })
  })

  it('tracks readiness without letting the host un-ready', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')

    expect(handleClientMessage(room, 'p2', { t: 'set-ready', ready: true }).changed).toBe(true)
    expect(room.players[1]!.isReady).toBe(true)

    expect(handleClientMessage(room, 'p1', { t: 'set-ready', ready: false }).changed).toBe(false)
    expect(room.players[0]!.isReady).toBe(true)
  })
})

describe('multiplayer room — lobby codes and mid-round joins', () => {
  it('generates short readable codes and never repeats one already in use', () => {
    const taken = new Set<string>()
    for (let i = 0; i < 25; i++) {
      const code = generateRoomCode((candidate) => taken.has(candidate))
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)
      expect(taken.has(code)).toBe(false)
      taken.add(code)
    }
  })

  it('marks a mid-round joiner as waiting and deals them in on the next round', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    room.settings.mode = 'best-30s'
    startMatch(room)

    seat(room, 'p2', 'Late')
    expect(room.players[1]!.isWaiting).toBe(true)

    // Watching from the sidelines: a board sent now changes nothing.
    expect(submit(room, 'p2', 10).error?.code).toBe('waiting')
    expect(room.round!.solutions).toHaveLength(0)

    tickRoom(room, room.round!.deadline!)
    expect(handleClientMessage(room, 'p1', { t: 'next-round' }).error).toBeUndefined()
    expect(room.round!.number).toBe(2)
    expect(room.players[1]!.isWaiting).toBe(false)
    expect(submit(room, 'p2', 10).error).toBeUndefined()
  })

  it('promotes the oldest remaining player when the host leaves mid-match', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Oldest')
    seat(room, 'p3', 'Newest')
    room.settings.mode = 'best-30s'
    startMatch(room)

    expect(removeRoomPlayer(room, 'p1').changed).toBe(true)
    expect(room.hostId).toBe('p2')
    expect(room.players.map((p) => [p.name, p.isHost])).toEqual([
      ['Oldest', true],
      ['Newest', false],
    ])
    // The new host can steer the round that is already running.
    expect(handleClientMessage(room, 'p2', { t: 'skip-round' }).error).toBeUndefined()
    expect(room.phase).toBe('round-end')
  })
})

describe('multiplayer room — rounds', () => {
  it('deals the same hand to the whole table when the host starts', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    startMatch(room)

    expect(room.phase).toBe('playing')
    expect(room.round).not.toBeNull()
    expect(room.round!.number).toBe(1)
    expect(room.round!.hand).toHaveLength(room.settings.numCards)
    expect(room.round!.deadline).toBeNull()
    expect(room.round!.target).toBe(24)
    expect(room.players.every((p) => p.bestRoundScore === null)).toBe(true)
  })

  it('requires a host-chosen target for manual rounds and uses it each deal', () => {
    const room = createRoomState('manual')
    seat(room, 'p1', 'Host')
    handleClientMessage(room, 'p1', {
      t: 'update-settings',
      settings: { ...room.settings, targetPreset: 'manual' },
    })

    // No exact target, no deal: the lobby cannot start the round on a default.
    const missing = handleClientMessage(room, 'p1', { t: 'start-match' }, 1_000)
    expect(missing.error?.code).toBe('target-required')
    expect(room.phase).toBe('lobby')
    expect(
      handleClientMessage(room, 'p1', { t: 'start-match', target: Number.NaN }, 1_000).error
        ?.code
    ).toBe('target-required')

    expect(
      handleClientMessage(room, 'p1', { t: 'start-match', target: 42 }, 1_000).error
    ).toBeUndefined()
    expect(room.phase).toBe('playing')
    expect(room.round?.target).toBe(42)

    // The next deal asks again instead of reusing the previous target.
    expect(handleClientMessage(room, 'p1', { t: 'skip-round' }, 1_100).error).toBeUndefined()
    expect(room.phase).toBe('round-end')
    expect(
      handleClientMessage(room, 'p1', { t: 'next-round' }, 1_200).error?.code
    ).toBe('target-required')
    expect(
      handleClientMessage(room, 'p1', { t: 'next-round', target: 84 }, 1_200).error
    ).toBeUndefined()
    expect(room.round?.number).toBe(2)
    expect(room.round?.target).toBe(84)
  })

  it('gives timed modes a deadline the server can expire', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    room.settings.mode = 'best-1m'
    startMatch(room, 'p1')

    expect(room.round!.deadline).toBe(1_000 + 60_000)
    expect(tickRoom(room, 1_000 + 59_999)).toBe(false)
    expect(tickRoom(room, 1_000 + 60_000)).toBe(true)
    expect(room.phase).toBe('round-end')
    expect(room.round!.endedReason).toBe('timer')
    expect(room.round!.winnerIds).toEqual([])
    expect(room.players[0]!.points).toBe(0)
  })

  it('ends first-to-solve on the first valid submission and pays the point', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    startMatch(room)

    expect(submit(room, 'p2', 40).error).toBeUndefined()
    expect(room.phase).toBe('round-end')
    expect(room.round!.winnerIds).toEqual(['p2'])
    expect(room.round!.endedReason).toBe('first-to-solve')
    expect(room.players.find((p) => p.id === 'p2')!.points).toBe(1)

    // The round is closed: a late submission is refused and changes nothing
    expect(submit(room, 'p1', 10).error?.code).toBe('wrong-phase')
    expect(room.round!.solutions).toHaveLength(1)
  })

  it('awards the round to the cheapest solution when the clock runs out', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.mode = 'best-30s'
    startMatch(room)

    submit(room, 'p1', 60, 'expensive')
    submit(room, 'p2', 20, 'cheap')
    expect(room.phase).toBe('playing')

    tickRoom(room, room.round!.deadline!)
    expect(room.phase).toBe('round-end')
    expect(room.round!.winnerIds).toEqual(['p2'])
    expect(room.players.find((p) => p.id === 'p2')!.points).toBe(1)
    expect(room.players.find((p) => p.id === 'p2')!.bestRoundScore).toBe(20)
  })

  it('pays every player whose best board ties for cheapest', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.mode = 'best-30s'
    startMatch(room)

    submit(room, 'p1', 30, 'a')
    submit(room, 'p2', 30, 'b')
    tickRoom(room, room.round!.deadline!)

    expect(room.phase).toBe('round-end')
    expect(room.round!.winnerIds).toEqual(['p1', 'p2'])
    expect(room.players.map((p) => p.points)).toEqual([1, 1])
  })

  it('declares a drawn series when tied players reach first-to-x together', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.mode = 'best-30s'
    room.settings.firstToPoints = 1
    startMatch(room)

    submit(room, 'p1', 25, 'a')
    submit(room, 'p2', 25, 'b')
    tickRoom(room, room.round!.deadline!)

    // The last round still shows its solution screen first; the host moves on
    // to the series winner from there.
    expect(room.phase).toBe('round-end')
    expect(room.matchWinnerIds).toEqual(['p1', 'p2'])

    expect(handleClientMessage(room, 'p1', { t: 'next-round' }).error).toBeUndefined()
    expect(room.phase).toBe('game-over')
    expect(room.matchWinnerIds).toEqual(['p1', 'p2'])
  })

  it('shares an early-ended series between players level at the top', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.mode = 'best-30s'
    startMatch(room)

    submit(room, 'p1', 20, 'a')
    submit(room, 'p2', 20, 'b')
    tickRoom(room, room.round!.deadline!)
    expect(handleClientMessage(room, 'p1', { t: 'next-round' }).error).toBeUndefined()

    expect(handleClientMessage(room, 'p1', { t: 'end-match' }).error).toBeUndefined()
    expect(room.phase).toBe('game-over')
    expect(room.matchWinnerIds).toEqual(['p1', 'p2'])
  })

  it('replaces a repeated board instead of stacking duplicates', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.mode = 'best-30s'
    startMatch(room)

    submit(room, 'p1', 50, 'same-board')
    submit(room, 'p1', 30, 'same-board')
    expect(room.round!.solutions).toHaveLength(1)
    expect(room.round!.solutions[0]!.score).toBe(30)
    expect(room.players[0]!.bestRoundScore).toBe(30)
  })

  it('skips a round with no point, then deals the next one only for the host', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    startMatch(room)

    expect(handleClientMessage(room, 'p2', { t: 'skip-round' }).error?.code).toBe('not-host')
    expect(handleClientMessage(room, 'p1', { t: 'skip-round' }).error).toBeUndefined()
    expect(room.phase).toBe('round-end')
    expect(room.round!.endedReason).toBe('skip')
    expect(room.round!.winnerIds).toEqual([])
    expect(room.players.every((p) => p.points === 0)).toBe(true)

    expect(handleClientMessage(room, 'p2', { t: 'next-round' }).error?.code).toBe('not-host')
    expect(handleClientMessage(room, 'p1', { t: 'next-round' }).error).toBeUndefined()
    expect(room.phase).toBe('playing')
    expect(room.round!.number).toBe(2)
    expect(room.round!.solutions).toHaveLength(0)
  })

  it('pays the best board when the host closes a round early', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.mode = 'best-5m'
    startMatch(room)

    submit(room, 'p1', 45, 'slow-but-fine')
    submit(room, 'p2', 15, 'cheap')

    expect(handleClientMessage(room, 'p1', { t: 'skip-round' }).error).toBeUndefined()
    expect(room.phase).toBe('round-end')
    expect(room.round!.endedReason).toBe('host-end')
    expect(room.round!.winnerIds).toEqual(['p2'])
    expect(room.players.find((p) => p.id === 'p2')!.points).toBe(1)
  })

  it('ends the match once someone reaches first-to-x', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.firstToPoints = 1
    startMatch(room)

    submit(room, 'p1', 25)
    expect(room.phase).toBe('round-end')
    expect(room.matchWinnerIds).toEqual(['p1'])

    expect(handleClientMessage(room, 'p2', { t: 'next-round' }).error?.code).toBe('not-host')
    expect(handleClientMessage(room, 'p1', { t: 'next-round' }).error).toBeUndefined()
    expect(room.phase).toBe('game-over')
    expect(room.matchWinnerIds).toEqual(['p1'])
  })

  it('returns the whole table to the lobby for a rematch, host only', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    room.settings.firstToPoints = 1
    startMatch(room)

    submit(room, 'p1', 25)
    handleClientMessage(room, 'p1', { t: 'next-round' })
    expect(room.phase).toBe('game-over')

    expect(handleClientMessage(room, 'p2', { t: 'return-to-lobby' }).error?.code).toBe('not-host')
    expect(room.phase).toBe('game-over')

    expect(handleClientMessage(room, 'p1', { t: 'return-to-lobby' }).error).toBeUndefined()
    expect(room.phase).toBe('lobby')
    expect(room.round).toBeNull()
    expect(room.matchWinnerIds).toEqual([])
    expect(room.hostId).toBe('p1')
    expect(room.players.map((p) => p.isReady)).toEqual([true, false])
    // The rules stay as the host left them so they can be tweaked in the lobby.
    expect(room.settings.firstToPoints).toBe(1)

    // From there the host can deal a fresh series with the same room.
    expect(handleClientMessage(room, 'p1', { t: 'start-match' }).error).toBeUndefined()
    expect(room.phase).toBe('playing')
    expect(room.round!.number).toBe(1)
    expect(room.players.map((p) => p.points)).toEqual([0, 0])
  })

  it('unlocks the rules only after the room is back in its lobby', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    room.settings.firstToPoints = 1
    startMatch(room)
    submit(room, 'p1', 25)
    handleClientMessage(room, 'p1', { t: 'next-round' })

    const locked = handleClientMessage(room, 'p1', {
      t: 'update-settings',
      settings: { ...room.settings, numCards: 8 },
    })
    expect(locked.error?.code).toBe('wrong-phase')

    handleClientMessage(room, 'p1', { t: 'return-to-lobby' })
    const editable = handleClientMessage(room, 'p1', {
      t: 'update-settings',
      settings: { ...room.settings, numCards: 8 },
    })
    expect(editable.error).toBeUndefined()
    expect(room.settings.numCards).toBe(8)
  })

  it('refuses a board that misses the target, however cheap it claims to be', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    seat(room, 'p2', 'Guest')
    startMatch(room)

    const cheat = handleClientMessage(
      room,
      'p1',
      {
        t: 'submit',
        solution: {
          equation: '2 + 2 = 4',
          lhs: '2 + 2',
          finalValue: 4,
          score: 0,
          errorPercent: 0,
          workspaceIndex: 1,
        },
      },
      2_000
    )

    expect(cheat.error?.code).toBe('bad-message')
    expect(room.phase).toBe('playing')
    expect(room.round!.solutions).toHaveLength(0)
    expect(room.players[0]!.points).toBe(0)
  })

  it('recomputes the error percent from the target instead of trusting the client', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    room.settings.mode = 'best-1m'
    room.settings.approximationPercent = 10
    startMatch(room)

    const padded = handleClientMessage(
      room,
      'p1',
      {
        t: 'submit',
        solution: {
          equation: '5 * 5 = 25',
          lhs: '5 * 5',
          finalValue: 25,
          score: 10,
          errorPercent: 0, // a lie: 25 is ~4.17% away from 24
          workspaceIndex: 1,
        },
      },
      2_000
    )

    expect(padded.error).toBeUndefined()
    expect(room.round!.solutions).toHaveLength(1)
    expect(room.round!.solutions[0]!.errorPercent).toBeCloseTo(4.1667, 3)
  })

  it('answers an unknown message type instead of blowing up', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')

    const bogus = handleClientMessage(
      room,
      'p1',
      { t: 'not-a-real-message' } as unknown as ClientMessage,
      1_000
    )

    expect(bogus.changed).toBe(false)
    expect(bogus.error?.code).toBe('bad-message')
  })

  it('rejects malformed solutions without touching the round', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    startMatch(room)

    const bad = handleClientMessage(room, 'p1', {
      t: 'submit',
      solution: { equation: 'x', lhs: '', finalValue: 1, score: Number.NaN, errorPercent: 0, workspaceIndex: 1 },
    })
    expect(bad.error?.code).toBe('bad-message')
    expect(room.phase).toBe('playing')
    expect(room.round!.solutions).toHaveLength(0)
  })

  it('stores a validated card board and derives the score and equation from it', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    room.settings.mode = 'best-1m'
    startMatch(room)

    const hand = room.round!.hand
    const board = addTree(hand)
    room.round!.target = board.value

    const result = handleClientMessage(
      room,
      'p1',
      {
        t: 'submit',
        solution: {
          equation: 'not the real equation',
          lhs: 'not the real board',
          finalValue: board.value,
          score: 0,
          errorPercent: 0,
          workspaceIndex: 2,
          expression: board,
        },
      },
      2_000
    )

    expect(result.error).toBeUndefined()
    const solution = room.round!.solutions[0]!
    expect(solution.expression).toBeDefined()
    expect(solution.expression!.value).toBe(board.value)
    expect(solution.lhs).not.toBe('not the real board')
    expect(solution.lhs).toContain(' + ')
    expect(solution.score).toBe(30)
    expect(solution.finalValue).toBe(board.value)
  })

  it('prices forbidden moves from the host rules on submitted boards', () => {
    const priceOfOneToPower = (patch: Partial<GameSettings>): number => {
      const room = createRoomState('test')
      seat(room, 'p1', 'Host')
      room.settings.mode = 'best-1m'
      Object.assign(room.settings, patch)
      startMatch(room)

      const one = createCard(1, 'spades', 'forbidden-one')
      const five = createCard(5, 'hearts', 'forbidden-five')
      room.round!.hand = [one, five]
      room.round!.target = 1
      const board: ExprNode = {
        kind: 'binary',
        id: 'pow-one',
        operator: 'pow',
        left: { kind: 'card', id: `leaf-${one.id}`, card: one, value: 1 },
        right: { kind: 'card', id: `leaf-${five.id}`, card: five, value: 5 },
        value: 1,
        headerText: '1 ^ 5 = 1',
      }

      const result = handleClientMessage(
        room,
        'p1',
        {
          t: 'submit',
          solution: {
            equation: '1 ^ 5 = 1',
            lhs: '1 ^ 5',
            finalValue: 1,
            score: 0,
            errorPercent: 0,
            workspaceIndex: 1,
            expression: board,
          },
        },
        2_000
      )
      expect(result.error).toBeUndefined()
      return room.round!.solutions[0]!.score
    }

    expect(priceOfOneToPower({ forbiddenMovePenalty: 75 })).toBe(85)
    expect(
      priceOfOneToPower({
        forbiddenMoves: { factorialInvgamma: true, oneToPower: false },
      })
    ).toBe(10)
  })

  it('rejects a board snapshot that does not use the dealt hand', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    room.settings.mode = 'best-1m'
    startMatch(room)

    const pair = addTree(room.round!.hand.slice(0, 2))
    room.round!.target = pair.value

    const result = handleClientMessage(
      room,
      'p1',
      {
        t: 'submit',
        solution: {
          equation: 'partial board',
          lhs: 'partial board',
          finalValue: pair.value,
          score: 10,
          errorPercent: 0,
          workspaceIndex: 1,
          expression: pair,
        },
      },
      2_000
    )

    expect(result.error?.code).toBe('bad-message')
    expect(room.round!.solutions).toHaveLength(0)
  })

  it('locks the rules once the match is running', () => {
    const room = createRoomState('test')
    seat(room, 'p1', 'Host')
    startMatch(room)

    const locked = handleClientMessage(room, 'p1', {
      t: 'update-settings',
      settings: { ...room.settings, numCards: 9 },
    })
    expect(locked.error?.code).toBe('wrong-phase')
    expect(room.settings.numCards).toBe(4)
  })
})
