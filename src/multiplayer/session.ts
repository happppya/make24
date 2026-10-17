import { computed, reactive } from 'vue'
import { createLoopbackTransport } from './loopback'
import type { ClientMessage, RoomState, ServerMessage } from './protocol'
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
}

export const multiplayer = reactive<MultiplayerSessionState>({
  status: 'idle',
  error: null,
  roomCode: 'MAIN',
  name: 'Player',
  selfId: null,
  room: null,
  transportLabel: '',
  serverOffsetMs: 0,
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

export function connectToRoom(options: {
  roomCode: string
  name: string
  /** Swap point for tests and for alternate hosts (cloud relay, loopback demo…). */
  createTransport?: (handlers: TransportHandlers) => MultiplayerTransport
}): Promise<void> {
  teardown()
  closingDeliberately = false
  multiplayer.status = 'connecting'
  multiplayer.error = null
  multiplayer.selfId = null
  multiplayer.room = null
  multiplayer.roomCode = options.roomCode
  multiplayer.name = options.name
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
      if (message.t === 'error') {
        multiplayer.error = message.message
      }
    }

    const handlers: TransportHandlers = {
      onOpen: () => {
        transport?.send(joinMessage(options.roomCode, options.name))
      },
      onMessage: handleMessage,
      onClose: (info) => {
        if (closingDeliberately) return
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
  multiplayer.error = null
}
