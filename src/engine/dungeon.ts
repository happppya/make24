import {
  createDungeonPuzzle,
  type PuzzleDefinition,
  type PuzzleDifficulty,
} from './puzzles'

export interface DungeonTrial {
  id: string
  title: string
  difficulty: PuzzleDifficulty
  /** Recipe in `engine/puzzles.ts` that shapes this trial. */
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

/**
 * Seven themed gauntlets, six trials each. Every gauntlet ramps from its
 * opening difficulty to a gatekeeper, and the campaign as a whole climbs from
 * easy arithmetic in the cellar to an impossible door at the bottom.
 */
export const DUNGEON_GAUNTLETS: DungeonGauntlet[] = [
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
        blurb: 'Two locked groups, every counting operator, and a target that is not what it seems.',
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
]

export const DUNGEON_TRIAL_COUNT = DUNGEON_GAUNTLETS.reduce(
  (total, gauntlet) => total + gauntlet.trials.length,
  0
)

export function gauntletById(id: string): DungeonGauntlet | undefined {
  return DUNGEON_GAUNTLETS.find((gauntlet) => gauntlet.id === id)
}

export function gauntletIndex(id: string): number {
  return DUNGEON_GAUNTLETS.findIndex((gauntlet) => gauntlet.id === id)
}

/** The generated board for one trial, memoised by the puzzle engine. */
export function getDungeonPuzzle(gauntletId: string, trialId: string): PuzzleDefinition | null {
  const gauntlet = gauntletById(gauntletId)
  if (!gauntlet) return null
  const index = gauntlet.trials.findIndex((trial) => trial.id === trialId)
  const trial = gauntlet.trials[index]
  if (!trial) return null
  return createDungeonPuzzle({
    gauntletId: gauntlet.id,
    gauntletName: gauntlet.name,
    trialId: trial.id,
    trialNumber: index + 1,
    trialCount: gauntlet.trials.length,
    title: trial.title,
    difficulty: trial.difficulty,
    recipeId: trial.recipeId,
  })
}

/* --------------------------------- progress --------------------------------- */

export interface DungeonClear {
  score: number
  clearedAt: number
}

/** Cleared trials keyed by `gauntletId/trialId`. */
export type DungeonProgress = Record<string, DungeonClear>

export function dungeonTrialKey(gauntletId: string, trialId: string): string {
  return `${gauntletId}/${trialId}`
}

export function isTrialCleared(
  progress: DungeonProgress,
  gauntletId: string,
  trialId: string
): boolean {
  return Boolean(progress[dungeonTrialKey(gauntletId, trialId)])
}

export function trialBest(
  progress: DungeonProgress,
  gauntletId: string,
  trialId: string
): number | null {
  return progress[dungeonTrialKey(gauntletId, trialId)]?.score ?? null
}

export function gauntletClearedCount(
  progress: DungeonProgress,
  gauntlet: DungeonGauntlet
): number {
  return gauntlet.trials.filter((trial) => isTrialCleared(progress, gauntlet.id, trial.id)).length
}

export function gauntletIsCleared(progress: DungeonProgress, gauntlet: DungeonGauntlet): boolean {
  return gauntletClearedCount(progress, gauntlet) === gauntlet.trials.length
}

/** A trial opens when the one before it is cleared. */
export function isTrialUnlocked(
  progress: DungeonProgress,
  gauntlet: DungeonGauntlet,
  trialIndex: number
): boolean {
  if (trialIndex <= 0) return true
  const previous = gauntlet.trials[trialIndex - 1]
  return previous ? isTrialCleared(progress, gauntlet.id, previous.id) : false
}

/** A gauntlet opens when every trial in the one before it is cleared. */
export function isGauntletUnlocked(progress: DungeonProgress, gauntletId: string): boolean {
  const index = gauntletIndex(gauntletId)
  if (index <= 0) return index === 0
  const previous = DUNGEON_GAUNTLETS[index - 1]
  return previous ? gauntletIsCleared(progress, previous) : false
}

export function dungeonClearedCount(progress: DungeonProgress): number {
  let cleared = 0
  for (const gauntlet of DUNGEON_GAUNTLETS) {
    cleared += gauntletClearedCount(progress, gauntlet)
  }
  return cleared
}

export function nextTrialIn(gauntletId: string, trialId: string): DungeonTrial | null {
  const gauntlet = gauntletById(gauntletId)
  if (!gauntlet) return null
  const index = gauntlet.trials.findIndex((trial) => trial.id === trialId)
  if (index < 0) return null
  return gauntlet.trials[index + 1] ?? null
}

export function nextGauntletAfter(gauntletId: string): DungeonGauntlet | null {
  const index = gauntletIndex(gauntletId)
  if (index < 0) return null
  return DUNGEON_GAUNTLETS[index + 1] ?? null
}
