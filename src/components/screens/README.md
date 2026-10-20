# screens/ — one component per game phase

[App.vue](../../App.vue) switches on the phase and renders exactly one of these.
Each phase screen:

- injects the shared state with `useGameContext()` and destructures only what it
  renders (no prop drilling, no store);
- owns its markup, its scoped styles and its `:inert="menuOpen || tutorialOpen"`
  guard (plus `targetPromptOpen` where the pre-round chooser can appear), so an
  open overlay keeps the screen underneath out of reach;
- never mutates state: it calls the actions from the context.

| Screen | Phase | Notes |
| --- | --- | --- |
| [TitleScreen.vue](TitleScreen.vue) | `title` | Solo/multiplayer entry, Daily & Weekly entry, and the tutorial button |
| [PuzzleHubScreen.vue](PuzzleHubScreen.vue) | `puzzles` | Current daily/weekly cards, names, rules and top-three boards |
| [LobbyBrowserScreen.vue](LobbyBrowserScreen.vue) | `lobby-select` | Name, public lobby list, create public/private, join by code |
| [LobbySetupScreen.vue](LobbySetupScreen.vue) | `lobby` | Seats, ready-up, and the full table settings (host-only) |
| [PlayingScreen.vue](PlayingScreen.vue) | `playing` | HUD sidebar, felt board, operator rails, board tools; swaps to puzzle submit/quit controls |
| [RoundEndScreen.vue](RoundEndScreen.vue) | `round-end` | Round result, submitted boards, winning card replay, standings |
| [PuzzleResultScreen.vue](PuzzleResultScreen.vue) | `puzzle-result` | Puzzle score, rank, local/offline note and top scores |
| [GameOverScreen.vue](GameOverScreen.vue) | `game-over` | Series winner, final standings, host-run rematch via the lobby |
| [PauseMenu.vue](PauseMenu.vue) | n/a | Overlay for any phase: resume, lobby, main menu, sound |
| [TargetChoiceDialog.vue](TargetChoiceDialog.vue) | n/a | Pre-round exact-target chooser for solo and the multiplayer host |
| [PuzzlePlayHeader.vue](PuzzlePlayHeader.vue) | n/a | Compact name, all-cards hint and live top-three shown above the puzzle felt |

Both lobby screens render inside [../LobbyFrame.vue](../LobbyFrame.vue) so the
marquee and back button exist once.

Keep the screens thin: if a screen needs a decision rather than a binding, put it
in a composable under [../../app/](../../app) and expose it through `useGame()`.
