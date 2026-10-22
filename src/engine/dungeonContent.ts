import type { PuzzleDifficulty } from './puzzleDifficulty'

export interface DungeonTrial {
  id: string
  title: string
  difficulty: PuzzleDifficulty
  /** Recipe in the engine recipe cabinet that shapes this trial. */
  recipeId: string
  blurb: string
}

export interface DungeonLore {
  /** Title of this page in the House ledger. */
  heading: string
  /** A line the Reckoners left on the page. */
  epigraph: string
  /** Who wrote the epigraph. */
  source: string
  /** The fragment itself, in reading order. */
  paragraphs: string[]
}

export interface DungeonGauntlet {
  id: string
  name: string
  sigil: string
  accent: string
  /** One line of flavour shown on the dungeon map. */
  theme: string
  /** Longer briefing shown when the gauntlet is opened. */
  intro: string
  /** A page of the connected story read from the gauntlet screen. */
  lore: DungeonLore
  trials: DungeonTrial[]
}

export interface DungeonGroup {
  id: string
  name: string
  /** Chapter label above the group on the dungeon map, e.g. `CHAPTER I`. */
  chapter: string
  sigil: string
  accent: string
  /** One line describing what the whole group is about. */
  theme: string
  gauntlets: DungeonGauntlet[]
}

/**
 * Two chapters, seven gauntlets each, six trials per gauntlet. Every gauntlet
 * ramps from its opening difficulty to a gatekeeper; each group opens with its
 * first gauntlet available, and the trails inside it unlock in order.
 */
