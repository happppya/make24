import type { Card, GameSettings, SubmittedSolution } from '../engine/types'

/**
 * Wire format for the multiplayer table.
 *
 * Nothing here knows how the messages travel: the browser talks over a
 * WebSocket today, but the same shapes work over a Durable Object, a socket
 * relay, or an in-process loopback (see `loopback.ts`). Keep this file free of
 * DOM and Node APIs so the server and the client can both import it.
 */

export const PROTOCOL_VERSION = 1

export type RoomPhase = 'lobby' | 'playing' | 'round-end' | 'game-over'

export type RoundEndReason = 'first-to-solve' | 'timer' | 'skip' | 'host-end'

export interface LobbyPlayer {
  id: string
  name: string
  isHost: boolean
  isReady: boolean
  points: number
  bestRoundScore: number | null
  connected: boolean
}

export interface RoundState {
  /** 1-based round index within the match. */
  number: number
  target: number
  hand: Card[]
  startedAt: number
  /** Epoch ms when timed modes expire; null for first-to-solve. */
  deadline: number | null
  solutions: SubmittedSolution[]
  winnerId: string | null
  endedReason: RoundEndReason | null
}

export interface RoomState {
  code: string
  /** Bumped on every accepted change so clients can drop stale snapshots. */
  revision: number
  phase: RoomPhase
  hostId: string | null
  players: LobbyPlayer[]
  settings: GameSettings
  round: RoundState | null
  matchWinnerId: string | null
}

/** What a client may claim about its own solution; identity and timing are set by the server. */
export interface SubmittedSolutionPayload {
  equation: string
  lhs: string
  finalValue: number
  score: number
  errorPercent: number
  workspaceIndex: number
}

export type ClientMessage =
  | { t: 'join'; room: string; name: string; protocol: number }
  | { t: 'set-name'; name: string }
  | { t: 'set-ready'; ready: boolean }
  | { t: 'update-settings'; settings: GameSettings }
  | { t: 'start-match' }
  | { t: 'next-round' }
  | { t: 'skip-round' }
  | { t: 'end-match' }
  | { t: 'submit'; solution: SubmittedSolutionPayload }

export type ServerErrorCode =
  | 'bad-message'
  | 'protocol-mismatch'
  | 'room-full'
  | 'not-host'
  | 'wrong-phase'
  | 'not-in-room'

export type ServerMessage =
  | {
      t: 'welcome'
      selfId: string
      room: RoomState
      protocol: number
      serverTime: number
    }
  | { t: 'state'; room: RoomState; serverTime: number }
  | { t: 'error'; code: ServerErrorCode; message: string }

export interface ServerError {
  code: ServerErrorCode
  message: string
}

export const MAX_ROOM_PLAYERS = 8
export const MAX_NAME_LENGTH = 18
export const MAX_ROOM_CODE_LENGTH = 12

/** Timed modes are the only ones with a round clock. */
export function modeDurationSeconds(mode: GameSettings['mode']): number | null {
  switch (mode) {
    case 'first-to-solve':
      return null
    case 'best-30s':
      return 30
    case 'best-1m':
      return 60
    case 'best-3m':
      return 180
    case 'best-5m':
      return 300
    case 'best-10m':
      return 600
  }
}

export function normalizeRoomCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_ROOM_CODE_LENGTH)
}

export function sanitizeName(raw: string, fallback = 'Player'): string {
  const trimmed = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
  return trimmed.length > 0 ? trimmed : fallback
}
