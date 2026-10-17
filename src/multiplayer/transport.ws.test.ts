// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createMultiplayerServer, type MultiplayerServer } from '../../server/server'
import { PROTOCOL_VERSION, type ServerMessage } from './protocol'
import { createLobby, joinLobby, leaveRoom, multiplayer, openLobbyBrowser } from './session'
import { createWebSocketTransport } from './transport'

/**
 * These run in the Node environment: jsdom's WebSocket shim clashes with the
 * Event class it dispatches under test, and Node's own client is the same
 * WebSocket the browser path uses on the wire.
 */

let server: MultiplayerServer | null = null

afterEach(async () => {
  leaveRoom()
  await server?.close()
  server = null
})

async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for condition')
}

describe('WebSocket transport', () => {
  it('opens a lobby through the transport interface', async () => {
    server = await createMultiplayerServer({ port: 0, tickMs: 20 })
    const messages: ServerMessage[] = []

    let transport: ReturnType<typeof createWebSocketTransport> | null = null
    transport = createWebSocketTransport(
      {
        onOpen: () => {
          transport?.send({
            t: 'create-room',
            name: 'Wired',
            isPublic: true,
            protocol: PROTOCOL_VERSION,
          })
        },
        onMessage: (message) => messages.push(message),
      },
      server.url
    )
    transport.connect()

    await waitUntil(() => messages.some((m) => m.t === 'welcome'))
    const welcome = messages.find((m) => m.t === 'welcome')
    if (!welcome || welcome.t !== 'welcome') throw new Error('no welcome')
    expect(welcome.room.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)
    expect(welcome.room.isPublic).toBe(true)
    expect(welcome.room.players[0]!.name).toBe('Wired')

    transport.close()
  })

  it('browses, creates and joins lobbies through the session store', async () => {
    server = await createMultiplayerServer({ port: 0, tickMs: 20 })
    const createTransport = (handlers: Parameters<typeof createWebSocketTransport>[0]) =>
      createWebSocketTransport(handlers, server!.url)

    await openLobbyBrowser({ createTransport })
    expect(multiplayer.status).toBe('connected')
    expect(multiplayer.browsing).toBe(true)
    expect(multiplayer.room).toBeNull()

    await createLobby({ name: 'Store Tester', isPublic: false })
    await waitUntil(() => multiplayer.room !== null)
    expect(multiplayer.browsing).toBe(false)
    expect(multiplayer.room?.players[0]!.name).toBe('Store Tester')
    expect(multiplayer.room?.isPublic).toBe(false)
    expect(multiplayer.room?.players[0]!.isHost).toBe(true)

    // Same socket, unseated: the selector stays usable and reports missing codes.
    leaveRoom()
    await openLobbyBrowser({ createTransport })
    expect(multiplayer.room).toBeNull()
    await joinLobby('ZZZZ', 'Ghost')
    await waitUntil(() => multiplayer.error !== null)
    expect(multiplayer.error).toMatch(/no lobby/i)
    expect(multiplayer.room).toBeNull()
  })

  it('surfaces a helpful error when no server is listening', async () => {
    await openLobbyBrowser({
      createTransport: (handlers) => createWebSocketTransport(handlers, 'ws://127.0.0.1:1/ws'),
    })

    expect(multiplayer.status).toBe('error')
    expect(multiplayer.error).toBeTruthy()
    expect(multiplayer.room).toBeNull()
  })
})
