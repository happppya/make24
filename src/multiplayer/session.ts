import { computed, reactive } from 'vue'
import { createLoopbackTransport } from './loopback'
import { randomPlayerName } from './playerNames'
import {
  PROTOCOL_VERSION,
  normalizeRoomCode,
  type ClientMessage,
  type LobbySummary,
  type RoomState,
  type ServerMessage,
} from './protocol'
import {
  createWebSocketTransport,
  joinMessage,
  resolveServerUrl,
  type MultiplayerTransport,
  type TransportHandlers,
} from './transport'

/**
 * Reactive bridge between the table server and the UI.
 *
 * The session only speaks `ClientMessage`/`ServerMessage`; it does not care
 * whether it is attached to a WebSocket or an in-process loopback, so the
 * transport can be swapped for a cloud deployment without touching views.
 *
 * One socket does both jobs: it subscribes to the public lobby list while the
 * selector is open, and the same socket is seated when the player creates a
 * lobby or joins one by code.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface MultiplayerSessionState {
  status: ConnectionStatus
  error: string | null
  roomCode: string
  name: string
  selfId: string | null
  room: RoomState | null
  transportLabel: string
  /** serverTime - local clock, so countdowns match the server's deadline. */
  serverOffsetMs: number
  /** Public lobbies the table is advertising, newest first. */
  lobbies: LobbySummary[]
  /** Connected to the table without a seat: the lobby selector is up. */
  browsing: boolean
}

export const multiplayer = reactive<MultiplayerSessionState>({
  status: 'idle',
  error: null,
  roomCode: '',
  name: randomPlayerName(),
  selfId: null,
  room: null,
  transportLabel: '',
  serverOffsetMs: 0,
  lobbies: [],
  browsing: false,
})

let transport: MultiplayerTransport | null = null
let connectTimer: ReturnType<typeof setTimeout> | null = null
let closingDeliberately = false

export function serverNow(): number {
  return Date.now() + multiplayer.serverOffsetMs
}

export const selfPlayer = computed(() => {
  const room = multiplayer.room
  if (!room || !multiplayer.selfId) return null
  return room.players.find((player) => player.id === multiplayer.selfId) ?? null
})

export const isRoomHost = computed(() => {
  return (
    multiplayer.room !== null &&
    multiplayer.selfId !== null &&
    multiplayer.room.hostId === multiplayer.selfId
  )
})

function clearConnectTimer(): void {
  if (connectTimer) {
    clearTimeout(connectTimer)
    connectTimer = null
  }
}

function teardown(): void {
  clearConnectTimer()
  transport?.close()
  transport = null
}

/** Where the client will connect, for display in the lobby. */
export function tableServerLabel(): string {
  return resolveServerUrl()
}

interface OpenSocketOptions {
  /** Sent as soon as the socket opens; null connects without claiming a seat. */
  greeting: () => ClientMessage | null
  /** Swap point for tests and for alternate hosts (cloud relay, loopback demo…). */
  createTransport?: (handlers: TransportHandlers) => MultiplayerTransport
}

/**
 * Opens one socket and folds its messages into the reactive store. Resolves
 * once the server has answered (a seat or the lobby list) or the attempt has
 * failed, so callers can await "connected" without polling.
 */
