# Frontend

Vue 3 + Vite + TypeScript. `main.ts` mounts [App.vue](App.vue), which is a thin
shell: it picks a screen for the current phase, provides the shared game state
and keeps the pause menu and the tutorial overlay.

```text
src/
  app/          game state + actions (composables), the context screens inject
  components/   board pieces, HUD, guide, lobby frame, and the screens/ folder
  engine/       pure rules: operators, scoring, deck, workspaces
  multiplayer/  wire protocol, room reducer, client session, transports
  audio/        synthesized sound effects
  style.css     global styles: palette, arcade buttons/panels, shared chrome
```

Nothing under `engine/` or `multiplayer/` touches the DOM, so both the browser
and the table server import them (see [../notes/multiplayer.md](../notes/multiplayer.md)).

Each folder has its own README with the details; start with [app/README.md](app/README.md)
for state and [components/screens/README.md](components/screens/README.md) for the
per-phase screens.

Commands, tests and the spec live at the repository root: see
[../README.md](../README.md) and [../notes/spec.md](../notes/spec.md).
