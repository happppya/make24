import { dealHand, generateTargetNumber } from '../engine/deck'
import { checkTargetAcceptance } from '../engine/math'
import type {
  Card,
  CardPoolMode,
  GameMode,
  GameSettings,
  SubmittedSolution,
  TargetPreset,
} from '../engine/types'
import {
  MAX_ROOM_PLAYERS,
  modeDurationSeconds,
  normalizeRoomCode,
  sanitizeName,
  type ClientMessage,
  type LobbyPlayer,
  type RoomState,
  type RoundEndReason,
  type RoundState,
  type ServerError,
  type SubmittedSolutionPayload,
} from './protocol'

/**
 * Authoritative room state, written as plain functions over plain objects.
 *
 * The server owns the one copy of each room and calls this reducer; the loopback
 * transport calls the exact same reducer in the browser. No timers, sockets or
 * DOM live here, so the whole game flow can be unit-tested and later hosted on
 * different infrastructure without touching the rules.
 */

export function createDefaultSettings(): GameSettings {
  return {
    isMultiplayer: true,
    mode: 'first-to-solve',
    numCards: 4,
    targetPreset: 'just-24',
    customMin: 10,
    customMax: 250,
    manualTarget: 24,
    approximationPercent: 0,
    cardPool: '1-deck',
    allowedOperators: {
      basic: true,
      powers: true,
      factorial: true,
      trig: false,
      inverse: false,
      bitshift: false,
    },
    firstToPoints: 3,
  }
}

const GAME_MODES: GameMode[] = [
  'first-to-solve',
  'best-30s',
  'best-1m',
  'best-3m',
  'best-5m',
  'best-10m',
]
const TARGET_PRESETS: TargetPreset[] = ['just-24', 'small', 'big', 'custom', 'manual']
const CARD_POOLS: CardPoolMode[] = ['1-deck', '2-decks', '3-decks', 'unlimited']

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

/** Client-supplied settings are never trusted: clamp everything into a playable range. */
export function sanitizeSettings(input: unknown, base: GameSettings): GameSettings {
  const raw = (input ?? {}) as Partial<GameSettings>
  const operators = (raw.allowedOperators ?? base.allowedOperators) as unknown as Record<
    string,
    unknown
  >
  return {
    isMultiplayer: true,
    mode: pick(raw.mode, GAME_MODES, base.mode),
    numCards: Math.round(clampNumber(raw.numCards, 2, 10, base.numCards)),
    targetPreset: pick(raw.targetPreset, TARGET_PRESETS, base.targetPreset),
    customMin: clampNumber(raw.customMin, -99999, 99999, base.customMin),
    customMax: clampNumber(raw.customMax, -99999, 99999, base.customMax),
    manualTarget: clampNumber(raw.manualTarget, -99999, 99999, base.manualTarget),
    approximationPercent: clampNumber(raw.approximationPercent, 0, 100, base.approximationPercent),
    cardPool: pick(raw.cardPool, CARD_POOLS, base.cardPool),
    allowedOperators: {
      basic: Boolean(operators.basic),
      powers: Boolean(operators.powers),
      factorial: Boolean(operators.factorial),
      trig: Boolean(operators.trig),
      inverse: Boolean(operators.inverse),
      bitshift: Boolean(operators.bitshift),
    },
    firstToPoints: Math.round(clampNumber(raw.firstToPoints, 1, 25, base.firstToPoints)),
  }
}

export interface HandleResult {
  changed: boolean
  error?: ServerError
}

function ok(changed: boolean): HandleResult {
  return { changed }
}

function fail(code: ServerError['code'], message: string): HandleResult {
  return { changed: false, error: { code, message } }
}

export function createRoomState(code: string): RoomState {
  return {
    code: normalizeRoomCode(code) || 'MAIN',
    revision: 0,
    phase: 'lobby',
    hostId: null,
    players: [],
    settings: createDefaultSettings(),
    round: null,
    matchWinnerId: null,
  }
}

