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
import type { GameSettings } from '../engine/types'

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
    } as unknown as GameSettings
    expect(sanitizeSettings(wild, room.settings)).toMatchObject({
      numCards: 10,
      firstToPoints: 25,
      approximationPercent: 0,
      mode: room.settings.mode,
      cardPool: room.settings.cardPool,
    })

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
    expect(room.phase).toBe('game-over')
    expect(room.matchWinnerIds).toEqual(['p1'])
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
