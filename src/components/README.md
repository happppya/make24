# components/ — the visible pieces

Presentation only. Components take props and emit events; game state comes from
the injected context (see [../app/README.md](../app/README.md)), so none of them
import `useGame` or talk to the server.

| File | What it renders |
| --- | --- |
| [CardGroupNode.vue](CardGroupNode.vue) | One board piece, recursive: a card, or a merged group showing its equation header |
| [ScorePanel.vue](ScorePanel.vue) | Left HUD: target, live value, error band, score and the per-source cost breakdown |
| [LobbyFrame.vue](LobbyFrame.vue) | The chrome both lobby screens share: marquee header, back button, page frame |
| [DifficultyChip.vue](DifficultyChip.vue) | The shared seven-tier difficulty badge used by calendar, dungeon and result screens |
| [PuzzleCadenceCard.vue](PuzzleCadenceCard.vue) | One calendar board card: tier, reset clock, target, rules, top three and play button |
| [TutorialOverlay.vue](TutorialOverlay.vue) | The player's guide, opened from the title screen |
| [TutorialShot.vue](TutorialShot.vue) | An annotated screenshot: image, numbered pins and legend |
| [screens/](screens) | One component per game phase (see its README) |

Card artwork comes from `public/card-sprites/` by filename; use `spriteUrl()` from
[../app/labels.ts](../app/labels.ts) so paths keep working from any base URL.

Each component owns its own `<style scoped>` block. Styles shared by more than one
screen belong in the shared chrome section at the bottom of [../style.css](../style.css),
not copied between components.
