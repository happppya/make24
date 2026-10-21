import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  addRoomPlayer,
  createRoomState,
  generateRoomCode,
  handleClientMessage,
  removeRoomPlayer,
  roomIsEmpty,
  tickRoom,
} from '../src/multiplayer/room'
import {
  MAX_ROOM_PLAYERS,
  PROTOCOL_VERSION,
  normalizeRoomCode,
  sanitizeName,
  type ClientMessage,
  type LobbySummary,
  type RoomState,
  type ServerMessage,
} from '../src/multiplayer/protocol'
import {
  createPuzzle,
  puzzlePeriod,
  validatePuzzleAttempt,
  type PeriodicPuzzleKind,
  type PuzzleDefinition,
} from '../src/engine/puzzles'
import { PuzzleLeaderboardStore, normalizePlayerName } from './puzzleLeaderboard'

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
  /** JSON file for calendar puzzle boards; null keeps them in memory. */
  puzzleLeaderboardPath?: string | null
  /** Injectable clock so puzzle HTTP tests can pin a UTC period. */
  now?: () => number
}

/** Largest client frame we will even read; the biggest real message is a settings push. */
const MAX_MESSAGE_BYTES = 32 * 1024

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
  /** Wants the public lobby list pushed on every change. */
  isBrowsing: boolean
  isAlive: boolean
}

/** Public rooms a browser may see, newest first, capped for a readable list. */
const MAX_LISTED_ROOMS = 50

/** JSON bodies are tiny boards; reject anything that could be an attack payload. */
const MAX_PUZZLE_BODY_BYTES = 32 * 1024

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string }

