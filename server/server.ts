import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  addRoomPlayer,
  createRoomState,
  handleClientMessage,
  removeRoomPlayer,
  roomIsEmpty,
  tickRoom,
} from '../src/multiplayer/room'
import {
  PROTOCOL_VERSION,
  normalizeRoomCode,
  type ClientMessage,
  type RoomState,
  type ServerMessage,
} from '../src/multiplayer/protocol'

/**
 * Local multiplayer table server.
 *
 * Deliberately small and dependency-light (`node:http` + `ws`) so the exact same
 * process can run on a laptop, inside a container, or on an Oracle Cloud VM
 * behind Caddy/nginx. All game rules live in `src/multiplayer/room.ts`; this file
 * only moves bytes. Swapping hosts later means keeping this entrypoint and
 * changing PORT/ALLOWED_ORIGIN, or replacing it with another transport that
 * speaks the same JSON messages.
 */

export interface ServerOptions {
  port?: number
  host?: string
  /** Comma-separated allowed browser Origins. '*' (default) allows any. */
  allowedOrigin?: string
  tickMs?: number
  heartbeatMs?: number
  maxRooms?: number
  log?: (line: string) => void
}

export interface MultiplayerServer {
  port: number
  url: string
  httpServer: Server
  roomCount: () => number
  playerCount: () => number
  close: () => Promise<void>
}

interface Session {
  playerId: string
  roomCode: string | null
  isAlive: boolean
}

