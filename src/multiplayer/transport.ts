import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from './protocol'

/**
 * The swappable seam between the game and whoever is hosting the table.
 *
 * Everything above this file only sees `send()` / `onMessage()`, so moving from
 * the local dev server to a cloud host means pointing `VITE_MULTIPLAYER_URL` at
 * it, or dropping in a different `MultiplayerTransport` (e.g. one that attaches
 * an auth token, or talks to a Durable Object) without touching game code.
 */

export interface TransportHandlers {
  onOpen?: () => void
  onMessage: (message: ServerMessage) => void
  onClose?: (info: { code: number; reason: string; wasClean: boolean }) => void
}

export interface MultiplayerTransport {
  /** Short label shown in the lobby, e.g. "ws://localhost:8787/ws". */
  readonly label: string
  connect: () => void
  send: (message: ClientMessage) => void
  close: () => void
}

export const DEFAULT_SERVER_PORT = 8787

/**
 * Resolution order:
 *   1. VITE_MULTIPLAYER_URL (set this in production / on the cloud box)
 *   2. same hostname as the page, port 8787, secure scheme when the page is https
 */
export function resolveServerUrl(): string {
  const configured = (import.meta.env?.VITE_MULTIPLAYER_URL as string | undefined)?.trim()
  if (configured) return configured

  if (typeof window === 'undefined') return `ws://localhost:${DEFAULT_SERVER_PORT}/ws`
  const page = window.location
  const scheme = page.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = page.hostname || 'localhost'
  return `${scheme}//${host}:${DEFAULT_SERVER_PORT}/ws`
}

export function createWebSocketTransport(
  handlers: TransportHandlers,
  url: string = resolveServerUrl()
): MultiplayerTransport {
  let socket: WebSocket | null = null

  return {
    label: url,
    connect(): void {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return
      }
      const next = new WebSocket(url)
      socket = next
      next.onopen = () => handlers.onOpen?.()
      next.onmessage = (event: MessageEvent) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (parsed && typeof parsed === 'object') {
          handlers.onMessage(parsed as ServerMessage)
        }
      }
      next.onclose = (event: CloseEvent) =>
        handlers.onClose?.({
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        })
      next.onerror = () => {
        // The close handler will report the failure; browsers emit no detail here.
      }
    },
    send(message: ClientMessage): void {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    },
    close(): void {
      socket?.close()
      socket = null
    },
  }
}

export function joinMessage(roomCode: string, name: string): ClientMessage {
  return { t: 'join', room: roomCode, name, protocol: PROTOCOL_VERSION }
}
