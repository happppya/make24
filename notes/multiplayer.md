# Multiplayer

Local-first, cloud-ready. The game is authoritative-server by design: the server
owns the hand, the target, the clock and the scores; browsers only render and
send intents.

## Run it locally

```bash
npm run dev:server   # node:http + ws table server on :8787
npm run dev          # Vite frontend
```

Open the app in two tabs (or two browsers), choose **Head to Head**, set the same
room code (default `MAIN`) and name, and join. The first seat becomes host.

- `npm run server` runs the table server without file watching.
- `GET http://localhost:8787/health` reports `{ ok, rooms, players, uptime }`.
- `PORT`, `HOST`, `ALLOWED_ORIGIN` (comma-separated origins or `*`) configure the
  process — the same variables work on a VM.

## Layers

| Layer | File | Responsibility |
| --- | --- | --- |
| Wire format | `src/multiplayer/protocol.ts` | JSON message shapes, room snapshot, validation limits |
| Rules | `src/multiplayer/room.ts` | Pure reducer: seating, host, ready, deal, submit, clock, scoring, match end |
| Host | `server/server.ts` | Sockets, rooms, broadcast, heartbeat, deadlines, health |
| Entry | `server/index.ts` | Env config, logging, graceful shutdown |
| Transport seam | `src/multiplayer/transport.ts` | `MultiplayerTransport` interface + WebSocket implementation |
| Alt transport | `src/multiplayer/loopback.ts` | In-process table for demos and tests |
| Client store | `src/multiplayer/session.ts` | Reactive room/self/status, connect/reconnect, clock offset |

`room.ts` imports no DOM or Node APIs, so the identical rules run under Node
(`server/`) and in the browser (`loopback.ts`).

## Protocol

Client → server: `join`, `set-name`, `set-ready`, `update-settings`, `start-match`,
`next-round`, `skip-round`, `end-match`, `submit`.

Server → client: `welcome` (self id + room snapshot + server time), `state`
(full snapshot with `revision`), `error` (code + message).

The server never trusts the client: names are trimmed and de-duplicated, settings
are clamped, solutions must be finite and land inside the round's acceptance band
(error percent is recomputed from `finalValue` rather than read from the payload)
and are stamped with the sender's identity and the round clock, and only the host
may edit rules or drive round transitions. Message frames are capped at 32 KiB
(`maxPayload`), and an unknown message type is rejected instead of reaching the
reducer.

Turn order for a round:

1. Host sends `start-match` → server deals a target + hand, sets `phase: playing`.
2. Everyone receives the same snapshot and builds workspaces locally.
3. A player reaches an acceptable single-group board → `submit`.
4. `first-to-solve` ends the round immediately with that player as winner; timed
   modes keep accepting boards until the server clock passes `deadline`.
5. Round end awards one point; reaching `firstToPoints` ends the match.

Host controls: `skip-round` closes a round early (pays the best submitted board
if there is one, otherwise no point), `next-round` deals again, `end-match`
finishes the series.

## Swapping the transport for the cloud

Nothing above `transport.ts` knows about sockets, so deployment is a transport
(or URL) change:

1. **Same server, different host (Oracle Cloud VM).** Deploy `server/` with
   `tsx`/`node`, terminate TLS in Caddy or nginx (`/ws` → `:8787`), set
   `ALLOWED_ORIGIN=https://your.site`. Nothing else changes.
2. **Different host/build.** Build the client with
   `VITE_MULTIPLAYER_URL=wss://api.example.com/ws`. It only affects
   `resolveServerUrl()`.
3. **Different runtime.** Implement `MultiplayerTransport` for your host (e.g. a
   Durable Object or a hosted socket service) and pass it via the
   `createTransport` option in `connectToRoom()`; the session and all views keep
   working because they only see `ClientMessage`/`ServerMessage`.
4. **Server-side swap.** `createMultiplayerServer()` can be embedded in another
   Node process, or `room.ts` can be hosted inside a different adapter. Keep the
   reducer as the single source of rules.

## Tests

```bash
npm run test
```

- `src/multiplayer/room.test.ts` — rules: seating, host powers, clamping, deal,
  first-to-solve, timed expiry, host-ended rounds, match end.
- `src/multiplayer/server.test.ts` — boots the real server on an ephemeral port
  and walks two socket clients through lobby → round → match.
- `src/multiplayer/transport.ws.test.ts` — the actual `WebSocketTransport` and
  the session store against a live server, plus the unreachable-server error.
- `src/multiplayer/session.test.ts` — the same session driving the loopback
  transport, proving the seam.

## Known gaps

- No reconnect/resume: dropping the socket frees the seat; rejoin with the same
  room code to sit back down.
- No auth or rate limiting yet — add before exposing the server publicly.
- Host leaving mid-match promotes the next player, but the round in flight keeps
  its existing submissions.
