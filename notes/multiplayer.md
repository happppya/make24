# Multiplayer

Local-first, cloud-ready. The game is authoritative-server by design: the server
owns the hand, the target, the clock and the scores; browsers only render and
send intents.

## Run it locally

```bash
npm run dev:server   # node:http + ws table server on :8787
npm run dev          # Vite frontend
```

Open the app in two tabs (or two browsers), choose **Multiplayer**, then either
create a lobby (public or private) or pick a public one from the list. Each lobby
gets a short server-assigned code (four characters, no `0/O` or `1/I` so it can be
read aloud); a private lobby is reachable only by typing that code. Whoever opens
a lobby is its host.

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
| Client store | `src/multiplayer/session.ts` | Reactive room/self/status, lobby list, browse/create/join, clock offset |

`room.ts` imports no DOM or Node APIs, so the identical rules run under Node
(`server/`) and in the browser (`loopback.ts`).

## Lobby selection

The selector is one socket in an unseated state. It sends `browse`, which
subscribes it to the public room list; the server pushes a fresh `lobbies` frame
whenever a room appears, fills, changes phase or disappears. Private rooms never
appear in that list, but `join` accepts their code exactly like a public one.

The table screen shows the room's code and visibility, so the host can read the
code out to a friend. Leaving the table frees the seat and returns to the list;
the room keeps running for everyone else.

Hosting passes down the seating order: when the host disconnects, the player who
joined earliest among those left becomes host (and can drive the round already in
flight). Someone who joins while a round is running is seated with `isWaiting`:
they see the hand and the clock but their submissions are refused with `waiting`, and
the next deal clears the flag and deals them in.

## Protocol

Client → server: `browse`, `create-room`, `join`, `set-name`, `set-ready`,
`update-settings`, `start-match`, `next-round`, `skip-round`, `end-match`,
`return-to-lobby`, `submit`.

Server → client: `welcome` (self id + room snapshot + server time), `state`
(full snapshot with `revision`), `lobbies` (public room summaries), `error`
(code + message).

A submission can also carry an optional expression-tree snapshot of the board. The
server rebuilds it against the dealt hand, recomputes its values and headers, and
uses it for the round-end card replay (and, when present, to derive the submitted
score and equation).

The server never trusts the client: names are trimmed and de-duplicated (a blank
name gets a generated two-word handle), settings
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
5. Round end awards one point to the lowest score; equal best scores share the
   round, so every tied player scores. Once approximations are enabled, the
   host's scoring mode (`cost-first`, `balanced`, `accuracy-first`) folds each
   board's distance from the target into that score. Reaching `firstToPoints` still shows that round's solution
   screen: the snapshot stays in `round-end` and records `matchWinnerIds`. The
   host's `next-round` then moves the room to `game-over`. Players who reach the
   target on the same round draw the series. Winning submissions carry their
   board snapshot, which the round-end screen renders in card form.

Host controls: `skip-round` closes a round early (pays the best submitted board
if there is one, otherwise no point), `next-round` deals again or, after the
final round, opens the series screen, `end-match` finishes the series early, and
`return-to-lobby` sends everyone from `game-over` back to the room's lobby so the
host can adjust the rules before the next match. `start-match` is only accepted
from `lobby`.

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

- `src/multiplayer/room.test.ts` — rules: seating, readable room codes, waiting
seats, host handover to the oldest player, clamping, deal, first-to-solve, timed
expiry, host-ended rounds, match end.
- `src/multiplayer/solutionTree.test.ts` — submitted board snapshots are rebuilt
from the dealt hand, with forged cards, missing cards and unknown operators
rejected.
- `src/multiplayer/server.test.ts` — boots the real server on an ephemeral port
  and walks socket clients through lobby list → create → join by code → round →
  match, including private-room visibility, host handover and a mid-round joiner.
- `src/multiplayer/transport.ws.test.ts` — the actual `WebSocketTransport` and
  the session store against a live server: browse, create, a rejected code, plus
  the unreachable-server error.
- `src/multiplayer/session.test.ts` — the same session driving the loopback
  transport, proving the seam.
- `src/setup.test.ts` — the rendered selector (name, public/private, code entry)
  and the waiting banner/locked board a mid-round joiner sees.

## Known gaps

- No reconnect/resume: dropping the socket frees the seat; rejoin with the same
  room code to sit back down (the code is on the table screen, so a host who drops
  cannot recover it unless someone reads it to them).
- No auth or rate limiting yet — add before exposing the server publicly.
- A host leaving mid-match promotes the oldest remaining player, but the round in
  flight keeps its existing submissions.
- The public list is capped at 50 rooms and rooms are never garbage-collected
  until their last player leaves.