function uniqueName(room: RoomState, wanted: string): string {
  const base = sanitizeName(wanted)
  const taken = new Set(room.players.map((p) => p.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; i < 99; i++) {
    const candidate = `${base.slice(0, 15)} ${i}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${base.slice(0, 12)} ${Math.floor(Math.random() * 900 + 100)}`
}

/** Adds a player; the first one in an empty room becomes host. */
export function addRoomPlayer(
  room: RoomState,
  player: { id: string; name: string }
): { changed: boolean; player?: LobbyPlayer; error?: ServerError } {
  if (room.players.length >= MAX_ROOM_PLAYERS) {
    return {
      changed: false,
      error: { code: 'room-full', message: `Room ${room.code} already has ${MAX_ROOM_PLAYERS} players.` },
    }
  }
  const isHost = room.hostId === null
  const playerEntry: LobbyPlayer = {
    id: player.id,
    name: uniqueName(room, player.name),
    isHost,
    // The host has no one to wait for, so they start ready.
    isReady: isHost,
    points: 0,
    bestRoundScore: null,
    connected: true,
  }
  if (isHost) room.hostId = playerEntry.id
  room.players.push(playerEntry)
  room.revision += 1
  return { changed: true, player: playerEntry }
}

/** Removes a player and hands the host badge to the next seated player. */
export function removeRoomPlayer(room: RoomState, playerId: string): HandleResult {
  const index = room.players.findIndex((p) => p.id === playerId)
  if (index === -1) return ok(false)
  const [removed] = room.players.splice(index, 1)
  if (removed && removed.isHost) {
    const next = room.players[0]
    if (next) {
      next.isHost = true
      next.isReady = true
      room.hostId = next.id
    } else {
      room.hostId = null
    }
  }
  room.revision += 1
  return ok(true)
}

export function isRoomHost(room: RoomState, playerId: string): boolean {
  return room.hostId === playerId
}

function findPlayer(room: RoomState, playerId: string): LobbyPlayer | undefined {
  return room.players.find((p) => p.id === playerId)
}

function computeWinner(solutions: SubmittedSolution[]): SubmittedSolution | null {
  if (solutions.length === 0) return null
  return [...solutions].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.timestampMs - b.timestampMs
  })[0]!
}

function dealRound(room: RoomState, now: number): void {
  const roundNumber = (room.round?.number ?? 0) + 1
  const duration = modeDurationSeconds(room.settings.mode)
  const round: RoundState = {
    number: roundNumber,
    target: generateTargetNumber(room.settings),
    hand: dealHand(room.settings.numCards, room.settings.cardPool),
    startedAt: now,
    deadline: duration === null ? null : now + duration * 1000,
    solutions: [],
    winnerId: null,
    endedReason: null,
  }
  room.round = round
  room.phase = 'playing'
  room.matchWinnerId = null
  for (const player of room.players) {
    player.bestRoundScore = null
  }
  room.revision += 1
}

/**
 * Ends the active round, awards the point and decides whether the match is over.
 * `forcedWinnerId` is used by first-to-solve, where the first valid submit wins
 * outright rather than on score.
 */
function endRound(
  room: RoomState,
  reason: RoundEndReason,
  forcedWinnerId: string | null = null
): void {
  const round = room.round
  if (!round) return
  round.endedReason = reason

  let winnerId: string | null = null
  if (reason !== 'skip') {
    const winnerSolution = forcedWinnerId
      ? (round.solutions.find((s) => s.playerId === forcedWinnerId) ?? null)
      : computeWinner(round.solutions)
    winnerId = winnerSolution?.playerId ?? null
  }
  round.winnerId = winnerId

  const winner = winnerId ? findPlayer(room, winnerId) : undefined
  if (winner) {
    winner.points += 1
    if (winner.points >= room.settings.firstToPoints) {
      room.phase = 'game-over'
      room.matchWinnerId = winner.id
      room.revision += 1
      return
    }
  }

  room.phase = 'round-end'
  room.revision += 1
}

function applySubmit(
  room: RoomState,
  playerId: string,
  payload: SubmittedSolutionPayload,
  now: number
): HandleResult {
  const round = room.round
  if (room.phase !== 'playing' || !round) {
    return fail('wrong-phase', 'The round is not accepting solutions right now.')
  }
  const player = findPlayer(room, playerId)
  if (!player) return fail('not-in-room', 'Join a room before submitting.')

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.lhs !== 'string' ||
    typeof payload.equation !== 'string' ||
    payload.lhs.length === 0 ||
    payload.lhs.length > 500 ||
    payload.equation.length > 500 ||
    !Number.isFinite(payload.finalValue) ||
    !Number.isFinite(payload.score) ||
    payload.score < 0 ||
    payload.score > 1e6
  ) {
    return fail('bad-message', 'That solution payload is not valid.')
  }

  // The board itself is the server's business: a client can claim any score it
  // likes, but the value it claims has to land in the round's acceptance band.
  // Error percent is recomputed here rather than trusted, so a padded payload
  // cannot win a round it does not deserve.
  const check = checkTargetAcceptance(
    payload.finalValue,
    round.target,
    room.settings.approximationPercent
  )
  if (!check.acceptable) {
    return fail('bad-message', 'That board is not within the target tolerance.')
  }

  const entry: SubmittedSolution = {
    id: `sol-${playerId}-${round.number}-${round.solutions.length + 1}`,
    playerId,
    playerName: player.name,
    equation: payload.equation,
    lhs: payload.lhs,
    finalValue: payload.finalValue,
    score: payload.score,
    errorPercent: check.errorPercent,
    timestampMs: Math.max(0, now - round.startedAt),
    workspaceIndex: Math.max(1, Math.round(payload.workspaceIndex || 1)),
  }

  // Same board submitted twice replaces the earlier copy; the score is allowed to improve.
  const existingIndex = round.solutions.findIndex(
    (s) => s.playerId === playerId && s.lhs === entry.lhs
  )
  if (existingIndex === -1) round.solutions.push(entry)
  else round.solutions[existingIndex] = entry

  if (player.bestRoundScore === null || entry.score < player.bestRoundScore) {
    player.bestRoundScore = entry.score
  }

  if (room.settings.mode === 'first-to-solve') {
    endRound(room, 'first-to-solve', playerId)
    return ok(true)
  }

  room.revision += 1
  return ok(true)
}