export const DUNGEON_GROUPS: DungeonGroup[] = [
  {
    id: 'into-the-abyss',
    name: 'Into the Abyss',
    chapter: 'CHAPTER I',
    sigil: '☠',
    accent: '#fe4a49',
    theme: 'Seven doors of arithmetic, down to the impossible.',
    gauntlets: [
      {
        id: 'cellar',
        name: 'The Cellar',
        sigil: '♣',
        accent: '#6fd68a',
        theme: 'Damp stone, loose cards, clean arithmetic.',
        intro:
          'The first door is the easiest one. Loose cards, short hands and nothing that bites. Learn the floor before the floor learns you.',
        lore: {
          heading: 'The first chalk mark',
          epigraph: 'Every house begins with a mark someone meant to erase.',
          source: 'The First Dealer, on the cellar wall',
          paragraphs: [
            'The House of Twenty-Four has no front door, only a hatch in the cellar floor. The First Dealer built it after his daughter vanished in the middle of a game, and then he kept building, room after room, as if the next one might give her back. The chalk mark was the first thing he made. Four strokes, six strokes, a line beneath them. He never rubbed it out.',
            'One card from that first deck has no rank and no suit. The lamplighter calls it the Twenty-Fourth Card, though it is not a card at all. It is the place where a name should be. When the House is quiet, she can hear it being dealt.',
            'She keeps the ledger now. Every room tells her something, and every room lies a little. The first door is easy because the House is still teaching her its shape. Behind it, the Foundry is already warm.',
          ],
        },
        trials: [
          {
            id: 'first-light',
            title: 'First Light',
            difficulty: 'easy',
            recipeId: 'easy-first-light',
            blurb: 'A lantern, three or four cards, and a target you can reach without heroics.',
          },
          {
            id: 'mousetrap',
            title: 'Mousetrap',
            difficulty: 'easy',
            recipeId: 'easy-small-change',
            blurb: 'Small numbers, quick routes. The first taste of roots and powers.',
          },
          {
            id: 'copper-ledger',
            title: 'Copper Ledger',
            difficulty: 'medium',
            recipeId: 'medium-classic',
            blurb: 'The bookkeeper welds a dragon into the deal. Balance it into the target.',
          },
          {
            id: 'salt-cellar',
            title: 'Salt Cellar',
            difficulty: 'medium',
            recipeId: 'medium-factorials',
            blurb: 'A rook of duplicates and a five-figure bill. Factor it down to size.',
          },
          {
            id: 'root-door',
            title: 'The Root Door',
            difficulty: 'hard',
            recipeId: 'hard-analysis',
            blurb: 'Roots and logarithms guard the stair. Mind the domains.',
          },
          {
            id: 'cellar-keeper',
            title: 'Cellar Keeper',
            difficulty: 'hard',
            recipeId: 'hard-combinatorics',
            blurb:
              'Two locked groups, every counting operator, and a target that is not what it seems.',
          },
        ],
      },
      {
        id: 'foundry',
        name: 'The Foundry',
        sigil: '♦',
        accent: '#ffbe0b',
        theme: 'Powers, factorials, and a target that grows.',
        intro:
          'Everything here gets bigger. Factorials, powers and five-figure targets. The trick is not making the number; it is stopping at the right one.',
        lore: {
          heading: 'The deck is a mold',
          epigraph: 'We did not print fifty-two cards. We printed one card fifty-two times.',
          source: "Foundry Master's rule",
          paragraphs: [
            'The Foundry presses every deck in the House from one plate. A rank is only a thickness of ink. A suit is only a colour of heat. The Master says that is why the cards come apart so easily: they were never whole to begin with, only copies of a thing he will not name.',
            'The plate was cut in the shape of the missing card. Every deck since has been wrong in the same place. The Master keeps the rejects in a drawer and forbids the apprentices to count them. At night he sets a second place at his table. Nobody has ever seen who it is for.',
            'The press needs a number before it can run, and the number comes down through the pipes from the Signal Room. No one has heard the pipes ring in years. The Master still waits by them every morning, with his coat on.',
          ],
        },
        trials: [
          {
            id: 'bellows',
            title: 'Bellows',
            difficulty: 'easy',
            recipeId: 'easy-factorial',
            blurb: 'Three cards and a licence to grow. Give the bellows a squeeze.',
          },
          {
            id: 'spark-run',
            title: 'Spark Run',
            difficulty: 'medium',
            recipeId: 'medium-factorials',
            blurb: 'A rook opens the deal; factorials do the heavy lifting.',
          },
          {
            id: 'crucible',
            title: 'Crucible',
            difficulty: 'medium',
            recipeId: 'medium-foundry',
            blurb: 'Factorials and powers in the same pot. Five figures out.',
          },
          {
            id: 'anvil-hour',
            title: 'Anvil Hour',
            difficulty: 'hard',
            recipeId: 'hard-factorial',
            blurb: 'Five or six cards. Something in the target has to break.',
          },
          {
            id: 'great-gear',
            title: 'The Great Gear',
            difficulty: 'expert',
            recipeId: 'expert-menagerie',
            blurb: 'A rook cage of six cards, counted every way the cabinet allows.',
          },
          {
            id: 'foundry-master',
            title: 'Foundry Master',
            difficulty: 'expert',
            recipeId: 'expert-vault',
            blurb: 'Three welded groups and a six-figure order. The master wants it exact.',
          },
        ],
      },
      {
        id: 'signal',
        name: 'The Signal Room',
        sigil: '♠',
        accent: '#72efdd',
        theme: 'Bits, shifts and joined digits.',
        intro:
          'The room only speaks in whole numbers. Build the target out of bits, shifts and digits stitched together. Fractional answers are static.',
        lore: {
          heading: 'A voice on the wire',
          epigraph: 'A number is only a promise once someone can receive it.',
          source: 'Signal Room log, page one',
          paragraphs: [
            'Every evening a number comes down the wires. The first one is always the same, the one the House was built around. Under it, too faint to read, there is a second signal. The engineers thought it was noise. Then they noticed it repeated at the pace of a deal.',
            'The room went quiet for a week. Men stopped sleeping in their bunks and started sleeping beside the receivers. One of them wrote that a message can wait, but a pulse cannot. Whatever was sending the second signal had been doing it for a very long time.',
            'They built the Observatory to see who it belonged to. The log ends with a drawing of a lens and a note in the margin: aim above the room.',
          ],
        },
        trials: [
          {
            id: 'carrier-wave',
            title: 'Carrier Wave',
            difficulty: 'easy',
            recipeId: 'easy-signal',
            blurb: 'Whole numbers only. Shift a bit, join a digit, find the channel.',
          },
          {
            id: 'static-cling',
            title: 'Static Cling',
            difficulty: 'medium',
            recipeId: 'medium-machine',
            blurb: 'A dragon rides the wire. Bits and digit joins clear the static.',
          },
          {
            id: 'relay-nine',
            title: 'Relay Nine',
            difficulty: 'medium',
            recipeId: 'medium-machine',
            blurb: 'Nine relays, one target. The second shift will not agree with the first.',
          },
          {
            id: 'packet-loss',
            title: 'Packet Loss',
            difficulty: 'hard',
            recipeId: 'hard-signal',
            blurb: 'Five cards arrive intact. The rest of the packet is missing.',
          },
          {
            id: 'long-wire',
            title: 'The Long Wire',
            difficulty: 'expert',
            recipeId: 'expert-signal',
            blurb: 'Shifts, joins and logarithms across six cards and two locks.',
          },
          {
            id: 'dead-channel',
            title: 'Dead Channel',
            difficulty: 'extreme',
            recipeId: 'extreme-signal',
            blurb: 'Seven cards. No signal but whole numbers. Something still answers.',
          },
        ],
      },
      {
        id: 'observatory',
        name: 'The Observatory',
        sigil: '♥',
        accent: '#c77dff',
        theme: 'Trig, logarithms and reciprocal routes.',
        intro:
          'Look up. The targets here live behind degrees, logarithms and inverses. A domain error is the same as a wrong answer: the instrument goes dark.',
        lore: {
          heading: 'The number that would not fit',
          epigraph: 'We looked for a number no hand could make. The sky returned the same room.',
          source: 'Margin note, Observatory ledger',
          paragraphs: [
            'The Reckoners pointed the great lens at the sky and asked for something unreachable. For a year the instrument gave them whole numbers, all positive, all close to the first. They celebrated. Then the youngest astronomer asked why the sky looked so much like the ceiling.',
            'The first lens had been cut from a card the House already knew. It could only see what the House could see. They ground a second lens from the blank card and looked again. The sky was full of unfinished numbers, and at the centre of it was a dark room with a table.',
            'One of them wrote that the answer had never been out there. It was in the House, waiting for someone to stop asking the wrong question. They went down to count the hands. None of them filed a report.',
          ],
        },
        trials: [
          {
            id: 'moonrise',
            title: 'Moonrise',
            difficulty: 'easy',
            recipeId: 'easy-observatory',
            blurb: 'A small angle, a short hand, and a target low enough to see.',
          },
          {
            id: 'green-flash',
            title: 'Green Flash',
            difficulty: 'medium',
            recipeId: 'medium-observatory',
            blurb: 'Trig, roots and a reciprocal route to a target in the tens of thousands.',
          },
          {
            id: 'parallax',
            title: 'Parallax',
            difficulty: 'hard',
            recipeId: 'hard-observatory',
            blurb: 'Two sight lines, one target. Logarithms make the distance honest.',
          },
          {
            id: 'red-shift',
            title: 'Red Shift',
            difficulty: 'hard',
            recipeId: 'hard-observatory',
            blurb: 'The same sky, stretched. Roots and the inverse close the gap.',
          },
          {
            id: 'event-horizon',
            title: 'Event Horizon',
            difficulty: 'expert',
            recipeId: 'expert-observatory',
            blurb: 'Six cards aimed by trig, analysis and factorials. Nothing returns unchanged.',
          },
          {
            id: 'quiet-sky',
            title: 'The Quiet Sky',
            difficulty: 'extreme',
            recipeId: 'extreme-observatory',
            blurb: 'Seven cards, counting operators, and a target in the millions.',
          },
        ],
      },
      {
        id: 'menagerie',
        name: 'The Menagerie',
        sigil: '♜',
        accent: '#ff8fa3',
        theme: 'Arrangements, derangements and strange beasts.',
        intro:
          'Count the ways. Combinations, permutations, Stirling numbers and factorials prowl these cages. Every arrangement is legal until the cards run out.',
        lore: {
          heading: 'The escaped arrangement',
          epigraph: 'Count every hand and one will still be missing.',
          source: 'Menagerie census, final entry',
          paragraphs: [
            'The Menagerie was built to hold every arrangement the Reckoners could name. They filled cages with every order, every reversal, every row that almost repeated. The census was finite. The beasts were not. On the day the last cage was counted, one arrangement was already gone.',
            'It can wear any face until someone observes it, which is why it cannot be kept in a row. The Reckoners built stronger cages. The cages became locks. The locks became rooms, and the rooms became the rest of the House.',
            'The Ringmaster says the escaped thing is not dangerous. It is the only thing that can reach every door. That is why the Vault was built around it, and why the Dealer never stopped looking for it. He called it his daughter. The Ringmaster calls it the missing hand.',
          ],
        },
        trials: [
          {
            id: 'two-rabbits',
            title: 'Two Rabbits',
            difficulty: 'easy',
            recipeId: 'easy-combinatorics',
            blurb: 'Count the ways two rabbits can leave a hat.',
          },
          {
            id: 'aviary',
            title: 'The Aviary',
            difficulty: 'medium',
            recipeId: 'medium-combinatorics',
            blurb: 'A rook of birds, and every arrangement counted.',
          },
          {
            id: 'herd-logic',
            title: 'Herd Logic',
            difficulty: 'hard',
            recipeId: 'hard-combinatorics',
            blurb: 'Two binds and a counting problem with teeth.',
          },
          {
            id: 'stirling-cage',
            title: "Stirling's Cage",
            difficulty: 'hard',
            recipeId: 'hard-factorial',
            blurb: 'Duplicates stack. Factorials and Stirling numbers decide the exit.',
          },
          {
            id: 'derangement',
            title: 'The Derangement',
            difficulty: 'expert',
            recipeId: 'expert-menagerie',
            blurb: 'Six cards, none of which want to be where they belong.',
          },
          {
            id: 'ringmaster',
            title: 'Ringmaster',
            difficulty: 'extreme',
            recipeId: 'extreme-menagerie',
            blurb: 'The whole menagerie, seven cards, one gate.',
          },
        ],
      },
      {
        id: 'vault',
        name: 'The Clockwork Vault',
        sigil: '⚙',
        accent: '#f2c94c',
        theme: 'Binds, locks and keyed groups.',
        intro:
          'The vault deals its own opening groups. Dragons and rooks are welded shut before you arrive, and every lock counts toward the same target.',
        lore: {
          heading: 'The locks came before the door',
          epigraph: 'A lock is a rule that has learned to close by itself.',
          source: 'Vault inscription',
          paragraphs: [
            'The Clockwork Vault holds no gold. It holds rules. Consecutive cards fuse when they touch, duplicates stack into a single weight, and every lock takes away a door before anyone reaches it. The Vault Master calls this security. The lamplighter calls it a house with too many walls.',
            'There are twenty-four keyholes in the inner door. The Master insists that is a coincidence. The key is not metal. It is any hand that spends every card and still arrives, which is why so few people have seen the room beyond.',
            'The last lock opens onto the Abyss. The Master will not say what is down there. He only says the first proof is still running, and that the Dealer went down a long time ago with a deck that was one card short.',
          ],
        },
        trials: [
          {
            id: 'first-lock',
            title: 'First Lock',
            difficulty: 'medium',
            recipeId: 'medium-classic',
            blurb: 'A dragon is already welded. The lock is the rest of the hand.',
          },
          {
            id: 'tumbler',
            title: 'Tumbler',
            difficulty: 'hard',
            recipeId: 'hard-vault',
            blurb: 'Three groups, no loose cards, no easy fold.',
          },
          {
            id: 'double-bit',
            title: 'Double Bit',
            difficulty: 'expert',
            recipeId: 'expert-vault',
            blurb: 'Six cards, three locks and a target with too many zeroes.',
          },
          {
            id: 'escapement',
            title: 'The Escapement',
            difficulty: 'expert',
            recipeId: 'expert-vault',
            blurb: 'Every gear is a bind. One tooth out of place and the vault stays shut.',
          },
          {
            id: 'master-key',
            title: 'Master Key',
            difficulty: 'confounding',
            recipeId: 'confounding-almanac',
            blurb: 'Eight cards and both forbidden shortcuts charging 400 points.',
          },
          {
            id: 'vault-door',
            title: 'The Vault Door',
            difficulty: 'confounding',
            recipeId: 'confounding-ninth',
            blurb: 'The last lock. Eight or nine cards and a five-hundred-point toll.',
          },
        ],
      },
      {
        id: 'abyss',
        name: 'The Abyss',
        sigil: '☠',
        accent: '#fe4a49',
        theme: 'Every operator. No mercy.',
        intro:
          'The last door. Every operator is live, the targets are monstrous, and the ledger is unforgiving. Solvable is not the same as reasonable.',
        lore: {
          heading: 'The proof that failed',
          epigraph: 'We set out to prove the House had one answer. The answer became a question.',
          source: 'Ledger, final page of Chapter I',
          paragraphs: [
            'The Dealer brought every card and every rule into the Abyss for a single proof: that the House had one answer, and that the answer was the one he had written on the cellar wall. The first thousand hands agreed with him. The next thousand did not.',
            'Some reached the number by asking a smaller question. One kept going after it arrived, because no rule told it to stop. The ledger cracked along the spine. The dark filled with all the answers the Dealer had refused, and the sound they made was not a roar. It was a room full of people talking at once.',
            'The Reckoners called the spill Chaos and sealed the second chapter behind it. The lamplighter stood in the crack with her lamp held high. Then she went in, because the Dealer had gone in first.',
          ],
        },
        trials: [
          {
            id: 'pressure',
            title: 'Pressure',
            difficulty: 'extreme',
            recipeId: 'extreme-cabinet',
            blurb: 'Seven cards, every operator, a dragon and rook already fused.',
          },
          {
            id: 'black-tide',
            title: 'Black Tide',
            difficulty: 'extreme',
            recipeId: 'extreme-abyss',
            blurb: 'Eight cards, both traps live, target in the millions.',
          },
          {
            id: 'cold-below',
            title: 'The Cold Below',
            difficulty: 'confounding',
            recipeId: 'confounding-ninth',
            blurb: 'The dark does arithmetic. Nine cards and a five-hundred-point toll.',
          },
          {
            id: 'nothing-answers',
            title: 'Nothing Answers',
            difficulty: 'confounding',
            recipeId: 'confounding-void',
            blurb: 'Four binds, nine cards, six hundred points a shortcut.',
          },
          {
            id: 'ninth-door',
            title: 'The Ninth Door',
            difficulty: 'impossible',
            recipeId: 'impossible-meridian',
            blurb: 'Nine cards. Every family. Every shortcut expensive. It is still solvable.',
          },
          {
            id: 'abyss-eternal',
            title: 'Abyss Eternal',
            difficulty: 'impossible',
            recipeId: 'impossible-echo',
            blurb: 'The last trial. The generator calls it impossible; the validator disagrees.',
          },
        ],
      },
    ],
  },
  {
    id: 'trials-of-chaos',
    name: 'Trials of Chaos',
    chapter: 'CHAPTER II',
    sigil: '✹',
    accent: '#c77dff',
    theme: 'Targets and rules that the first seven doors never asked for.',
    gauntlets: [
      {
        id: 'decimal-sea',
        name: 'The Decimal Sea',
        sigil: '≈',
        accent: '#72efdd',
        theme: 'Every target is a fraction, never a whole number.',
        intro:
          'Nothing here lands neatly. One door forbids multiplication, another keeps the answer below one, and the last carries fourteen cards into a million-scale decimal.',
        lore: {
          heading: 'The remainder',
          epigraph: 'When the House divided twenty-four, it did not stop.',
          source: 'First line of Chapter II',
          paragraphs: [
            'What leaked out of the broken ledger became water. The first number would not divide cleanly, so it kept dividing. The sea filled with digits that never ended, with fractions that learned to repeat, with numbers that wore the faces of whole numbers and then forgot which face was theirs.',
            'The Reckoners tried to mop it up. They built a lighthouse to warn ships, though no ship has ever come this far. The light is not a flame. It is a single point, burning at the end of a very long sum.',
            'The First Dealer is the keeper. He rows past the lamplighter without seeing her, his coat full of salt, his hands still counting. Beyond him, the failed hands are stacked in the Scrapheap. They are still warm.',
          ],
        },
        trials: [
          {
            id: 'saltwater',
            title: 'Saltwater',
            difficulty: 'medium',
            recipeId: 'chaos-decimal-tide',
            blurb: 'Five cards, no multiplication, and a target with a tail.',
          },
          {
            id: 'half-tide',
            title: 'Half Tide',
            difficulty: 'medium',
            recipeId: 'chaos-decimal-half-tide',
            blurb: 'Five cards and a target between zero and one. Whole numbers do not count.',
          },
          {
            id: 'recurring',
            title: 'Recurring',
            difficulty: 'hard',
            recipeId: 'chaos-decimal-recurring',
            blurb: 'Eight cards of roots and reciprocals leave a repeating tail.',
          },
          {
            id: 'long-division',
            title: 'Long Division',
            difficulty: 'hard',
            recipeId: 'chaos-decimal-long-division',
            blurb: 'Eight cards with multiplication stripped out. Divide or fall short.',
          },
          {
            id: 'irrational-reef',
            title: 'The Irrational Reef',
            difficulty: 'expert',
            recipeId: 'chaos-decimal-reef',
            blurb: 'Ten cards in two locks around a fraction in the thousands. Mind the domains.',
          },
          {
            id: 'decimal-deep',
            title: 'Decimal Deep',
            difficulty: 'extreme',
            recipeId: 'chaos-decimal-deep',
            blurb: 'Fourteen cards in four locks, the whole cabinet, and a million-scale target with a tail.',
          },
        ],
      },
      {
        id: 'scrapheap',
        name: 'The Scrapheap',
        sigil: '⚒',
        accent: '#ffbe0b',
        theme: 'Crowded hands and the operators nobody reaches for.',
        intro:
          'No addition and no multiplication. Nine to nineteen cards arrive welded into locks, and only shifts, joins, logs and counts can pull them apart. The last door is longer than the table.',
        lore: {
          heading: 'Everything we could not solve',
          epigraph: 'A wrong answer is still a hand. Do not throw it away.',
          source: "Scrapkeeper's notice",
          paragraphs: [
            'The Scrapheap is where the House keeps what did not work. Every hand that missed, every route that ended in a fraction, every answer that arrived too late is piled here in a mound that smells of hot metal and old paper. The pile has learned to keep its own score.',
            'The workers do not weld with fire. They weld with loss, because the scrap is afraid of anything that grows too neatly. Give it a rule that only ever grows, and the whole heap will lean away from you. Give it a rule that takes something back, and it will let you pass.',
            'At the centre stands the Scrap Titan. It is made of every answer that was almost right, and it wears the Dealer\'s face. It does not want to be solved. It wants a number that will not change. The lamplighter finds a child\'s mitten in the heap and puts it in her pocket.',
          ],
        },
        trials: [
          {
            id: 'rust-fetch',
            title: 'Rust Fetch',
            difficulty: 'hard',
            recipeId: 'chaos-scrap-rust',
            blurb: 'Nine cards, two locks, no add or multiply, and every trap priced and live.',
          },
          {
            id: 'odd-parts',
            title: 'Odd Parts',
            difficulty: 'hard',
            recipeId: 'chaos-scrap-odd-parts',
            blurb: 'Only duplicate ranks fuse for you. Nine cards and no add or multiply.',
          },
          {
            id: 'junkyard',
            title: 'Junkyard',
            difficulty: 'expert',
            recipeId: 'chaos-scrap-junkyard',
            blurb: 'Twelve cards in three locks, with both plain arithmetic operators stripped out.',
          },
          {
            id: 'salvage',
            title: 'Salvage Line',
            difficulty: 'expert',
            recipeId: 'chaos-scrap-salvage',
            blurb: 'A dragon-only salvage run. Consecutive ranks fuse; no add or multiply remains.',
          },
          {
            id: 'crusher',
            title: 'The Crusher',
            difficulty: 'extreme',
            recipeId: 'chaos-scrap-crusher',
            blurb: 'Fifteen cards, four locks, no add or multiply, and a nine-figure ceiling.',
          },
          {
            id: 'nine-scraps',
            title: 'Scrap Titan',
            difficulty: 'impossible',
            recipeId: 'chaos-scrap-titan',
            blurb: 'Nineteen cards, four locks, and no add or multiply anywhere.',
          },
        ],
      },
      {
        id: 'billion-vault',
        name: 'The Billion Vault',
        sigil: '⛁',
        accent: '#f2c94c',
        theme: 'Targets in the tens and hundreds of millions.',
        intro:
          'The ledger has grown teeth. Targets start in the ten millions and end under a billion; one door pins the answer near ten million, and the last opens onto twenty loose cards with no lock to hide behind.',
        lore: {
          heading: 'The number that ate the house',
          epigraph: 'A number is a promise, not a size.',
          source: 'Written inside the vault door',
          paragraphs: [
            'After the sea, the Dealer tried the opposite mistake. He built a number so large that no hand could miss it. Nine figures, then ten, then more zeroes than there were cards in the House. He told himself that size would make it true.',
            'The number became a vault. The vault became weather. Counting houses grew inside it, one lending the next a little more magnitude, until nobody could agree on the last digit and everyone agreed to stop looking. The Dealer walked through the rooms for years without finding the door he had come in by.',
            "On the inner door, in his own hand: \"A number is a promise, not a size.\" Under it, scratched out so hard the wood had split: \"I owe her.\" The Undertow is where the House keeps what it owes.",
          ],
        },
        trials: [
          {
            id: 'lockbox',
            title: 'Lockbox',
            difficulty: 'expert',
            recipeId: 'chaos-big-lockbox',
            blurb: 'Eight cards and a target in the ten millions. Factorials are the short route.',
          },
          {
            id: 'ten-million',
            title: 'Ten Million',
            difficulty: 'expert',
            recipeId: 'chaos-big-ten-million',
            blurb: 'Nine cards, no factorials, and a tight band pinned around ten million.',
          },
          {
            id: 'counting-house',
            title: 'The Counting House',
            difficulty: 'extreme',
            recipeId: 'chaos-big-counting-house',
            blurb: 'Twelve cards in three locks, aimed deep into the hundreds of millions.',
          },
          {
            id: 'compound-interest',
            title: 'Compound Interest',
            difficulty: 'extreme',
            recipeId: 'chaos-big-compound',
            blurb: 'Thirteen cards built on powers and growth. One power route is billed.',
          },
          {
            id: 'billion-door',
            title: 'The Billion Door',
            difficulty: 'impossible',
            recipeId: 'chaos-big-door',
            blurb: 'Seventeen cards, four locks, and a target within a tenth of a billion.',
          },
          {
            id: 'vault-of-nine',
            title: 'Vault of Twenty',
            difficulty: 'impossible',
            recipeId: 'chaos-big-vault',
            blurb: 'Twenty loose cards and no locks. The number is not the hard part.',
          },
        ],
      },
      {
        id: 'undertow',
        name: 'The Undertow',
        sigil: '▽',
        accent: '#5bc0eb',
        theme: 'Every target sits below zero.',
        intro:
          'The table has tilted. Build the number, then drag it under: one door forbids addition, another hides a fraction below the surface, and the last falls a hundred million below the table.',
        lore: {
          heading: 'The debt side',
          epigraph: 'Every failed proof borrowed from the next.',
          source: 'Ledger balance, below the line',
          paragraphs: [
            'The Undertow is the debt side of the ledger. Every time an answer overshot, the House borrowed the difference from the next hand. The interest was negative, so the water rose. Down here the cards are cold, the ink runs backward, and every rule has to be spoken in the past tense.',
            'Loss is the only honest direction. Take something away, then take something else away, and eventually you arrive at the number you were trying to reach. The Reckoners who came to audit the books understood this too late. None of them came back up.',
            'A voice under the water says the first hand is still down here, intact, waiting on a table no one has cleared. It says the Dealer goes to it every night and deals himself the same cards. Follow the cold current to the Hourglass.',
          ],
        },
        trials: [
          {
            id: 'low-tide',
            title: 'Low Tide',
            difficulty: 'medium',
            recipeId: 'chaos-negative-low-tide',
            blurb: 'Five cards. Subtract past zero and stay there.',
          },
          {
            id: 'backwash',
            title: 'Backwash',
            difficulty: 'medium',
            recipeId: 'chaos-negative-backwash',
            blurb: 'No addition allowed. Every step toward the target passes through subtraction.',
          },
          {
            id: 'cold-current',
            title: 'Cold Current',
            difficulty: 'hard',
            recipeId: 'chaos-negative-cold-current',
            blurb: 'Ten cards in two dragon locks, pulling a target a hundred thousand below zero.',
          },
          {
            id: 'sinkhole',
            title: 'Brine',
            difficulty: 'hard',
            recipeId: 'chaos-negative-brine',
            blurb: 'Nine cards, negative and fractional at once. The target sits just under the surface.',
          },
          {
            id: 'below-zero',
            title: 'Below Zero',
            difficulty: 'extreme',
            recipeId: 'chaos-negative-below-zero',
            blurb: 'Thirteen cards in three locks, then a long fall through the negative millions.',
          },
          {
            id: 'deep-freeze',
            title: 'The Deep Freeze',
            difficulty: 'impossible',
            recipeId: 'chaos-negative-deep-freeze',
            blurb: 'Eighteen loose cards, and a target a hundred million under the floorboards.',
          },
        ],
      },
      {
        id: 'hourglass',
        name: 'The Hourglass',
        sigil: '⌛',
        accent: '#ff8fa3',
        theme: 'Binds, shifts and digit joins under a heavy toll.',
        intro:
          'The clock does not run here, but every shortcut is billed as if it does. Locks arrive fused, digits want to join, and the last door carries twenty cards into six groups.',
        lore: {
          heading: 'The hand dealt forever',
          epigraph: 'The House does not measure time. It measures deals.',
          source: 'Hourglass, lower bulb',
          paragraphs: [
            'The Hourglass does not count seconds. It counts deals. Every grain is a card that was never played. When the glass turns, the first hand is dealt again, and somewhere in the House a chair scrapes back from a table.',
            'In the lower bulb there is a table with two chairs. One is empty. The other is still warm. A hand lies face down between them, and the top card is blank. The lamplighter sits in the empty chair and waits, but nobody comes to take the other one.',
            'The glass turns whenever someone tries to leave. It always points toward the Sphinx. The Sphinx has been waiting for the right question, and the lamplighter is beginning to understand that she has been carrying it since the cellar.',
          ],
        },
        trials: [
          {
            id: 'cracked-glass',
            title: 'Cracked Glass',
            difficulty: 'hard',
            recipeId: 'chaos-hourglass-cracked',
            blurb: 'Eight cards, two locks, shifts and joins under a three-hundred-point toll.',
          },
          {
            id: 'sandfall',
            title: 'Sandfall',
            difficulty: 'hard',
            recipeId: 'chaos-hourglass-sandfall',
            blurb: 'Nine cards with multiplication removed. Joins and shifts have to cover for it.',
          },
          {
            id: 'two-chambers',
            title: 'Two Chambers',
            difficulty: 'expert',
            recipeId: 'chaos-hourglass-two-chambers',
            blurb: 'Twelve cards under four locks, with four hundred points a shortcut.',
          },
          {
            id: 'the-turn',
            title: 'The Turn',
            difficulty: 'expert',
            recipeId: 'chaos-hourglass-turn',
            blurb: 'Thirteen cards; the target only opens when the digits collide.',
          },
          {
            id: 'last-grain',
            title: 'Last Grain',
            difficulty: 'confounding',
            recipeId: 'chaos-hourglass-last-grain',
            blurb: 'Sixteen cards in six locks, and six hundred a shortcut.',
          },
          {
            id: 'shattered-hour',
            title: 'Shattered Hour',
            difficulty: 'impossible',
            recipeId: 'chaos-hourglass-shattered',
            blurb: 'Twenty cards in six locks, with a four-figure bill for every shortcut.',
          },
        ],
      },
      {
        id: 'sphinx',
        name: "The Sphinx's Ledger",
        sigil: '☥',
        accent: '#6fd68a',
        theme: 'Counting routes and locked cages.',
        intro:
          'The sphinx counts everything: arrangements, derangements, the cards you leave fused. One floor removes addition, another only fuses duplicates, and the last answer needs twenty loose cards and no lock to hide behind.',
        lore: {
          heading: 'The question beneath the answer',
          epigraph: 'The answer is not a number. It is the hand that keeps reaching.',
          source: 'The Sphinx, first riddle',
          paragraphs: [
            "The Sphinx is the House's accountant, or perhaps its grief. It has counted every hand that could be dealt and every room those hands could reach. Its ledger is the only complete one in the building. The lamplighter asks to see the last page. The Sphinx says she has already seen it.",
            'It asks what the first number means if any number can be made. The Reckoners wanted that number to be special. The ledger kept opening a thousand other doors with the same hand. They called the doors mistakes and sealed them, one after another, until the House was full of nothing else.',
            'The Sphinx offers two ways out. Close the ledger here, or turn to the last page. The last page is a small room with one lamp, burning since the Cellar. The lamplighter turns the page.',
          ],
        },
        trials: [
          {
            id: 'riddle-one',
            title: 'Riddle One',
            difficulty: 'hard',
            recipeId: 'chaos-sphinx-riddle',
            blurb: 'Eight cards and a rook of duplicates. The sphinx only counts what repeats.',
          },
          {
            id: 'counting-claws',
            title: 'Counting Claws',
            difficulty: 'hard',
            recipeId: 'chaos-sphinx-counting',
            blurb: 'Twelve cards in a dragon lock, with addition removed. Counting routes carry the target.',
          },
          {
            id: 'riddle-room',
            title: 'The Riddle Room',
            difficulty: 'expert',
            recipeId: 'chaos-sphinx-riddle-room',
            blurb: 'Twelve cards in two locks, with every counting family in the cabinet.',
          },
          {
            id: 'twelve-doors',
            title: 'Twelve Doors',
            difficulty: 'extreme',
            recipeId: 'chaos-sphinx-twelve-doors',
            blurb: 'Fourteen cards fused by rank runs, all aimed at one answer in the millions.',
          },
          {
            id: 'sphinx-cage',
            title: "Sphinx's Cage",
            difficulty: 'extreme',
            recipeId: 'chaos-sphinx-cage',
            blurb: 'Fifteen cards caged by duplicate ranks. Every operator shares one target.',
          },
          {
            id: 'the-answer',
            title: 'The Answer',
            difficulty: 'impossible',
            recipeId: 'chaos-sphinx-answer',
            blurb: 'Twenty loose cards, and a number only the full counting cabinet reaches.',
          },
        ],
      },
      {
        id: 'last-light',
        name: 'The Last Light',
        sigil: '✹',
        accent: '#ff4fd8',
        theme: 'Every operator. Up to twenty cards. No mercy.',
        intro:
          'Past the sphinx there is one lamp left. Every operator is live, the hand grows from ten cards to twenty, and the toll climbs to five figures. The last door inverts the trick: a huge hand, a target small enough to lose in it.',
        lore: {
          heading: 'The first lamp',
          epigraph: 'The first question was never the number. It was whether anyone would stay.',
          source: 'The First Dealer, final line',
          paragraphs: [
            'The lamp in the Last Light is the one from the Cellar. It has burned through both chapters without oil. Under it sit the first table, the first hand, and the chalk mark, still unfinished. The Dealer\'s chair is empty. The cards are fanned out the way he left them.',
            'The final door asks for a small number from a huge hand. It is not a test of reach. It is a test of restraint. The lamplighter stands there for a long time, holding the blank card, understanding at last that the Dealer never hid it. He left it blank because writing his daughter\'s name would have made the loss final.',
            'She sets the card face up on the table. Then she takes the chair, and she deals. The House stops being a dungeon. It becomes a table again. Somewhere above her, the first chalk mark is still there, waiting for someone to finish the sentence.',
          ],
        },
        trials: [
          {
            id: 'dying-spark',
            title: 'Dying Spark',
            difficulty: 'extreme',
            recipeId: 'chaos-last-dying',
            blurb: 'Ten cards, three locks, and a five-hundred-point toll on both traps.',
          },
          {
            id: 'under-nine-suns',
            title: 'Under Nine Suns',
            difficulty: 'extreme',
            recipeId: 'chaos-last-nine-suns',
            blurb: 'Twelve cards, every family live, and the ledger grows hotter.',
          },
          {
            id: 'black-lamp',
            title: 'The Black Lamp',
            difficulty: 'confounding',
            recipeId: 'chaos-last-black-lamp',
            blurb: 'Fourteen cards in four locks, and seven hundred a shortcut.',
          },
          {
            id: 'nothing-left',
            title: 'Nothing Left',
            difficulty: 'confounding',
            recipeId: 'chaos-last-nothing',
            blurb: 'Sixteen cards in five locks. Only expensive routes remain.',
          },
          {
            id: 'final-toll',
            title: 'Final Toll',
            difficulty: 'impossible',
            recipeId: 'chaos-last-final-toll',
            blurb: 'Eighteen loose cards, and a four-figure bill for the obvious move.',
          },
          {
            id: 'last-light',
            title: 'Last Light',
            difficulty: 'impossible',
            recipeId: 'chaos-last-light',
            blurb: 'Twenty loose cards, every operator, and a target down in the hundreds.',
          },
        ],
      },
    ],
  },
]

export const DUNGEON_GAUNTLETS: DungeonGauntlet[] = DUNGEON_GROUPS.flatMap(
  (group) => group.gauntlets,
)

export const DUNGEON_TRIAL_COUNT = DUNGEON_GAUNTLETS.reduce(
  (total, gauntlet) => total + gauntlet.trials.length,
  0,
)
