import {
  addRoomPlayer,
  createRoomState,
  handleClientMessage,
  tickRoom,
} from './room'
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomState,
  type ServerMessage,
} from './protocol'
import type { MultiplayerTransport, TransportHandlers } from './transport'

/**
 * An in-process table: same reducer as the server, no sockets.
 *
 * This is the "swap the transport" proof — the game cannot tell the difference —
 * and it is what the offline demo and some tests ride on. It is deliberately
 * single-seat: real multiplayer goes through the WebSocket server.
 */
export function createLoopbackTransport(
  handlers: TransportHandlers,
  options: { tickMs?: number } = {}
): MultiplayerTransport {
  const room: RoomState = createRoomState('LOCAL')
  const playerId = `p-local-${Math.random().toString(36).slice(2, 8)}`
  let seated = false
  let tickHandle: ReturnType<typeof setInterval> | null = null

  const emit = (message: ServerMessage): void => {
    handlers.onMessage(message)
  }

  /**
   * Snapshots go out as copies, exactly like the WebSocket server's JSON frames.
   * Handing out the live object would leave `multiplayer.room` identical between
   * updates, so watchers that key off the snapshot identity would never refire.
   */
  const snapshot = (): RoomState => JSON.parse(JSON.stringify(room)) as RoomState

  const emitState = (): void => {
    emit({ t: 'state', room: snapshot(), serverTime: Date.now() })
  }

  const seat = (name: string): void => {
    if (seated) {
      // Re-joining an in-process table keeps the original seat.
      emit({
        t: 'welcome',
        selfId: playerId,
        room: snapshot(),
        protocol: PROTOCOL_VERSION,
        serverTime: Date.now(),
      })
      return
    }
    const result = addRoomPlayer(room, { id: playerId, name })
    if (result.error) {
      emit({ t: 'error', ...result.error })
      return
    }
    seated = true
    emit({
      t: 'welcome',
      selfId: playerId,
      room: snapshot(),
      protocol: PROTOCOL_VERSION,
      serverTime: Date.now(),
    })
    emitState()
  }

  return {
    label: 'in-process demo table',
    connect(): void {
      handlers.onOpen?.()
      tickHandle = setInterval(() => {
        if (tickRoom(room, Date.now())) emitState()
      }, options.tickMs ?? 250)
    },
    send(message: ClientMessage): void {
      if (message.t === 'join') {
        seat(String(message.name ?? 'You'))
        return
      }
      if (!seated) {
        emit({ t: 'error', code: 'not-in-room', message: 'Join the table first.' })
        return
      }
      const result = handleClientMessage(room, playerId, message, Date.now())
      if (result.error) emit({ t: 'error', ...result.error })
      if (result.changed) emitState()
    },
    close(): void {
      if (tickHandle) clearInterval(tickHandle)
      tickHandle = null
      seated = false
      handlers.onClose?.({ code: 1000, reason: 'closed locally', wasClean: true })
    },
  }
}
