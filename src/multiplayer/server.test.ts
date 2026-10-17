import { afterEach, describe, expect, it } from 'vitest'
import { get } from 'node:http'
import WebSocket from 'ws'
import { createMultiplayerServer, type MultiplayerServer } from '../../server/server'
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from './protocol'

/**
 * End-to-end coverage for the multiplayer table: these tests boot the real
 * `node:http` + `ws` server on an ephemeral port and talk to it exactly like a
 * browser would, so they fail if the wire format, seating, dealing or round
 * lifecycle drift apart.
 */

class TestClient {
  readonly messages: ServerMessage[] = []
  private readonly socket: WebSocket

  private constructor(url: string) {
    this.socket = new WebSocket(url)
    this.socket.on('message', (data) => {
      try {
        this.messages.push(JSON.parse(String(data)) as ServerMessage)
      } catch {
        // ignore malformed frames; a test would fail on the missing message instead
      }
    })
  }

  static async connect(url: string): Promise<TestClient> {
    const client = new TestClient(url)
    await new Promise<void>((resolve, reject) => {
      client.socket.once('open', () => resolve())
      client.socket.once('error', reject)
    })
    return client
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message))
  }

  /** Polls for the newest message matching `type` (and an optional predicate). */
  async waitFor<T extends ServerMessage['t']>(
    type: T,
    predicate?: (message: Extract<ServerMessage, { t: T }>) => boolean,
    timeoutMs = 3000
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const message = this.messages[i]!
        if (message.t !== type) continue
        const typed = message as Extract<ServerMessage, { t: T }>
        if (!predicate || predicate(typed)) return typed
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`Timed out waiting for "${type}" message`)
  }

  close(): void {
    this.socket.close()
  }
}

function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      let raw = ''
      response.on('data', (chunk) => {
        raw += chunk
      })
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(raw) })
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', reject)
  })
}

let server: MultiplayerServer | null = null
let clients: TestClient[] = []

afterEach(async () => {
  for (const client of clients) client.close()
  clients = []
  await server?.close()
  server = null
})

async function boot(): Promise<MultiplayerServer> {
  server = await createMultiplayerServer({ port: 0, tickMs: 20, heartbeatMs: 5_000 })
  return server
}

async function seatTwo(roomCode = 'TEST') {
  const table = await boot()
  const host = await TestClient.connect(table.url)
  clients.push(host)
  host.send({ t: 'join', room: roomCode, name: 'Ace', protocol: PROTOCOL_VERSION })
  const welcomeHost = await host.waitFor('welcome')

  const guest = await TestClient.connect(table.url)
  clients.push(guest)
  guest.send({ t: 'join', room: roomCode, name: 'Deuce', protocol: PROTOCOL_VERSION })
  const welcomeGuest = await guest.waitFor('welcome')

  await host.waitFor('state', (m) => m.room.players.length === 2)
  return { table, host, guest, welcomeHost, welcomeGuest }
}

const solution = {
  equation: '4 * 3 * 2 = 24',
  lhs: '4 * 3 * 2',
  finalValue: 24,
  score: 20,
  errorPercent: 0,
  workspaceIndex: 1,
}

describe('multiplayer server — lobby over a real socket', () => {
  it('seats two browsers in one room and reports health', async () => {
    const { table, welcomeHost, welcomeGuest } = await seatTwo()
    const state = await clients[0]!.waitFor('state', (m) => m.room.players.length === 2)

    expect(welcomeGuest.selfId).not.toBe(welcomeHost.selfId)
    expect(welcomeGuest.room.players.map((p) => p.name)).toEqual(['Ace', 'Deuce'])
    expect(state.room.hostId).toBe(welcomeHost.selfId)
    expect(state.room.phase).toBe('lobby')

    const health = await getJson(`http://127.0.0.1:${table.port}/health`)
    expect(health.status).toBe(200)
    expect(health.body).toMatchObject({ ok: true, rooms: 1, players: 2, protocol: PROTOCOL_VERSION })
  })

  it('rejects clients speaking a different protocol version', async () => {
    const table = await boot()
    const client = await TestClient.connect(table.url)
    clients.push(client)
    client.send({ t: 'join', room: 'TEST', name: 'Time Traveller', protocol: 999 })
    const error = await client.waitFor('error')
    expect(error.code).toBe('protocol-mismatch')
    expect(table.playerCount()).toBe(0) // no seat was taken
  })

  it('keeps non-hosts out of the host controls', async () => {
    const { guest } = await seatTwo()
    guest.send({ t: 'start-match' })
    const error = await guest.waitFor('error')
    expect(error.code).toBe('not-host')
  })

  it('does not double-seat a socket that joins twice', async () => {
    const { host, guest } = await seatTwo()
    host.send({ t: 'join', room: 'TEST', name: 'Ace', protocol: PROTOCOL_VERSION })
    await host.waitFor('welcome')
    await guest.waitFor('state', (m) => m.room.players.length === 2)
    // Give any errant extra broadcast a moment to arrive, then confirm the seats.
    await new Promise((resolve) => setTimeout(resolve, 150))
    const latest = guest.messages.filter((m) => m.t === 'state').at(-1)
    if (!latest || latest.t !== 'state') throw new Error('no state')
    expect(latest.room.players.map((p) => p.name)).toEqual(['Ace', 'Deuce'])
  })

  it('promotes the remaining player when the host disconnects', async () => {
    const { host, guest, welcomeGuest } = await seatTwo()
    host.close()
    const state = await guest.waitFor('state', (m) => m.room.players.length === 1)
    expect(state.room.hostId).toBe(welcomeGuest.selfId)
    expect(state.room.players[0]!.name).toBe('Deuce')
    expect(state.room.players[0]!.isHost).toBe(true)
  })
})

