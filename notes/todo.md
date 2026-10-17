# Definition

Keep this file concise where possible. 

Under the Current Status section, record which document is being referred to.
Then briefly indicate which parts are done and which ones need to be done.

Under todos, write active todos in todo form (using - []), and mark as unstarted ([]), in progress ([~]), or completed ([x]).
Remove todos that are already completed. Remove documents from current status only when they are fully and thoroughly completed.

## Current Status

- spec.md: frontend core game engine, math/operators (basic, powers/roots, real factorial/gamma via Lanczos plus principal-branch inverse gamma, trig in degrees, inverse, bit-shifting; the 200-point nesting penalty applies to factorial + inverse gamma, not factorial + gamma), scoring system, deck pools (1/2/3/unlimited decks), 5 auto-saved workspaces per round with fixed-size pannable canvas (dealt cards wrap at six per row) + freely draggable card groups, ungroup action (`U` / button), `Z`/`Y` undo & redo, operator hotkeys (`1`–`0` binary, `Shift`+`1`–`0` unary, labelled on the buttons), and full Balatro-inspired pixel-art playable loop (Title, Lobby & Settings, Live Gameplay, Round End, and Match End) are implemented and tested. Balatro-style UI pass is in: left blind/score HUD with tweened value × accuracy chips, floating op cues, Web-Animations pop/shake feedback, target-hit stamp + particles, auto-glide of tall merged stacks, synthesized WebAudio SFX with persisted mute toggle, retro arcade title/lobby/results screens, and a header-less layout whose SFX + navigation live in an Esc menu overlay. Real-time multiplayer now runs against the local table server (`server/`, `npm run dev:server`): authoritative rooms, shared hand/target, server-owned round timer, host-only rules and round control, ready-up lobby, live standings, and a swappable transport seam (`src/multiplayer/`; see notes/multiplayer.md). Audit pass done: `submit` is validated against the round's acceptance band with the error percent recomputed server-side, unknown message types are rejected, socket frames are capped at 32 KiB, the loopback transport hands out snapshots as copies like the socket does, the board is keyboard-playable (tab to a piece, Enter/Space to select), duplicate multiplayer submissions are suppressed, the operator cue shows the real score cost with a per-source cost breakdown in the HUD, and dead code (`engine/solver.ts`, unused helpers) is gone. The title screen now carries a TUTORIAL button that opens a scrollable player's guide (`src/components/TutorialOverlay.vue`): eight short sections covering target, expression building, board controls, workspaces, scoring, table rules, the operator reference and keys, three screenshots annotated with numbered callouts (`src/components/TutorialShot.vue`), regenerated with `npm run tutorial:shots` (`scripts/capture-tutorial.mjs`, needs `npm run dev` running).

## Todos

- [ ] Deploy the table server to Oracle Cloud Infrastructure (TLS termination, `ALLOWED_ORIGIN`, `VITE_MULTIPLAYER_URL`) and add auth/rate limiting before it is public
- [ ] Add reconnect/resume so a dropped socket keeps its seat and any board in progress