export async function createMultiplayerServer(options: ServerOptions = {}): Promise<MultiplayerServer> {
  const port = options.port ?? 8787
  const host = options.host ?? '0.0.0.0'
  const allowedOrigins = (options.allowedOrigin ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const tickMs = options.tickMs ?? 250
  const heartbeatMs = options.heartbeatMs ?? 30_000
  const maxRooms = options.maxRooms ?? 200
  const log = options.log ?? (() => {})

  const rooms = new Map<string, RoomState>()
  const sessions = new Map<WebSocket, Session>()

  const seatedPlayers = (): number => {
    let count = 0
    for (const session of sessions.values()) if (session.roomCode) count += 1
    return count
  }

  const httpServer = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          service: 'make24-multiplayer',
          protocol: PROTOCOL_VERSION,
          rooms: rooms.size,
          players: seatedPlayers(),
          uptimeSeconds: Math.round(process.uptime()),
        })
      )
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found. Connect to /ws for the table socket.\n')
  })

  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }
    if (!allowedOrigins.includes('*')) {
      const origin = req.headers.origin
      // Browsers always send Origin; non-browser clients are allowed through.
      if (origin && !allowedOrigins.includes(origin)) {
        socket.destroy()
        return
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  function send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }

  function broadcast(room: RoomState): void {
    const payload: ServerMessage = { t: 'state', room, serverTime: Date.now() }
    const encoded = JSON.stringify(payload)
    for (const [ws, session] of sessions) {
      if (session.roomCode === room.code && ws.readyState === ws.OPEN) {
        ws.send(encoded)
      }
    }
  }

  function getRoom(code: string): RoomState | undefined {
    return rooms.get(code)
  }

  function leaveCurrentRoom(ws: WebSocket): void {
    const session = sessions.get(ws)
    if (!session?.roomCode) return
    const room = getRoom(session.roomCode)
    session.roomCode = null
    if (!room) return
    removeRoomPlayer(room, session.playerId)
    if (roomIsEmpty(room)) {
      rooms.delete(room.code)
      log(`room ${room.code} closed (empty)`)
      return
    }
    broadcast(room)
  }

  function handleJoin(ws: WebSocket, message: Extract<ClientMessage, { t: 'join' }>): void {
    const session = sessions.get(ws)
    if (!session) return

    if (message.protocol !== PROTOCOL_VERSION) {
      send(ws, {
        t: 'error',
        code: 'protocol-mismatch',
        message: `This table speaks protocol v${PROTOCOL_VERSION}; the client sent v${Number(message.protocol)}.`,
      })
      return
    }

    const code = normalizeRoomCode(String(message.room ?? '')) || 'MAIN'
    let room = getRoom(code)

    // Re-sending join while already seated (e.g. clicking "Rejoin") must not
    // duplicate the seat: just refresh the client's snapshot.
    const alreadySeated = room?.players.find((p) => p.id === session.playerId)
    if (room && alreadySeated && session.roomCode === code) {
      send(ws, {
        t: 'welcome',
        selfId: session.playerId,
        room,
        protocol: PROTOCOL_VERSION,
        serverTime: Date.now(),
      })
      return
    }

    if (!room) {
      if (rooms.size >= maxRooms) {
        send(ws, {
          t: 'error',
          code: 'room-full',
          message: 'The server is at capacity. Try again shortly.',
        })
        return
      }
      room = createRoomState(code)
      rooms.set(code, room)
      log(`room ${code} created`)
    }

    if (session.roomCode && session.roomCode !== code) leaveCurrentRoom(ws)

    const seat = addRoomPlayer(room, { id: session.playerId, name: message.name })
    if (seat.error || !seat.player) {
      send(ws, { t: 'error', ...(seat.error ?? { code: 'bad-message', message: 'Could not join.' }) })
      return
    }
    session.roomCode = code
    send(ws, {
      t: 'welcome',
      selfId: session.playerId,
      room,
      protocol: PROTOCOL_VERSION,
      serverTime: Date.now(),
    })
    broadcast(room)
  }

  function handleClientPayload(ws: WebSocket, raw: string): void {
    const session = sessions.get(ws)
    if (!session) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      send(ws, { t: 'error', code: 'bad-message', message: 'Messages must be JSON.' })
      return
    }
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { t?: unknown }).t !== 'string') {
      send(ws, { t: 'error', code: 'bad-message', message: 'Missing message type.' })
      return
    }
    const message = parsed as ClientMessage

    if (message.t === 'join') {
      handleJoin(ws, message)
      return
    }

    if (!session.roomCode) {
      send(ws, { t: 'error', code: 'not-in-room', message: 'Join a room first.' })
      return
    }
    const room = getRoom(session.roomCode)
    if (!room) {
      send(ws, { t: 'error', code: 'not-in-room', message: 'That room no longer exists.' })
      return
    }

    const result = handleClientMessage(room, session.playerId, message, Date.now())
    if (result.error) {
      send(ws, { t: 'error', ...result.error })
    }
    if (result.changed) broadcast(room)
  }

  wss.on('connection', (ws) => {
    sessions.set(ws, { playerId: `p-${randomUUID().slice(0, 8)}`, roomCode: null, isAlive: true })

    ws.on('pong', () => {
      const session = sessions.get(ws)
      if (session) session.isAlive = true
    })
    ws.on('message', (data) => {
      handleClientPayload(ws, data.toString())
    })
    ws.on('close', () => {
      leaveCurrentRoom(ws)
      sessions.delete(ws)
    })
    ws.on('error', () => {
      leaveCurrentRoom(ws)
      sessions.delete(ws)
    })
  })

  const tickHandle = setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      if (tickRoom(room, now)) broadcast(room)
    }
  }, tickMs)

  const heartbeatHandle = setInterval(() => {
    for (const [ws, session] of sessions) {
      if (!session.isAlive) {
        ws.terminate()
        continue
      }
      session.isAlive = false
      try {
        ws.ping()
      } catch {
        ws.terminate()
      }
    }
  }, heartbeatMs)

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      httpServer.off('error', onError)
      resolve()
    }
    httpServer.once('error', onError)
    httpServer.once('listening', onListening)
    httpServer.listen(port, host)
  })

  const address = httpServer.address()
  const boundPort = typeof address === 'object' && address ? address.port : port

  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    clearInterval(tickHandle)
    clearInterval(heartbeatHandle)
    for (const ws of sessions.keys()) ws.terminate()
    sessions.clear()
    rooms.clear()
    await new Promise<void>((resolve) => wss.close(() => resolve()))
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }

  return {
    port: boundPort,
    url: `ws://localhost:${boundPort}/ws`,
    httpServer,
    roomCount: () => rooms.size,
    playerCount: seatedPlayers,
    close,
  }
}
