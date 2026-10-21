# app/ — game state and actions

The game's brain, as Vue composables. [useGame.ts](useGame.ts) is the composition
root: `App.vue` calls it once, it builds every module below, and it `provide()`s
the merged result so any screen can inject it with `useGameContext()` from
[context.ts](context.ts) and destructure exactly what it renders.

| File | Responsibility |
| --- | --- |
| [useGame.ts](useGame.ts) | Wiring, board actions (select, merge, undo/redo, reset), navigation, pause menu, keyboard |
| [useMatch.ts](useMatch.ts) | Round state: hand, target, workspaces, local leaderboard, server room mirror, round clock |
| [useStandings.ts](useStandings.ts) | View models for seats, round winners and the series winner |
| [useRoom.ts](useRoom.ts) | Lobby browser, create/join/leave, ready-up, host settings sync |
| [usePuzzles.ts](usePuzzles.ts) | Hourly, two daily and weekly hub, dungeon map and gauntlet navigation, run lifecycle, boards, submission and progress |
| [puzzleBoards.ts](puzzleBoards.ts) | Puzzle HTTP endpoints, local score storage, name persistence |
| [dungeonProgress.ts](dungeonProgress.ts) | Device-local dungeon clears and best scores |
| [useJuice.ts](useJuice.ts) | Sound, screen shake, floating cues, bobbing pieces, camera glide, felt particle bursts |
| [particles.ts](particles.ts) | Seeded pixel-burst maths for merges, splits, operators, errors and target hits |
| [useBoardGestures.ts](useBoardGestures.ts) | Dragging pieces, panning the felt, tidy and recenter |
| [useHotkeys.ts](useHotkeys.ts) | Digit/Z/Y/U/Esc shortcuts |
| [displayPrecision.ts](displayPrecision.ts) | Shared in-game decimal-width slider state, persisted on the device |
| [defaults.ts](defaults.ts) | Default settings and the deep copy used on the wire |
| [labels.ts](labels.ts) | Lobby/phase labels, timers, sprite URLs, operator key labels |

Order matters: `useMatch` needs the juice layer, `usePuzzles` needs the match,
`useRoom` needs the standings, and the board actions need both — follow the order
inside `useGame()` when adding a module. Anything a screen needs must also be part of the object `useGame()`
returns; nothing else can reach it.

Two rules keep this folder honest:

- screens never clean up (teardown stays in `useGame`) and never mutate another
  module's state directly — they call the actions they were handed;
- multiplayer is only ever updated through [../multiplayer/session.ts](../multiplayer/session.ts);
  local state mirrors it, it never competes with it.
