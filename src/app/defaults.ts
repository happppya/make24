import { createDefaultBindRules } from '../engine/binds'
import { DEFAULT_FORBIDDEN_MOVES, DEFAULT_FORBIDDEN_MOVE_PENALTY } from '../engine/math'
import type { GameSettings } from '../engine/types'

/** A fresh table: solo, four cards, target 24, basic + powers + factorials on. */
export function createDefaultSettings(): GameSettings {
  return {
    isMultiplayer: false,
    mode: 'first-to-solve',
    numCards: 4,
    targetPreset: 'just-24',
    targetConstant: 'random',
    customMin: 10,
    customMax: 250,
    manualTarget: 24,
    approximationPercent: 0,
    scoringMode: 'cost-first',
    cardPool: '1-deck',
    allowedOperators: {
      basic: true,
      powers: true,
      factorial: true,
      trig: false,
      inverse: false,
      computing: false,
      concat: false,
      analysis: false,
      combinatorics: false,
      operators: {},
    },
    forbiddenMoves: { ...DEFAULT_FORBIDDEN_MOVES },
    forbiddenMovePenalty: DEFAULT_FORBIDDEN_MOVE_PENALTY,
    binds: createDefaultBindRules(),
    firstToPoints: 3,
  }
}

/** Deep copy for the wire and for mirroring the host's rules. */
export function cloneSettings(settings: GameSettings): GameSettings {
  return JSON.parse(JSON.stringify(settings)) as GameSettings
}
