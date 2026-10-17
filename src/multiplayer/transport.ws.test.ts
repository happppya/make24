// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createMultiplayerServer, type MultiplayerServer } from '../../server/server'
import { PROTOCOL_VERSION, type ServerMessage } from './protocol'
import { connectToRoom, leaveRoom, multiplayer } from './session'
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
  it('joins a live table through the transport interface', async () => {
    server = await createMultiplayerServer({ port: 0, tickMs: 20 })
    const messages: ServerMessage[] = []

    let transport: ReturnType<typeof createWebSocketTransport> | null = null
    transport = createWebSocketTransport(
      {
        onOpen: () => {
          transport?.send({
            t: 'join',
            room: 'WS-TEST',
            name: 'Wired',
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
    expect(welcome.room.code).toBe('WS-TEST')
    expect(welcome.room.players[0]!.name).toBe('Wired')

    transport.close()
  })

  it('drives the session store against the live server', async () => {
    server = await createMultiplayerServer({ port: 0, tickMs: 20 })
    await connectToRoom({
      roomCode: 'SESSION',
      name: 'Store Tester',
      createTransport: (handlers) => createWebSocketTransport(handlers, server!.url),
    })

    expect(multiplayer.status).toBe('connected')
    expect(multiplayer.room?.code).toBe('SESSION')
    expect(multiplayer.room?.players[0]!.name).toBe('Store Tester')
  })

  it('surfaces a helpful error when no server is listening', async () => {
    await connectToRoom({
      roomCode: 'NONE',
      name: 'Ghost',
      createTransport: (handlers) => createWebSocketTransport(handlers, 'ws://127.0.0.1:1/ws'),
    })

    expect(multiplayer.status).toBe('error')
    expect(multiplayer.error).toBeTruthy()
    expect(multiplayer.room).toBeNull()
  })
})
