import { afterEach, describe, expect, it } from 'vitest'
import { watch } from 'vue'
import {
  connectToLocalTable,
  isRoomHost,
  leaveRoom,
  multiplayer,
  sendToRoom,
} from './session'

afterEach(() => {
  leaveRoom()
})

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for condition')
}

describe('multiplayer session — swappable transport', () => {
  it('plays a full round over the in-process loopback transport', async () => {
    await connectToLocalTable('Solo Tester')

    expect(multiplayer.status).toBe('connected')
    expect(multiplayer.selfId).not.toBeNull()
    expect(multiplayer.room?.players).toHaveLength(1)
    expect(isRoomHost.value).toBe(true)

    sendToRoom({ t: 'start-match' })
    await waitUntil(() => multiplayer.room?.phase === 'playing')
    expect(multiplayer.room?.round?.hand).toHaveLength(4)
    expect(multiplayer.room?.round?.target).toBe(24)

    sendToRoom({
      t: 'submit',
      solution: {
        equation: '4 * 3 * 2 = 24',
        lhs: '4 * 3 * 2',
        finalValue: 24,
        score: 20,
        errorPercent: 0,
        workspaceIndex: 1,
      },
    })
    await waitUntil(() => multiplayer.room?.phase === 'round-end')

    expect(multiplayer.room?.round?.winnerId).toBe(multiplayer.selfId)
    expect(multiplayer.room?.players[0]?.points).toBe(1)
  })

  it('publishes a fresh snapshot for every state message', async () => {
    await connectToLocalTable('Snapshot Tester')
    const phases: string[] = []
    const stop = watch(
      () => multiplayer.room,
      (room) => {
        if (room) phases.push(room.phase)
      }
    )

    const seated = multiplayer.room
    sendToRoom({ t: 'start-match' })
    await waitUntil(() => multiplayer.room?.phase === 'playing')

    // The UI mirrors the room with a watcher on this reference, so each update
    // has to arrive as a new object or the screen would never leave the lobby.
    expect(multiplayer.room).not.toBe(seated)
    expect(phases).toContain('playing')
    stop()
  })

  it('only lets the host seat driver change the rules', async () => {
    await connectToLocalTable('Host Tester')
    sendToRoom({ t: 'start-match' })
    await waitUntil(() => multiplayer.room?.phase === 'playing')

    sendToRoom({
      t: 'update-settings',
      settings: { ...multiplayer.room!.settings, numCards: 9 },
    })
    await waitUntil(() => multiplayer.error !== null)
    expect(multiplayer.error).toMatch(/locked/i)
    expect(multiplayer.room?.settings.numCards).toBe(4)
  })
})
