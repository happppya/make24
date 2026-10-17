# Definition

Keep this file concise where possible. 

Under the Current Status section, record which document is being referred to.
Then briefly indicate which parts are done and which ones need to be done.

Under todos, write active todos in todo form (using - []), and mark as unstarted ([]), in progress ([~]), or completed ([x]).
Remove todos that are already completed. Remove documents from current status only when they are fully and thoroughly completed.

## Current Status

- spec.md: frontend core game engine, math/operators (basic, powers/roots, real factorial/gamma via Lanczos, trig in degrees, inverse, bit-shifting), scoring system, deck pools (1/2/3/unlimited decks), 5 auto-saved workspaces per round with fixed-size pannable canvas + freely draggable card groups, ungroup action (`U` / button), `Z`/`Y` undo & redo, and full Balatro-inspired pixel-art playable loop (Title, Lobby & Settings, Live Gameplay, Round End, and Match End) are implemented and tested. Balatro-style UI pass is in: left blind/score HUD with tweened value × accuracy chips, floating op cues, Web-Animations pop/shake feedback, target-hit stamp + particles, auto-glide of tall merged stacks, synthesized WebAudio SFX with persisted mute toggle, retro arcade title/lobby/results screens, and a header-less layout whose SFX + navigation live in an Esc menu overlay. Real-time multiplayer backend on Oracle Cloud Infrastructure is not started yet.

## Todos

- [ ] Build real-time multiplayer serverside synchronization (rooms, shared hand/target, synchronized round timer, and live scoreboard)
