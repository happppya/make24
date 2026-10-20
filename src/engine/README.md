# engine/ — the rules

Plain TypeScript, no DOM, no Vue: the same files run in the browser, in the tests
and in the table server. If a rule changes, it changes here — the spec in
[../../notes/spec.md](../../notes/spec.md) is the court of appeal.

| File | Contents |
| --- | --- |
| [types.ts](types.ts) | `Card`, operator ids, settings (`GameSettings`), expression nodes, workspace and solution shapes |
| [math.ts](math.ts) | Operator catalog and evaluation, gamma/factorial, target acceptance, scoring, formatting |
| [deck.ts](deck.ts) | Deck pools, sprite paths, dealing a hand, generating the round target |
| [puzzles.ts](puzzles.ts) | Deterministic daily/weekly periods, names, generated hands/targets, reference solutions and attempt validation |
| [constants.ts](constants.ts) | The forty famous constants used by the constants target mode: values, symbols, and the line explaining each one |
| [workspace.ts](workspace.ts) | The five workspaces: groups, positions, selection, merging, ungroup, undo/redo, tidy |

Things worth knowing before editing:

- `OPERATOR_CATALOG` in [math.ts](math.ts) is the single source of operator
  metadata (symbol, arity, category, points). `OPERATOR_GROUPS` adds the lobby's
  group labels and hints. A group switch is the default; a per-operator override
  in `allowedOperators.operators` can leave one operator out or switch one on by
  itself.
- `src/engine/puzzles.ts` is shared by the browser and the table server: the
  same UTC period must produce the same hand, target and rules on both sides.
  `createPuzzle()` builds a valid all-cards expression first and uses its value
  as the target; `validatePuzzleAttempt()` replays a submitted board against the
  hand, checks enabled operators, recomputes the score and is the only scoring
  path for boards.
- Every evaluator returns an `EvalResult` with `ok: false` and a message instead
  of throwing or returning `NaN`, so an illegal board can be reported in the UI.
- Scoring is a pure function of the expression tree: 10 points per operator, a
  ramping cost for consecutive unary stacks, and 200 for a factorial/Γ⁻¹ pairing.
- Workspaces keep their own snapshots for undo/redo, and the dealt layout comes
  from constants (`DEFAULT_CARDS_PER_ROW`, spacing, centre) rather than from the
  DOM, so the same state renders at any screen size.

Covered by [../setup.test.ts](../setup.test.ts); run it with `npm run test`.
