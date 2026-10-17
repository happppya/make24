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
  /**
   * Seated while a round was already running. They see the table but cannot
   * submit until the next deal, which clears the flag.
   */
  isWaiting: boolean
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
  /** Everyone who took the round. Two or more entries mean the best boards tied. */
  winnerIds: string[]
  endedReason: RoundEndReason | null
}

export interface RoomState {
  code: string
  /** Public rooms show up in the lobby browser; private ones are code-only. */
  isPublic: boolean
  /** Epoch ms the room was created, newest first in the browser. */
  createdAt: number
  /** Bumped on every accepted change so clients can drop stale snapshots. */
  revision: number
  phase: RoomPhase
  hostId: string | null
  players: LobbyPlayer[]
  settings: GameSettings
  round: RoundState | null
  /** Everyone who reached the points target; two or more entries mean a drawn series. */
  matchWinnerIds: string[]
}

/** The browsing view of a room: enough to pick a table without seating you. */
export interface LobbySummary {
  code: string
  isPublic: boolean
  hostName: string
  playerCount: number
  maxPlayers: number
  mode: GameSettings['mode']
  phase: RoomPhase
  createdAt: number
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
  /** Subscribe this socket to the public lobby list. */
  | { t: 'browse' }
  | { t: 'create-room'; name: string; isPublic: boolean; protocol: number }
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
  /** No room holds that code any more. */
  | 'not-found'
  /** Seated mid-round; they play from the next deal. */
  | 'waiting'

export type ServerMessage =
  | {
      t: 'welcome'
      selfId: string
      room: RoomState
      protocol: number
      serverTime: number
    }
  | { t: 'state'; room: RoomState; serverTime: number }
  | { t: 'lobbies'; rooms: LobbySummary[]; serverTime: number }
  | { t: 'error'; code: ServerErrorCode; message: string }

export interface ServerError {
  code: ServerErrorCode
  message: string
}

export const MAX_ROOM_PLAYERS = 8
export const MAX_NAME_LENGTH = 18
export const MAX_ROOM_CODE_LENGTH = 12
/** New rooms get a short code from a 32-character alphabet. */
export const ROOM_CODE_LENGTH = 4

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