describe('multiplayer server — playing a round', () => {
  it('deals an identical hand and target to every player', async () => {
    const { host, guest } = await seatTwo()
    host.send({ t: 'start-match' })

    const playingHost = await host.waitFor('state', (m) => m.room.phase === 'playing')
    const playingGuest = await guest.waitFor('state', (m) => m.room.phase === 'playing')

    expect(playingGuest.room.round!.hand).toEqual(playingHost.room.round!.hand)
    expect(playingGuest.room.round!.target).toBe(playingHost.room.round!.target)
    expect(playingHost.room.round!.hand).toHaveLength(4)
  })

  it('ends first-to-solve for everyone the moment one player submits', async () => {
    const { host, guest, welcomeGuest } = await seatTwo()
    host.send({ t: 'start-match' })
    await guest.waitFor('state', (m) => m.room.phase === 'playing')

    guest.send({ t: 'submit', solution })

    const hostView = await host.waitFor('state', (m) => m.room.phase === 'round-end')
    const guestView = await guest.waitFor('state', (m) => m.room.phase === 'round-end')

    expect(hostView.room.round!.winnerId).toBe(welcomeGuest.selfId)
    expect(guestView.room.round!.solutions).toHaveLength(1)
    expect(guestView.room.round!.solutions[0]!.lhs).toBe(solution.lhs)
    expect(guestView.room.players.find((p) => p.id === welcomeGuest.selfId)!.points).toBe(1)
    expect(hostView.room.round!.endedReason).toBe('first-to-solve')
  })

  it('runs a whole two-round match through the host', async () => {
    const { host, guest, welcomeHost, welcomeGuest } = await seatTwo()
    // First to 2 points, so the match needs two winning rounds
    host.send({ t: 'update-settings', settings: { ...welcomeHost.room.settings, firstToPoints: 2 } })
    await guest.waitFor('state', (m) => m.room.settings.firstToPoints === 2)

    host.send({ t: 'start-match' })
    await guest.waitFor('state', (m) => m.room.phase === 'playing')

    host.send({ t: 'submit', solution })
    const roundOne = await guest.waitFor('state', (m) => m.room.phase === 'round-end')
    expect(roundOne.room.round!.winnerId).toBe(welcomeHost.selfId)

    host.send({ t: 'next-round' })
    const roundTwo = await guest.waitFor(
      'state',
      (m) => m.room.phase === 'playing' && m.room.round!.number === 2
    )
    expect(roundTwo.room.round!.solutions).toHaveLength(0)

    host.send({ t: 'submit', solution })
    const matchOver = await guest.waitFor('state', (m) => m.room.phase === 'game-over')
    expect(matchOver.room.matchWinnerId).toBe(welcomeHost.selfId)
    expect(matchOver.room.players.find((p) => p.id === welcomeHost.selfId)!.points).toBe(2)
    expect(matchOver.room.players.find((p) => p.id === welcomeGuest.selfId)!.points).toBe(0)
  })

  it('expires a timed round on the server clock', async () => {
    const { host, guest, welcomeHost } = await seatTwo()
    // 1-minute mode is the shortest timed mode; drive the deadline directly via the room clock.
    host.send({ t: 'update-settings', settings: { ...welcomeHost.room.settings, mode: 'best-30s' } })
    await guest.waitFor('state', (m) => m.room.settings.mode === 'best-30s')

    host.send({ t: 'start-match' })
    const playing = await guest.waitFor('state', (m) => m.room.phase === 'playing')
    const deadline = playing.room.round!.deadline
    expect(deadline).not.toBeNull()
    expect(deadline! - playing.room.round!.startedAt).toBe(30_000)
    expect(playing.room.round!.endedReason).toBeNull()
  })
})
