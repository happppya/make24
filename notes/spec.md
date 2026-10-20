# Make 24 Remastered

A twist on the make 24 game. Players can either enter singleplayer or multiplayer mode.

- All serverside is handled on Oracle Cloud Infrastructure because they have a free tier.
- Vue on the frontend.

## Visual Style

Kind of a pixel art style inspired by Balatro. Maintain a sensible and easy-to-use game UI with icons and smooth animations.

## Lobby

Both singleplayer and multiplayer modes can enter a lobby screen (where players and settings are shown) before entering the gameplay mode.

## Settings

- ****Mode**** (dropdown, only applies to multiplayer):
- First to solve: first player to find any solution wins
- Best solution in 30 sec
- Best solution in 1 min
- Best solution in 3 min
- Best solution in 5 min
- Best solution in 10 min
- ****Singleplayer:**** The one player just improves their solution as much as possible and can end at any time by themselves.
- ****Number of cards:**** The number of cards dealt at the start of each round.
- ****Target number:****
- "Just 24" is always 24
- "Small numbers" is 1–100
- "Big numbers" is 100–10000
- "Custom" allows any minimum and maximum range
- "Famous constants" deals a famous irrational or mathematical constant (π, e, Euler's γ, the golden ratio, and forty in total). The host can pin one constant or leave it on random so each round picks one; the live HUD names the constant and explains what it is. Constants are not whole numbers, so this mode expects an approximation band above 0%.
- Targets are randomly chosen from the range. There is also an exact-target option: the host sets no number in the lobby, but is asked for it in a small dialog immediately before the first round and before every following deal. Every player gets the same target.
- ****Approximations:**** By default zero (picking the constants mode fills in 2% if the field is still zero), but signifies the percent error to which solutions are acceptable. For example, if this field is 1 and the target number is 100, then the game accepts (and displays that it will accept) any end value within 1 percent error of 100. The % error band is inclusive. A target of 0 just has 0 tolerable error. When approximations > 0, closeness to the target also feeds the score, weighted by the table's scoring mode (cost-first, balanced, or accuracy-first).
- ****Card pool:**** One deck, two decks, three decks, unlimited (with replacement, no consideration of pools, every card is always equally likely). The deck values are the standard cards in a deck, but J = 11, Q = 12, K = 13 and A = 1.
- ****Allowed operators:****
- ****"Basic"**** (add, sub, mult, divide) are all binary operators.
- ****"Powers and roots"**** are binary operators: for example, 5 root 3 consumes a 5 and a 3 and produces 5 ^ (1/3), or 5 power 3 produces 5^3.
- ****"Factorials and gamma"**** are unary operators: factorial (x!), gamma (Γ(x)), and inverse gamma (Γ⁻¹(x), the value whose gamma is x). They are not banned when used together by default, but the lobby's forbidden-move rule can charge a penalty each time factorial and inverse gamma are nested directly, for example factorial(inverseGamma(x)) or inverseGamma(factorial(x)). Factorials and gammas can be used on all real numbers (using the gamma definition for factorial), except for when the result would be undefined. Inverse gamma uses the principal branch (the solution at or above the gamma minimum of ≈0.8856), so it is undefined for inputs at or below that minimum and for non-positive inputs.
- ****"Basic trig"**** allows unary operators sin, cos, and tan in degrees.
- ****"Inverse"**** allows the usage of a unary operator that gives a number's inverse.
- ****"Binary computing"**** allows operators that work on whole numbers: LSHIFT (for example LSHIFT(5,3) shifts the bits of 5 = 101 left by 3 slots = 40), plus the bitwise operators AND, OR, XOR and unary NOT. AND/OR/XOR take two whole numbers and NOT takes one; all use two's-complement semantics, so `AND(-1, 6) = 6`, `XOR(-1, 5) = -6` and `NOT(5) = -6`. Fractional operands are refused.
- ****"Concatenate"**** allows the binary operator `||`, which joins the decimal digits of its operands in selection order: 6 || 10 = 610 and 10 || 6 = 106. Both operands must be whole numbers of zero or more, and the result must stay inside the exactly representable integer range, so anything larger is refused rather than silently rounded. Scored like every other binary operator (+10).
- ****"Analysis"**** allows exp (e^x), ln (the natural logarithm) and the binary log(a, b), which is log base a of b. exp and log reject undefined/overflowing results; ln requires a positive argument; log requires a positive base other than 1 and a positive argument. Formatted as `e^(x)`, `ln(x)` and `log(a, b)`.
- ****"Combinatorics"**** allows COMB(n, k) (n choose k), PERM(n, k) (ordered selections), STR2(n, k) (Stirling numbers of the second kind), double factorial (n!!) and subfactorial (!n, derangements). All arguments must be whole numbers of zero or more. COMB and PERM require 0 ≤ k ≤ n; STR2 is 0 when k > n. The decimal engine carries whole results exactly. The implementation still caps COMB/PERM at n ≤ 1000 and STR2 at n ≤ 200 so a board cannot lock the UI; results that cannot be represented by the game are refused with an error.
- Each operator group has a master switch that toggles every operator in it, and each operator has its own switch. A single operator can be enabled inside a switched-off group (the group switch then shows a mixed state), and enabling a group turns all of its operators on.
- ****Forbidden moves:**** Two shortcut rules can be switched on individually: factorial and inverse gamma nested directly together (either order), and a power whose base is 1 (`1 ^ x`, whatever expression produced the 1). Each occurrence costs the forbidden-move penalty, 200 points by default and host-configurable (0 or more). A rule that is switched off costs nothing. Factorial and plain gamma together are never forbidden.
- ****First to x:**** After a round ends, the winning player gets a point, or if nobody wins then nobody gets a point. The first player to x wins the entire game. The host can choose to skip a round at any time or end the entire game at any time.

## Binds

Binds are optional opening groups that fuse dealt cards before a round begins. A table can enable each bind separately, give each bind its own minimum and maximum card count, and give each bind its own per-deal cap. Binds are off on a fresh table, so classic games start with loose cards. When enabled, the engine forms them deterministically from the hand, in this priority order:

- **Dragon (priority 1):** a run of consecutive ranks, for example A, 2, 3. The run must be at least the minimum (2–6 cards, default 3) and forms at most the maximum (2–6 cards, default 6). One card of every rank in the bound run is used, so duplicate ranks stay free for a rook. A run longer than the maximum binds its lowest ranks and leaves the rest loose. The group's value is the product of the cards. Aces are low; king does not wrap back to ace.
- **Rook (priority 2):** multiple copies of the same rank. The stack must be at least the minimum (2–5 cards, default 2) and forms at most the maximum (2–5 cards, default 5); extra copies stay loose. The group's value is the product of its cards. When several ranks qualify, the rank with the most copies is taken first, then the lower rank.

Dragons are attempted before rooks, and each kind has its own cap of 0–6 groups per deal (default 2). A cap of 0 switches that kind off without touching the other, so a table can allow two rooks and no dragons. Binds belong to the deal, so they are identical in every workspace and reset to the same groups when the workspace is reset or a new round is dealt.

A bind costs no operator points and produces its product as a normal group value that can be used by operators and merged with other groups. It is locked: it cannot be ungrouped, and every multiplayer or puzzle submission is validated against the deterministic deal so a claimed bind cannot be split back into loose cards or invented from a different set of cards.

## Daily & Weekly Puzzles

The main menu has a **Puzzles** entry. Both modes are solo attempts at a shared board: every player gets the same fixed hand, target and operator rules for that UTC day or ISO week. There is no clock, and the goal is the lowest score. A score only counts when every dealt card is used exactly once in one finished expression.

- **Daily:** medium difficulty, four or five cards. The recipe rotates through arithmetic, factorials, analysis, binary computing and combinatorics, so adjacent days ask for different tools.
- **Weekly:** extreme difficulty, six to eight cards and a target in the thousands or millions. The weekly recipe turns on most or all operator families and uses larger card pools; it runs from Monday 00:00 UTC to the next Monday.
- Puzzles are generated deterministically from their UTC period. A hand is dealt, an expression is built from only the allowed operators, and the target is that expression's value. The generated expression is retained as a reference solution so every puzzle is playable by construction: it spends every dealt card exactly once and is checked by the same validator as player submissions. If the search cannot produce a recipe-shaped expression, the generator falls back to an all-cards fold and enables Add in that puzzle's rules, so even the last-resort board stays legal. A regression sweep replays the reference board of 120 daily and 16 weekly periods through the validator.
- Names are procedurally generated from the period (for example `Gilded Garden 745`), so every daily and weekly puzzle has its own name.
- The lobby's card count, target settings, operator toggles, card pool, forbidden-move rules and scoring mode are all used by the puzzle generator. Puzzle rules cannot be edited by the player.
- Some daily and weekly recipes are bind-themed: they enable Dragons, Rooks or both at fixed card ranges and per-deal caps, and only generate hands that actually form one. Their reference solution starts from those bound groups, so the target is always reachable from the locked opening board. The puzzle hub and play header show the enabled bind rules.

Each puzzle has a leaderboard sorted by ascending score, then earliest submission. The top three rows are visible in the puzzle hub and in a compact strip above the felt while solving. The board is stored by the table server in `data/puzzle-leaderboards.json` and exposed over HTTP under `/puzzles/`; if that server cannot be reached, scores are kept on the device and the screen says so. Names are the only identity: a repeat submission under the same name replaces that row only when the new score is lower. The server rebuilds the submitted card board, checks every card and operator against the generated puzzle, recomputes the score, and refuses stale puzzle keys.

## Live Gameplay

At the start of a round, cards are dealt out to the players, the number depending on the setting. They may be from a pool or equally likely, according to the settings. Each player gets the same hand.

It is crucial that we have very good UI/UX to allow players to combine cards to create solutions. All cards must be used in a solution, and only the final value is considered as the answer.

As players work through cards, we treat the current state of their board as a workspace. The workspace saves automatically, and players can switch between 5 different workspaces if they want to explore a different path and then later come back to their previous work. Workspaces are refreshed on each new round because the hand changes, so it wouldn't make sense to have a workspace with the wrong hand. In multiplayer you cannot see other players' workspaces.

To work with cards:

- A player first selects a card.
- If they enter a ****unary operator****, then a semi-transparent rectangle appears around the card where it has the same width but a taller height, such that there is just a small empty space above the card created by this outer rectangle. In that header, it displays the result of the operation. For example, it could show 4! = 24 or sin(90 deg) = 1.
- If the player enters a ****binary operator****, then the game displays what operator is currently pending, and waits for the player to select another card. Upon selection, the operation is complete and the pending indicator goes away. Now that second card is stacked under the first card, and again another rectangle is created to encompass the two stacked cards, with a small space at the top to display the result, which could be something like 4 + 3 = 7. The operation follows selection order: the first selected value is the left operand and the second selected value is the right operand, so for non-commutative operators, selecting 3 then selecting 5 with subtraction results in 3 - 5.
- Once cards are stacked together or a unary operator is applied on them, that new value acts as if it were a card, so players can also combine two groups together.
- Once all cards are in one group, that is the final result of their solution, which the game will indicate as acceptable / not acceptable based on the settings, and it will also display the solution's score.

### Number Precision

Every operator is evaluated with a 50-significant-digit decimal engine, not with binary doubles. Addition, subtraction, multiplication, division, powers, roots, factorials/gamma, trig, analysis and the rest all carry that precision through the board, and target acceptance compares exact values. The catalogue's famous constants carry full-precision decimal strings as well, so a target such as π is not limited to 16 digits. A manually typed exact target also keeps every typed digit: the chooser sends its text, not the rounded double, locally and over the multiplayer wire.

By default every number in the game shows up to five decimal places. During gameplay the score sidebar has a **DECIMALS** slider from 0 to 32: moving it reformats the target, every card-group header, the equation ribbon and the final result live, up to 32 decimal places (the engine keeps 50 significant digits internally). The last position reads `ALL 32`. The setting is kept on the device between sessions, and a reset control returns to five.

The deterministic daily/weekly search uses fast double probes for the thousands of candidate trees it tests; only the chosen reference board is rebuilt through the exact decimal engine before it becomes the puzzle. Puzzles still require integer targets, so their acceptance is exact.

### Round End

- In ****First to solve****, the round ends automatically the moment one group is acceptable, and it transitions into a screen that shows the winning solution.
- For the other modes, the end of each round shows all the acceptable solutions.
- These solutions are shown in a more standard math form equation like (4 + 3) * 7 = 49, with the left hand side as just operations, parenthesis, and the card values, and the right hand side as the final result.
- The winning solution also shows a read-only replay of the winner's board in card form, with the same grouped card layout and operator headers they used, so the route is readable without parsing the equation string.

### Score

Lower score is better. 10 score is added for each binary operator used. The unary penalty increases per layer: the first unary operator is 10, then the second is 20, then the third is 30, and so on with 40, 50, 60... So, using o(o(x)) would incur 30 points while o(o(o(x))) would incur 60 points. Nested unary operators on the same group count as a consecutive unary, and a binary operation resets the chain. A bind group is free: its product is created by the deal, not by a played operator. Two forbidden moves can be enabled and priced in the lobby: factorial and inverse gamma nested directly together, and a power whose base is 1 (`1 ^ x`). Each occurrence adds the configured forbidden-move penalty (200 points by default); a move that is switched off adds nothing. Factorial and plain gamma together carry no extra penalty. The solution HUD itemises forbidden moves as their own row. Its score is live: binary, unary and forbidden-move costs are summed across every group as the board is built, while accuracy only joins the total once one group remains.

When approximations are enabled (a tolerance above 0%), distance from the target adds an accuracy penalty. The used part of the tolerance band is normalised to 0–1 (exact hit 0, edge of the band 1), then multiplied by the scoring mode's weight: cost-first 2 points (so accuracy only breaks ties between equal operator costs), balanced 30 points (a full-band miss costs about one binary operator), and accuracy-first 100 points (precision can outweigh a much cheaper board). The solution HUD itemises this as its own accuracy row, and the displayed total includes it.

### Undo / Redo

Players can press z or y at any time to undo or redo actions.