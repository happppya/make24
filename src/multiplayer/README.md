# multiplayer/ — the table

Everything shared between the browser and the table server. Read
[../../notes/multiplayer.md](../../notes/multiplayer.md) for the architecture and
the cloud swap path; this file is the map.

| File | Runs where | Responsibility |
| --- | --- | --- |
| [protocol.ts](protocol.ts) | both | Wire format: `ClientMessage`/`ServerMessage`, room state, limits. No DOM, no Node APIs |
| [room.ts](room.ts) | both | The reducer: authoritative rooms, seats, dealing, the round clock, scoring, host handover |
| [session.ts](session.ts) | browser | The client's reactive mirror (`multiplayer`, `selfPlayer`) plus create/join/leave/browse |
| [transport.ts](transport.ts) | browser | `MultiplayerTransport` seam: `send()` in, `onMessage()` out — swap the host without touching game code |
| [loopback.ts](loopback.ts) | browser | An in-process table (same reducer, no sockets), used offline and by tests |

Rules that keep this folder sane:

- **The server is authoritative.** The client's evaluation is a preview; only
  `submit` messages count, and the server re-checks them against the round's
  acceptance band before scoring them.
- **Nothing here imports Vue above `session.ts`**, and nothing imports the
  server: the reducer must stay runnable in both places.
- The client never invents a room state — it applies snapshots from the server.

The host process lives in [../../server/](../../server) (`npm run dev:server`,
port `8787`); tests cover the reducer, the session and the live socket in
[room.test.ts](room.test.ts), [session.test.ts](session.test.ts) and
[transport.ws.test.ts](transport.ws.test.ts), plus the server end-to-end in
[server.test.ts](server.test.ts).
