# Make 24 Remastered

A pixel-art twist on the Make 24 numbers game. Cards are dealt, you merge them
with operators until one group hits the target, and the **cheapest** board wins
the round — every operator costs points, so the elegant route beats the long one.
Playable solo or online against friends in real time.

## Running it

```bash
npm install
npm run dev            # game at http://localhost:5173
npm run dev:server     # multiplayer table server on port 8787 (only needed online)
```

Solo play needs just the frontend. Online play needs the table server too, or a
deployed one pointed at with `VITE_MULTIPLAYER_URL` (see [.env.example](.env.example)).

New to the game? The title screen's **Tutorial** button is the player's guide,
and [notes/spec.md](notes/spec.md) has the rules in full.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the game |
| `npm run dev:server` | Table server with reload (`tsx watch`), port `8787` |
| `npm run build` | Typecheck, then build `dist/` |
| `npm run typecheck` | `vue-tsc` over the app and the Node configs |
| `npm run test` | Vitest (jsdom): engine, multiplayer reducer and UI flows |
| `npm run tutorial:shots` | Regenerate the player's-guide screenshots (`npm run dev` must be running) |

## How it is put together

Vue 3 + Vite + TypeScript. The game's rules are plain TypeScript with no DOM or
framework imports, so the same code drives the UI, the tests and the server: the
room reducer in [src/multiplayer/room.ts](src/multiplayer/room.ts) is what makes
multiplayer authoritative — the server owns the hand, the clock and the scores,
and clients mirror it.

| Path | What lives there |
| --- | --- |
| [src/app/](src/app) | Game state and actions (Vue composables) |
| [src/components/](src/components) | Board, HUD and the per-phase screens |
| [src/engine/](src/engine) | The rules: operators, deck, workspaces, scoring |
| [src/multiplayer/](src/multiplayer) | Wire protocol, room reducer, client session |
| [src/audio/](src/audio) | Synthesized sound effects (no audio files) |
| [server/](server) | `node:http` + `ws` host for the room reducer |
| [public/](public) | Card sprites and tutorial screenshots |

## Docs

- [notes/spec.md](notes/spec.md) — the game spec, and the source of truth for rules.
- [notes/todo.md](notes/todo.md) — working status and active todos.
- [notes/multiplayer.md](notes/multiplayer.md) — architecture, wire protocol, cloud swap.
- [notes/deploy.md](notes/deploy.md) — GitHub Pages and the table-server deploy.
