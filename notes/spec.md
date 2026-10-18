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
- Targets are randomly chosen from the range, but there is also an option where the host can select a target number.
- ****Approximations:**** By default zero, but signifies the percent error to which solutions are acceptable. For example, if this field is 1 and the target number is 100, then the game accepts (and displays that it will accept) any end value within 1 percent error of 100. The % error band is inclusive. A target of 0 just has 0 tolerable error. When approximations > 0, closeness to the target doesn't matter for now.
- ****Card pool:**** One deck, two decks, three decks, unlimited (with replacement, no consideration of pools, every card is always equally likely). The deck values are the standard cards in a deck, but J = 11, Q = 12, K = 13 and A = 1.
- ****Allowed operators:****
- ****"Basic"**** (add, sub, mult, divide) are all binary operators.
- ****"Powers and roots"**** are binary operators: for example, 5 root 3 consumes a 5 and a 3 and produces 5 ^ (1/3), or 5 power 3 produces 5^3.
- ****"Factorials and gamma"**** are unary operators: factorial (x!), gamma (Γ(x)), and inverse gamma (Γ⁻¹(x), the value whose gamma is x). They are not banned when used together, but factorial and inverse gamma nested together incur 200 points each time, for example factorial(inverseGamma(x)) or inverseGamma(factorial(x)). Factorials and gammas can be used on all real numbers (using the gamma definition for factorial), except for when the result would be undefined. Inverse gamma uses the principal branch (the solution at or above the gamma minimum of ≈0.8856), so it is undefined for inputs at or below that minimum and for non-positive inputs.
- ****"Basic trig"**** allows unary operators sin, cos, and tan in degrees.
- ****"Inverse"**** allows the usage of a unary operator that gives a number's inverse.
- ****"Bit shifting"**** allows the usage of bit shifting operators like RSHIFT and LSHIFT, for example LSHIFT(5,3) shifts the bits of 5 = 101 to the left by 3 slots.
- ****"Concatenate"**** allows the binary operator `||`, which joins the decimal digits of its operands in selection order: 6 || 10 = 610 and 10 || 6 = 106. Both operands must be whole numbers of zero or more, and the result must stay inside the exactly representable integer range, so anything larger is refused rather than silently rounded. Scored like every other binary operator (+10).
- ****First to x:**** After a round ends, the winning player gets a point, or if nobody wins then nobody gets a point. The first player to x wins the entire game. The host can choose to skip a round at any time or end the entire game at any time.

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

### Round End

- In ****First to solve****, the round ends automatically the moment one group is acceptable, and it transitions into a screen that shows the winning solution.
- For the other modes, the end of each round shows all the acceptable solutions.
- These solutions are shown in a more standard math form equation like (4 + 3) * 7 = 49, with the left hand side as just operations, parenthesis, and the card values, and the right hand side as the final result.

### Score

Lower score is better. 10 score is added for each binary operator used. The unary penalty increases per layer: the first unary operator is 10, then the second is 20, then the third is 30, and so on with 40, 50, 60... So, using o(o(x)) would incur 30 points while o(o(o(x))) would incur 60 points. Nested unary operators on the same group count as a consecutive unary, and a binary operation resets the chain. Factorial and inverse gamma nested together incur 200 points each time when nested; factorial and gamma together carry no extra penalty.

### Undo / Redo

Players can press z or y at any time to undo or redo actions.