/**
 * The seven-step puzzle ladder. Kept free of generator imports so recipes and
 * the engine can both rank a board without a cycle.
 */
export type PuzzleDifficulty =
  | 'easy'
  | 'medium'
  | 'hard'
  | 'expert'
  | 'extreme'
  | 'confounding'
  | 'impossible'

export interface PuzzleDifficultyMeta {
  id: PuzzleDifficulty
  label: string
  /** Higher is harder; the dungeon ramp and tests use this. */
  rank: number
  accent: string
  blurb: string
}

/** The seven-step ladder every puzzle is ranked on, easiest first. */
export const PUZZLE_DIFFICULTIES: PuzzleDifficultyMeta[] = [
  {
    id: 'easy',
    label: 'EASY',
    rank: 0,
    accent: '#6fd68a',
    blurb: 'A loose hand and room to breathe.',
  },
  {
    id: 'medium',
    label: 'MEDIUM',
    rank: 1,
    accent: '#72efdd',
    blurb: 'Powers and factorials join the table.',
  },
  {
    id: 'hard',
    label: 'HARD',
    rank: 2,
    accent: '#ffbe0b',
    blurb: 'More cards, narrower routes, real detours.',
  },
  {
    id: 'expert',
    label: 'EXPERT',
    rank: 3,
    accent: '#ff9daa',
    blurb: 'Most of the cabinet, and it expects fluency.',
  },
  {
    id: 'extreme',
    label: 'EXTREME',
    rank: 4,
    accent: '#fe4a49',
    blurb: 'Seven cards or more, targets in the millions.',
  },
  {
    id: 'confounding',
    label: 'CONFOUNDING',
    rank: 5,
    accent: '#c77dff',
    blurb: 'Every shortcut is priced and the hand is hostile.',
  },
  {
    id: 'impossible',
    label: 'IMPOSSIBLE',
    rank: 6,
    accent: '#ff4fd8',
    blurb: 'Solvable. Barely. Bring a plan and a pencil.',
  },
]

const DIFFICULTY_BY_ID = new Map(PUZZLE_DIFFICULTIES.map((entry) => [entry.id, entry]))

export function puzzleDifficultyMeta(id: PuzzleDifficulty): PuzzleDifficultyMeta {
  return DIFFICULTY_BY_ID.get(id) ?? PUZZLE_DIFFICULTIES[0]!
}

export function difficultyRank(id: PuzzleDifficulty): number {
  return puzzleDifficultyMeta(id).rank
}
