# Make 24 Remastered

A twist on the Make 24 numbers game, singleplayer + multiplayer. Players
combine dealt cards with operators to hit a target number; lower score wins.

## Source of truth

- `notes/spec.md` — full game spec (settings, gameplay, scoring, undo/redo).
- `notes/todo.md` — working status + active todos. Follow the workflow defined
  at the top of that file: keep it concise, record status per document.

## Stack

- Frontend: Vue 3 + Vite + TypeScript (`src/`). Commands: `npm run dev`,
  `npm run build` (typechecks, then builds), `npm run typecheck`,
  `npm run test` (Vitest + jsdom, see `vite.config.ts`).
- Prefer unit tests over browser preview evaluation when possible — they run
  in seconds without a browser round-trip. Reserve the Preview tab for visual
  checks that genuinely need eyes on the UI.
- Serverside (not started): will run on Oracle Cloud Infrastructure free tier.
- Card art: 64 pixel-art sprites in `public/card-sprites/` with descriptive
  names (`queen-of-hearts.png`, `10-of-clubs.png`, `joker-red.png`,
  `card-back-red.png`, …). Served as static files; all 64 ship in `dist/`.

## Conventions

- Don't start unrequested features — the spec is big; build only what is asked.
- Visual style: Balatro-inspired pixel art, sensible game UI with icons.
  Account design skills are available for UI work (`frontend-design`,
  `gpt-taste`, `high-end-visual-design` — read the relevant SKILL.md first).
- Keep `notes/todo.md` updated per its defined workflow as work progresses.
