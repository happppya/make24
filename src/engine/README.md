# engine/ — the rules

Plain TypeScript, no DOM, no Vue: the same files run in the browser, in the tests
and in the table server. If a rule changes, it changes here — the spec in
[../../notes/spec.md](../../notes/spec.md) is the court of appeal.

| File | Contents |
| --- | --- |
| [types.ts](types.ts) | `Card`, operator ids, settings (`GameSettings`), expression nodes, workspace and solution shapes |
| [decimal.ts](decimal.ts) | 50-digit Decimal configuration, special functions (gamma, inverse gamma, degree trig), display formatting |
| [math.ts](math.ts) | Operator catalog and evaluation, target acceptance, scoring, header/equation formatting |
| [approxMath.ts](approxMath.ts) | Fast double probes used only by deterministic puzzle search; the winning tree is rebuilt exactly |
| [deck.ts](deck.ts) | Deck pools, sprite paths, dealing a hand, generating the round target |
| [binds.ts](binds.ts) | Automatic opening binds: Dragon runs, Rook copies, products and per-kind card ranges and caps |
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
  On success `exactValue` is the canonical 50-digit decimal string; `value` is
  only a double mirror retained for older consumers. Read exact values through
  `nodeExactValue()` and format them with `formatNumber(value, decimalPlaces)`.
- [decimal.ts](decimal.ts) owns precision and display. The engine works at 50
  significant digits, while the UI exposes 0–32 decimal places (five by default)
  through `src/app/displayPrecision.ts`. If you add an operator, evaluate it with
  Decimal (or add it to `approxMath.ts` only for puzzle candidate search) and
  keep both the exact string and the numeric mirror in the result.
- Scoring is a pure function of the expression tree: 10 points per operator, a
  ramping cost for consecutive unary stacks, and 200 for a factorial/Γ⁻¹ pairing.
  A bind group costs nothing — it is an opening deal rule, not a played operator.
  Bound cards stay locked together in every workspace and are validated against
  the deterministic deal by [../multiplayer/solutionTree.ts](../multiplayer/solutionTree.ts).
- Workspaces keep their own snapshots for undo/redo, and the dealt layout comes
  from constants (`DEFAULT_CARDS_PER_ROW`, spacing, centre) rather than from the
  DOM, so the same state renders at any screen size.

Covered by [../setup.test.ts](../setup.test.ts), [decimal.test.ts](decimal.test.ts)
and [puzzles.test.ts](puzzles.test.ts); run them with `npm run test`.
