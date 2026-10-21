import type { PuzzleDifficulty } from './puzzleDifficulty'

export interface DungeonTrial {
  id: string
  title: string
  difficulty: PuzzleDifficulty
  /** Recipe in the engine recipe cabinet that shapes this trial. */
  recipeId: string
  blurb: string
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
          'Nothing here lands neatly. Division leaves digits behind the point, roots refuse to settle, and the closest board still has to carry all of them.',
        trials: [
          {
            id: 'saltwater',
            title: 'Saltwater',
            difficulty: 'medium',
            recipeId: 'chaos-decimal-medium',
            blurb: 'Four or five loose cards, one division, and a target with a tail.',
          },
          {
            id: 'half-tide',
            title: 'Half Tide',
            difficulty: 'medium',
            recipeId: 'chaos-decimal-medium',
            blurb: 'The point is never where the cards want it. Split the difference.',
          },
          {
            id: 'recurring',
            title: 'Recurring',
            difficulty: 'hard',
            recipeId: 'chaos-decimal-hard',
            blurb: 'Roots and reciprocals leave a repeating tail after the decimal.',
          },
          {
            id: 'long-division',
            title: 'Long Division',
            difficulty: 'hard',
            recipeId: 'chaos-decimal-hard',
            blurb: 'Five or six cards and a target that refuses to round.',
          },
          {
            id: 'irrational-reef',
            title: 'The Irrational Reef',
            difficulty: 'expert',
            recipeId: 'chaos-decimal-expert',
            blurb: 'Factorials and logs around a fractional target. Mind the domains.',
          },
          {
            id: 'decimal-deep',
            title: 'Decimal Deep',
            difficulty: 'extreme',
            recipeId: 'chaos-decimal-extreme',
            blurb: 'Seven cards, the whole cabinet, and a six-figure target with a tail.',
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
          'The plain tools are gone. Eight or nine cards arrive welded into locks, and only shifts, joins, logs and counts can pull them apart. Find the ugly route that works.',
        trials: [
          {
            id: 'rust-fetch',
            title: 'Rust Fetch',
            difficulty: 'hard',
            recipeId: 'chaos-scrap-hard',
            blurb: 'Eight cards, no add or multiply, and every trap priced and live.',
          },
          {
            id: 'odd-parts',
            title: 'Odd Parts',
            difficulty: 'hard',
            recipeId: 'chaos-scrap-hard',
            blurb: 'The binder has already done half the work. Use what it left.',
          },
          {
            id: 'junkyard',
            title: 'Junkyard',
            difficulty: 'expert',
            recipeId: 'chaos-scrap-expert',
            blurb: 'Eight or nine cards in up to four binds, and no clean way through.',
          },
          {
            id: 'salvage',
            title: 'Salvage Line',
            difficulty: 'expert',
            recipeId: 'chaos-scrap-expert',
            blurb: 'Every bind costs nothing, but every shortcut costs four hundred.',
          },
          {
            id: 'crusher',
            title: 'The Crusher',
            difficulty: 'extreme',
            recipeId: 'chaos-scrap-extreme',
            blurb: 'Nine cards, no add or multiply, and a seven-figure target.',
          },
          {
            id: 'nine-scraps',
            title: 'Nine Scraps',
            difficulty: 'impossible',
            recipeId: 'chaos-scrap-impossible',
            blurb: 'Nine cards, four binds, and the plainest operators removed.',
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
          'The ledger has grown teeth. Targets start in the ten millions and end a hair under a billion, so every shortcut you save has to survive the climb.',
        trials: [
          {
            id: 'lockbox',
            title: 'Lockbox',
            difficulty: 'expert',
            recipeId: 'chaos-big-expert',
            blurb: 'Six or seven cards and a target in the ten millions.',
          },
          {
            id: 'ten-million',
            title: 'Ten Million',
            difficulty: 'expert',
            recipeId: 'chaos-big-expert',
            blurb: 'Factorials and counts stack toward a very large number.',
          },
          {
            id: 'counting-house',
            title: 'The Counting House',
            difficulty: 'extreme',
            recipeId: 'chaos-big-extreme',
            blurb: 'Seven or eight cards aimed at the hundreds of millions.',
          },
          {
            id: 'compound-interest',
            title: 'Compound Interest',
            difficulty: 'extreme',
            recipeId: 'chaos-big-extreme',
            blurb: 'Two binds, a five-hundred-point toll, and a target that keeps growing.',
          },
          {
            id: 'billion-door',
            title: 'The Billion Door',
            difficulty: 'impossible',
            recipeId: 'chaos-big-impossible',
            blurb: 'Nine cards, four binds, and a target a hair under a billion.',
          },
          {
            id: 'vault-of-nine',
            title: 'Vault of Nine',
            difficulty: 'impossible',
            recipeId: 'chaos-big-impossible',
            blurb: 'The last lock in the vault. The number is not the hard part.',
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
          'The table has tilted. Build the number, then drag it under: every target on this floor is negative, and the cheapest route is the one that keeps it there.',
        trials: [
          {
            id: 'low-tide',
            title: 'Low Tide',
            difficulty: 'medium',
            recipeId: 'chaos-negative-medium',
            blurb: 'Four or five cards. Subtract past zero and stay there.',
          },
          {
            id: 'backwash',
            title: 'Backwash',
            difficulty: 'medium',
            recipeId: 'chaos-negative-medium',
            blurb: 'The target is small, dark, and on the wrong side of the line.',
          },
          {
            id: 'cold-current',
            title: 'Cold Current',
            difficulty: 'hard',
            recipeId: 'chaos-negative-hard',
            blurb: 'Roots, reciprocals, and a target fifty thousand below zero.',
          },
          {
            id: 'sinkhole',
            title: 'Sinkhole',
            difficulty: 'extreme',
            recipeId: 'chaos-negative-extreme',
            blurb: 'Factorials and counts on six or seven cards, then a long fall.',
          },
          {
            id: 'below-zero',
            title: 'Below Zero',
            difficulty: 'extreme',
            recipeId: 'chaos-negative-extreme',
            blurb: 'Two million below the table and every digit has to be earned.',
          },
          {
            id: 'deep-freeze',
            title: 'The Deep Freeze',
            difficulty: 'impossible',
            recipeId: 'chaos-negative-impossible',
            blurb: 'Eight cards, every operator, and a target under the floorboards.',
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
          'The clock does not run here, but every shortcut is billed as if it does. Locks arrive fused, digits want to join, and nothing is free.',
        trials: [
          {
            id: 'cracked-glass',
            title: 'Cracked Glass',
            difficulty: 'hard',
            recipeId: 'chaos-hourglass-hard',
            blurb: 'Binds, shifts and joins under a three-hundred-point toll.',
          },
          {
            id: 'sandfall',
            title: 'Sandfall',
            difficulty: 'hard',
            recipeId: 'chaos-hourglass-hard',
            blurb: 'Six or seven cards, two locks, and a target in the hundred thousands.',
          },
          {
            id: 'two-chambers',
            title: 'Two Chambers',
            difficulty: 'expert',
            recipeId: 'chaos-hourglass-expert',
            blurb: 'Seven cards under two locks, with four hundred points a shortcut.',
          },
          {
            id: 'the-turn',
            title: 'The Turn',
            difficulty: 'expert',
            recipeId: 'chaos-hourglass-expert',
            blurb: 'The hand turns over; the joins are the only way through.',
          },
          {
            id: 'last-grain',
            title: 'Last Grain',
            difficulty: 'confounding',
            recipeId: 'chaos-hourglass-confounding',
            blurb: 'Eight cards, four binds, and five hundred a shortcut.',
          },
          {
            id: 'shattered-hour',
            title: 'Shattered Hour',
            difficulty: 'confounding',
            recipeId: 'chaos-hourglass-confounding',
            blurb: 'The glass is gone. The locks and the bill remain.',
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
          'The sphinx counts everything: arrangements, derangements, the cards you leave fused. Answer with a board that uses every one of them.',
        trials: [
          {
            id: 'riddle-one',
            title: 'Riddle One',
            difficulty: 'hard',
            recipeId: 'chaos-sphinx-hard',
            blurb: 'Counting operators and a rook of duplicates under the sphinx eye.',
          },
          {
            id: 'counting-claws',
            title: 'Counting Claws',
            difficulty: 'hard',
            recipeId: 'chaos-sphinx-hard',
            blurb: 'How many ways? The target already knows.',
          },
          {
            id: 'riddle-room',
            title: 'The Riddle Room',
            difficulty: 'expert',
            recipeId: 'chaos-sphinx-expert',
            blurb: 'Seven cards, every counting route, and two locks already closed.',
          },
          {
            id: 'twelve-doors',
            title: 'Twelve Doors',
            difficulty: 'extreme',
            recipeId: 'chaos-sphinx-extreme',
            blurb: 'Eight cards and one eight-figure answer behind them.',
          },
          {
            id: 'sphinx-cage',
            title: "Sphinx's Cage",
            difficulty: 'extreme',
            recipeId: 'chaos-sphinx-extreme',
            blurb: 'Every counting operator shares a single target. Choose well.',
          },
          {
            id: 'the-answer',
            title: 'The Answer',
            difficulty: 'impossible',
            recipeId: 'chaos-sphinx-impossible',
            blurb: 'Nine cards, four binds, and a number only a counting route reaches.',
          },
        ],
      },
      {
        id: 'last-light',
        name: 'The Last Light',
        sigil: '✹',
        accent: '#ff4fd8',
        theme: 'Every operator. Nine cards. No mercy.',
        intro:
          'Past the sphinx there is one lamp left. Every operator is live, every lock is closed, and the toll is four figures. It is still solvable, and barely.',
        trials: [
          {
            id: 'dying-spark',
            title: 'Dying Spark',
            difficulty: 'extreme',
            recipeId: 'chaos-last-extreme',
            blurb: 'Eight cards and a five-hundred-point toll on both traps.',
          },
          {
            id: 'under-nine-suns',
            title: 'Under Nine Suns',
            difficulty: 'extreme',
            recipeId: 'chaos-last-extreme',
            blurb: 'Every family is live, and the ledger grows hotter.',
          },
          {
            id: 'black-lamp',
            title: 'The Black Lamp',
            difficulty: 'confounding',
            recipeId: 'chaos-last-confounding',
            blurb: 'Nine cards, four binds, and seven hundred a shortcut.',
          },
          {
            id: 'nothing-left',
            title: 'Nothing Left',
            difficulty: 'confounding',
            recipeId: 'chaos-last-confounding',
            blurb: 'The easy routes are gone. Only the expensive ones remain.',
          },
          {
            id: 'final-toll',
            title: 'Final Toll',
            difficulty: 'impossible',
            recipeId: 'chaos-last-impossible',
            blurb: 'Nine cards, every trap, and a four-figure bill for the obvious move.',
          },
          {
            id: 'last-light',
            title: 'Last Light',
            difficulty: 'impossible',
            recipeId: 'chaos-last-impossible',
            blurb: 'The final door in the final chapter. Solvable. Barely.',
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
