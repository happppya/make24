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

/** Host creates a lobby, then the guest joins it by the code the server handed out. */
async function seatTwo(options: { isPublic?: boolean } = {}) {
  const table = await boot()
  const host = await TestClient.connect(table.url)
  clients.push(host)
  host.send({
    t: 'create-room',
    name: 'Ace',
    isPublic: options.isPublic ?? true,
    protocol: PROTOCOL_VERSION,
  })
  const welcomeHost = await host.waitFor('welcome')
  const roomCode = welcomeHost.room.code

  const guest = await TestClient.connect(table.url)
  clients.push(guest)
  guest.send({ t: 'join', room: roomCode, name: 'Deuce', protocol: PROTOCOL_VERSION })
  const welcomeGuest = await guest.waitFor('welcome')

  await host.waitFor('state', (m) => m.room.players.length === 2)
  return { table, host, guest, welcomeHost, welcomeGuest, roomCode }
}

async function latestSettings(client: TestClient) {
  const welcome = await client.waitFor('welcome')
  return welcome.room.settings
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
    const { host, guest, roomCode } = await seatTwo()
    host.send({ t: 'join', room: roomCode, name: 'Ace', protocol: PROTOCOL_VERSION })
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

  it('hands the host badge to the oldest remaining player, not the newest', async () => {
    const { table, host, guest, welcomeGuest, roomCode } = await seatTwo()

    const third = await TestClient.connect(table.url)
    clients.push(third)
    third.send({ t: 'join', room: roomCode, name: 'Trey', protocol: PROTOCOL_VERSION })
    await third.waitFor('welcome')
    await guest.waitFor('state', (m) => m.room.players.length === 3)

    host.close()
    const state = await guest.waitFor(
      'state',
      (m) => m.room.players.some((p) => p.name === 'Deuce') && m.room.hostId === welcomeGuest.selfId
    )
    expect(state.room.hostId).toBe(welcomeGuest.selfId)
    expect(state.room.players.map((p) => p.name)).toEqual(['Deuce', 'Trey'])
  })
})

describe('multiplayer server — lobby browser', () => {
  it('lists public lobbies with a readable code and keeps private ones off the board', async () => {
    const table = await boot()

    const publicHost = await TestClient.connect(table.url)
    clients.push(publicHost)
    publicHost.send({ t: 'create-room', name: 'Ace', isPublic: true, protocol: PROTOCOL_VERSION })
    const publicWelcome = await publicHost.waitFor('welcome')
    expect(publicWelcome.room.isPublic).toBe(true)
    // No 0/O or 1/I: a code that can be read aloud without ambiguity.
    expect(publicWelcome.room.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)

    const privateHost = await TestClient.connect(table.url)
    clients.push(privateHost)
    privateHost.send({ t: 'create-room', name: 'Cipher', isPublic: false, protocol: PROTOCOL_VERSION })
    const privateWelcome = await privateHost.waitFor('welcome')
    expect(privateWelcome.room.code).not.toBe(publicWelcome.room.code)

    const browser = await TestClient.connect(table.url)
    clients.push(browser)
    browser.send({ t: 'browse' })
    const list = await browser.waitFor('lobbies')

    expect(list.rooms.map((row) => row.code)).toEqual([publicWelcome.room.code])
    expect(list.rooms[0]).toMatchObject({
      hostName: 'Ace',
      playerCount: 1,
      isPublic: true,
      phase: 'lobby',
    })

    // A private lobby still admits anyone holding its code.
    const friend = await TestClient.connect(table.url)
    clients.push(friend)
    friend.send({
      t: 'join',
      room: privateWelcome.room.code,
      name: 'Friend',
      protocol: PROTOCOL_VERSION,
    })
    const friendWelcome = await friend.waitFor('welcome')
    expect(friendWelcome.room.code).toBe(privateWelcome.room.code)
    expect(friendWelcome.room.players.map((p) => p.name)).toEqual(['Cipher', 'Friend'])
  })

  it('pushes a fresh lobby board to browsers when a room appears', async () => {
    const table = await boot()
    const browser = await TestClient.connect(table.url)
    clients.push(browser)
    browser.send({ t: 'browse' })
    const empty = await browser.waitFor('lobbies')
    expect(empty.rooms).toHaveLength(0)

    const host = await TestClient.connect(table.url)
    clients.push(host)
    host.send({ t: 'create-room', name: 'Opener', isPublic: true, protocol: PROTOCOL_VERSION })
    const welcome = await host.waitFor('welcome')

    const listed = await browser.waitFor('lobbies', (m) => m.rooms.length === 1)
    expect(listed.rooms[0]!.code).toBe(welcome.room.code)
  })

  it('turns away a code that no lobby owns', async () => {
    const table = await boot()
    const client = await TestClient.connect(table.url)
    clients.push(client)
    client.send({ t: 'join', room: 'ZZZZ', name: 'Lost', protocol: PROTOCOL_VERSION })
    const error = await client.waitFor('error')
    expect(error.code).toBe('not-found')
    expect(table.roomCount()).toBe(0)
  })

  it('seats a mid-round joiner as a spectator until the next deal', async () => {
    const { table, host, roomCode } = await seatTwo()
    host.send({
      t: 'update-settings',
      settings: { ...(await latestSettings(host)), mode: 'best-30s' },
    })
    await host.waitFor('state', (m) => m.room.settings.mode === 'best-30s')

    host.send({ t: 'start-match' })
    await host.waitFor('state', (m) => m.room.phase === 'playing')

    const late = await TestClient.connect(table.url)
    clients.push(late)
    late.send({ t: 'join', room: roomCode, name: 'Late', protocol: PROTOCOL_VERSION })
    const lateWelcome = await late.waitFor('welcome')
    expect(lateWelcome.room.players.find((p) => p.name === 'Late')!.isWaiting).toBe(true)

    late.send({ t: 'submit', solution })
    const refused = await late.waitFor('error')
    expect(refused.code).toBe('waiting')

    host.send({ t: 'skip-round' })
    await host.waitFor('state', (m) => m.room.phase === 'round-end')
    host.send({ t: 'next-round' })

    const nextDeal = await late.waitFor(
      'state',
      (m) => m.room.phase === 'playing' && m.room.round!.number === 2
    )
    expect(nextDeal.room.players.find((p) => p.name === 'Late')!.isWaiting).toBe(false)

    late.send({ t: 'submit', solution })
    await late.waitFor('state', (m) => m.room.round!.solutions.length === 1)
    host.send({ t: 'skip-round' })
    const paid = await late.waitFor(
      'state',
      (m) => m.room.phase === 'round-end' && m.room.round!.number === 2
    )
    expect(paid.room.round!.winnerIds).toEqual([lateWelcome.selfId])
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

    expect(hostView.room.round!.winnerIds).toEqual([welcomeGuest.selfId])
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
    expect(roundOne.room.round!.winnerIds).toEqual([welcomeHost.selfId])

    host.send({ t: 'next-round' })
    const roundTwo = await guest.waitFor(
      'state',
      (m) => m.room.phase === 'playing' && m.room.round!.number === 2
    )
    expect(roundTwo.room.round!.solutions).toHaveLength(0)

    host.send({ t: 'submit', solution })
    const matchOver = await guest.waitFor('state', (m) => m.room.phase === 'game-over')
    expect(matchOver.room.matchWinnerIds).toEqual([welcomeHost.selfId])
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