function readJsonBody(req: IncomingMessage): Promise<JsonBodyResult> {
  return new Promise((resolve) => {
    let size = 0
    let tooLarge = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_PUZZLE_BODY_BYTES) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        resolve({ ok: false, status: 413, error: 'That submission is too large.' })
        return
      }
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      } catch {
        resolve({ ok: false, status: 400, error: 'Submissions must be JSON.' })
      }
    })
    req.on('error', () => {
      resolve({ ok: false, status: 400, error: 'Could not read the submission.' })
    })
  })
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
  const now = options.now ?? (() => Date.now())

  const rooms = new Map<string, RoomState>()
  const sessions = new Map<WebSocket, Session>()
  const puzzleBoards = new PuzzleLeaderboardStore({
    filePath: options.puzzleLeaderboardPath ?? null,
    log,
  })
  const puzzleCache = new Map<string, PuzzleDefinition>()

  const seatedPlayers = (): number => {
    let count = 0
    for (const session of sessions.values()) if (session.roomCode) count += 1
    return count
  }

  /** The current period's puzzle, cached by kind + key. */
  function currentPuzzle(kind: PeriodicPuzzleKind, key: string): PuzzleDefinition | null {
    const currentKey = puzzlePeriod(kind, new Date(now())).key
    if (currentKey !== key) return null
    const cacheKey = `${kind}:${key}`
    const cached = puzzleCache.get(cacheKey)
    if (cached) return cached
    const puzzle = createPuzzle(kind, new Date(now()))
    puzzleCache.set(cacheKey, puzzle)
    return puzzle
  }

  async function handlePuzzleHttp(
    req: IncomingMessage,
    res: import('node:http').ServerResponse,
    kind: PeriodicPuzzleKind,
    key: string
  ): Promise<void> {
    const boardKey = `${kind}:${key}`
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ entries: puzzleBoards.top(boardKey), serverTime: now() }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET, POST, OPTIONS' })
      res.end(JSON.stringify({ error: 'Use GET or POST.' }))
      return
    }

    const puzzle = currentPuzzle(kind, key)
    if (!puzzle) {
      res.writeHead(409, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'That puzzle has closed.' }))
      return
    }

    const body = await readJsonBody(req)
    if (!body.ok) {
      res.writeHead(body.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: body.error }))
      return
    }
    const payload =
      body.value && typeof body.value === 'object'
        ? (body.value as { playerName?: unknown; expression?: unknown })
        : null
    const playerName = normalizePlayerName(payload?.playerName)
    if (!playerName) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Choose a name before submitting a score.' }))
      return
    }

    const attempt = validatePuzzleAttempt(puzzle, payload?.expression)
    if (!attempt.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: attempt.error }))
      return
    }

    const result = puzzleBoards.submit(boardKey, {
      playerName,
      score: attempt.score,
      equation: attempt.equation,
      lhs: attempt.lhs,
      finalValue: attempt.finalValue,
      submittedAt: now(),
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        entries: result.entries,
        rank: result.rank,
        improved: result.improved,
        serverTime: now(),
      })
    )
  }

  const httpServer = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const puzzleMatch = /^\/puzzles\/(hourly|daily|daily-2|weekly)\/([^/]+)\/leaderboard$/.exec(
      url.pathname
    )
    if (puzzleMatch) {
      void handlePuzzleHttp(
        req,
        res,
        puzzleMatch[1] as PeriodicPuzzleKind,
        decodeURIComponent(puzzleMatch[2]!)
      ).catch((error) => {
        log(`puzzle request failed: ${error instanceof Error ? error.message : String(error)}`)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'The leaderboard could not be updated.' }))
        }
      })
      return
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          service: 'make24-multiplayer',
          protocol: PROTOCOL_VERSION,
          rooms: rooms.size,
          players: seatedPlayers(),
          puzzles: puzzleBoards.boardCount(),
          uptimeSeconds: Math.round(process.uptime()),
        })
      )
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found. Connect to /ws for the table socket.\n')
  })

  // `maxPayload` keeps a hostile client from making the process buffer megabytes
  // of JSON; oversized frames are closed by ws before they reach the reducer.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

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
    // Every room change can move a row in the browser (players, phase, code gone).
    broadcastLobbies()
  }

  /** Only public rooms are listed; private ones exist solely as a code you were told. */
  function lobbySummaries(): LobbySummary[] {
    const summaries: LobbySummary[] = []
    for (const room of rooms.values()) {
      if (!room.isPublic) continue
      summaries.push({
        code: room.code,
        isPublic: true,
        hostName: room.players.find((player) => player.isHost)?.name ?? 'Open table',
        playerCount: room.players.length,
        maxPlayers: MAX_ROOM_PLAYERS,
        mode: room.settings.mode,
        phase: room.phase,
        createdAt: room.createdAt,
      })
    }
    summaries.sort((a, b) => b.createdAt - a.createdAt)
    return summaries.slice(0, MAX_LISTED_ROOMS)
  }

  function broadcastLobbies(): void {
    const payload: ServerMessage = { t: 'lobbies', rooms: lobbySummaries(), serverTime: Date.now() }
    const encoded = JSON.stringify(payload)
    for (const [ws, session] of sessions) {
      if (session.isBrowsing && !session.roomCode && ws.readyState === ws.OPEN) {
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
      // A listed room just vanished; browsers must hear about it.
      broadcastLobbies()
      return
    }
    broadcast(room)
  }

  function welcome(ws: WebSocket, session: Session, room: RoomState): void {
    send(ws, {
      t: 'welcome',
      selfId: session.playerId,
      room,
      protocol: PROTOCOL_VERSION,
      serverTime: Date.now(),
    })
  }

  function handleCreateRoom(
    ws: WebSocket,
    message: Extract<ClientMessage, { t: 'create-room' }>
  ): void {
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
    if (rooms.size >= maxRooms) {
      send(ws, {
        t: 'error',
        code: 'room-full',
        message: 'The server is at capacity. Try again shortly.',
      })
      return
    }

    if (session.roomCode) leaveCurrentRoom(ws)

    const code = generateRoomCode((candidate) => rooms.has(candidate))
    const room = createRoomState(code, {
      isPublic: Boolean(message.isPublic),
      createdAt: Date.now(),
    })
    const seat = addRoomPlayer(room, { id: session.playerId, name: sanitizeName(message.name) })
    if (seat.error || !seat.player) {
      send(ws, { t: 'error', ...(seat.error ?? { code: 'bad-message', message: 'Could not create the lobby.' }) })
      return
    }
    rooms.set(room.code, room)
    session.roomCode = room.code
    session.isBrowsing = false
    log(`room ${room.code} created (${room.isPublic ? 'public' : 'private'})`)
    welcome(ws, session, room)
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

    const code = normalizeRoomCode(String(message.room ?? ''))
    if (!code) {
      send(ws, { t: 'error', code: 'bad-message', message: 'Enter a lobby code to join.' })
      return
    }
    const room = getRoom(code)

    // Re-sending join while already seated (e.g. clicking "Rejoin") must not
    // duplicate the seat: just refresh the client's snapshot.
    const alreadySeated = room?.players.find((p) => p.id === session.playerId)
    if (room && alreadySeated && session.roomCode === code) {
      welcome(ws, session, room)
      return
    }

    if (!room) {
      send(ws, {
        t: 'error',
        code: 'not-found',
        message: `No lobby with the code ${code}. Check the code, or create a lobby.`,
      })
      return
    }

    if (session.roomCode && session.roomCode !== code) leaveCurrentRoom(ws)

    const seat = addRoomPlayer(room, { id: session.playerId, name: message.name })
    if (seat.error || !seat.player) {
      send(ws, { t: 'error', ...(seat.error ?? { code: 'bad-message', message: 'Could not join.' }) })
      return
    }
    session.roomCode = room.code
    session.isBrowsing = false
    welcome(ws, session, room)
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

    if (message.t === 'browse') {
      session.isBrowsing = true
      send(ws, { t: 'lobbies', rooms: lobbySummaries(), serverTime: Date.now() })
      return
    }

    if (message.t === 'create-room') {
      handleCreateRoom(ws, message)
      return
    }

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
    sessions.set(ws, {
      playerId: `p-${randomUUID().slice(0, 8)}`,
      roomCode: null,
      isBrowsing: false,
      isAlive: true,
    })

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
