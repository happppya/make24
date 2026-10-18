import { inject, type InjectionKey } from 'vue'
import type { GameContext } from './useGame'

/** The single game instance `App.vue` builds and provides to every screen. */
export const GAME_KEY: InjectionKey<GameContext> = Symbol('make24-game')

export function useGameContext(): GameContext {
  const game = inject(GAME_KEY)
  if (!game) {
    throw new Error('useGameContext() must be used inside a screen mounted by App.vue')
  }
  return game
}