function openSocket(options: OpenSocketOptions): Promise<void> {
  teardown()
  closingDeliberately = false
  multiplayer.status = 'connecting'
  multiplayer.error = null
  multiplayer.selfId = null
  multiplayer.room = null
  multiplayer.serverOffsetMs = 0

  return new Promise((resolve) => {
    let settled = false
    const settle = (): void => {
      if (settled) return
      settled = true
      clearConnectTimer()
      resolve()
    }

    const handleMessage = (message: ServerMessage): void => {
      if (message.t === 'welcome') {
        multiplayer.status = 'connected'
        multiplayer.error = null
        multiplayer.selfId = message.selfId
        multiplayer.room = message.room
        multiplayer.roomCode = message.room.code
        multiplayer.browsing = false
        multiplayer.serverOffsetMs = message.serverTime - Date.now()
        settle()
        return
      }
      if (message.t === 'state') {
        multiplayer.serverOffsetMs = message.serverTime - Date.now()
        const current = multiplayer.room
        if (!current || message.room.revision >= current.revision) {
          multiplayer.room = message.room
        }
        return
      }
      if (message.t === 'lobbies') {
        multiplayer.status = 'connected'
        multiplayer.error = null
        multiplayer.lobbies = message.rooms
        multiplayer.serverOffsetMs = message.serverTime - Date.now()
        settle()
        return
      }
      if (message.t === 'error') {
        multiplayer.error = message.message
        // A failed claim leaves the socket open and unseated: the selector stays
        // usable instead of reporting a dead connection.
        if (multiplayer.status === 'connecting') {
          multiplayer.status = 'connected'
          settle()
        }
      }
    }

    const handlers: TransportHandlers = {
      onOpen: () => {
        const greeting = options.greeting()
        if (greeting) transport?.send(greeting)
      },
      onMessage: handleMessage,
      onClose: (info) => {
        if (closingDeliberately) return
        multiplayer.browsing = false
        multiplayer.status = multiplayer.status === 'connected' ? 'disconnected' : 'error'
        multiplayer.error =
          multiplayer.status === 'disconnected'
            ? 'Lost the connection to the table server.'
            : `Could not reach the table server${info.reason ? ` (${info.reason})` : ''}.`
        settle()
      },
    }

    const next = options.createTransport
      ? options.createTransport(handlers)
      : createWebSocketTransport(handlers, resolveServerUrl())

    transport = next
    multiplayer.transportLabel = next.label
    next.connect()

    connectTimer = setTimeout(() => {
      if (multiplayer.status === 'connected') return
      multiplayer.status = 'error'
      multiplayer.error = `No table server answered at ${next.label}. Start it with "npm run dev:server".`
      teardown()
      settle()
    }, 6000)
  })
}

/**
 * Subscribes to the lobby list. The socket stays unseated, so the player can
 * read codes, create a lobby or join one without holding a place at a table.
 */
export function openLobbyBrowser(options: { createTransport?: OpenSocketOptions['createTransport'] } = {}): Promise<void> {
  multiplayer.browsing = true
  if (transport && multiplayer.status === 'connected' && !multiplayer.room) {
    // Already attached: just re-subscribe, e.g. coming back from a table.
    sendToRoom({ t: 'browse' })
    return Promise.resolve()
  }
  return openSocket({
    greeting: () => ({ t: 'browse' }),
    createTransport: options.createTransport,
  })
}

async function ensureBrowserConnection(): Promise<boolean> {
  if (transport && multiplayer.status === 'connected' && !multiplayer.room) return true
  await openLobbyBrowser()
  return multiplayer.status === 'connected'
}

/**
 * Seats this socket in a fresh lobby with a server-assigned code. The creator
 * is the host; `isPublic` decides whether the table is listed for everyone.
 */
export async function createLobby(options: {
  name: string
  isPublic: boolean
}): Promise<void> {
  multiplayer.name = options.name
  multiplayer.error = null
  if (!(await ensureBrowserConnection())) return
  sendToRoom({
    t: 'create-room',
    name: options.name,
    isPublic: options.isPublic,
    protocol: PROTOCOL_VERSION,
  })
}

/** Joins a room by its code — the only way into a private lobby. */
export async function joinLobby(code: string, name: string): Promise<void> {
  const wanted = normalizeRoomCode(code)
  multiplayer.name = name
  multiplayer.error = null
  if (!wanted) {
    multiplayer.error = 'Enter a lobby code to join.'
    return
  }
  multiplayer.roomCode = wanted
  if (!(await ensureBrowserConnection())) return
  sendToRoom(joinMessage(wanted, name))
}

/** Connects straight into a known room (used by the loopback demo and tests). */
export function connectToRoom(options: {
  roomCode: string
  name: string
  createTransport?: OpenSocketOptions['createTransport']
}): Promise<void> {
  multiplayer.name = options.name
  multiplayer.roomCode = options.roomCode
  multiplayer.browsing = false
  return openSocket({
    greeting: () => joinMessage(options.roomCode, options.name),
    createTransport: options.createTransport,
  })
}

/** Offline demo seat backed by the in-process reducer (no sockets). */
export function connectToLocalTable(name: string): Promise<void> {
  return connectToRoom({
    roomCode: 'LOCAL',
    name,
    createTransport: (handlers) => createLoopbackTransport(handlers),
  })
}

export function sendToRoom(message: ClientMessage): void {
  transport?.send(message)
}

export function leaveRoom(): void {
  closingDeliberately = true
  teardown()
  multiplayer.status = 'idle'
  multiplayer.room = null
  multiplayer.selfId = null
  multiplayer.roomCode = ''
  multiplayer.error = null
  multiplayer.lobbies = []
  multiplayer.browsing = false
}