/**
 * Applies one client message. Returns whether the room changed (and therefore
 * needs broadcasting) plus an optional error aimed at the sender.
 */
export function handleClientMessage(
  room: RoomState,
  playerId: string,
  message: ClientMessage,
  now = Date.now()
): HandleResult {
  const player = findPlayer(room, playerId)
  if (!player) return fail('not-in-room', 'You are not seated at this table.')

  switch (message.t) {
    case 'join':
      // Seating is the server's job; a stray join on an already-seated socket is a no-op.
      return ok(false)

    case 'set-name': {
      const name = uniqueName(room, message.name)
      if (name === player.name) return ok(false)
      player.name = name
      room.revision += 1
      return ok(true)
    }

    case 'set-ready': {
      if (player.isHost) return ok(false)
      const ready = Boolean(message.ready)
      if (player.isReady === ready) return ok(false)
      player.isReady = ready
      room.revision += 1
      return ok(true)
    }

    case 'update-settings': {
      if (!isRoomHost(room, playerId)) return fail('not-host', 'Only the host can change the rules.')
      if (room.phase !== 'lobby') return fail('wrong-phase', 'Rules are locked once the match starts.')
      room.settings = sanitizeSettings(message.settings, room.settings)
      room.revision += 1
      return ok(true)
    }

    case 'start-match': {
      if (!isRoomHost(room, playerId)) return fail('not-host', 'Only the host can deal the first round.')
      if (room.phase === 'playing') return fail('wrong-phase', 'The match is already running.')
      if (room.players.length === 0) return fail('wrong-phase', 'Nobody is seated.')
      for (const p of room.players) {
        p.points = 0
        p.bestRoundScore = null
      }
      room.round = null
      room.matchWinnerId = null
      room.hostId = playerId
      dealRound(room, now)
      return ok(true)
    }

    case 'next-round': {
      if (!isRoomHost(room, playerId)) return fail('not-host', 'Only the host can deal the next round.')
      if (room.phase !== 'round-end') return fail('wrong-phase', 'The round has not finished yet.')
      dealRound(room, now)
      return ok(true)
    }

    case 'skip-round': {
      if (!isRoomHost(room, playerId)) return fail('not-host', 'Only the host can skip a round.')
      if (room.phase !== 'playing') return fail('wrong-phase', 'There is no running round to skip.')
      // A host ending a round early still pays out the best board someone has
      // already landed; only a round with no solutions is a true skip.
      endRound(room, room.round && room.round.solutions.length > 0 ? 'host-end' : 'skip')
      return ok(true)
    }

    case 'end-match': {
      if (!isRoomHost(room, playerId)) return fail('not-host', 'Only the host can end the match.')
      const standings = [...room.players].sort((a, b) => b.points - a.points)
      const leader = standings[0]
      room.matchWinnerId = leader && leader.points > 0 ? leader.id : null
      room.phase = 'game-over'
      room.revision += 1
      return ok(true)
    }

    case 'submit':
      return applySubmit(room, playerId, message.solution, now)

    default:
      // Anything outside the union — a hand-crafted payload — must not reach the
      // server as an undefined result, which would crash the message handler.
      return fail('bad-message', 'Unknown message type.')
  }
}

/**
 * Time-driven transitions (round clock expiry). Returns true when the room
 * changed so the caller can broadcast the new snapshot.
 */
export function tickRoom(room: RoomState, now = Date.now()): boolean {
  const round = room.round
  if (room.phase !== 'playing' || !round || round.deadline === null) return false
  if (now < round.deadline) return false
  endRound(room, 'timer')
  return true
}

export function roomIsEmpty(room: RoomState): boolean {
  return room.players.length === 0
}

/** Re-exported so callers do not need to reach into protocol for the card type. */
export type { Card }
