import { RECIPES } from './calendarRecipes'
import { CHAOS_RECIPES } from './chaosRecipes'
import { PUZZLE_DIFFICULTIES, type PuzzleDifficulty } from './puzzleDifficulty'
import type { PuzzleRecipe } from './recipeKit'

const RECIPE_BY_ID = new Map([...RECIPES, ...CHAOS_RECIPES].map((recipe) => [recipe.id, recipe]))

/** Recipes grouped by the difficulty their calendar slot draws from. */
const RECIPES_BY_DIFFICULTY = new Map<PuzzleDifficulty, PuzzleRecipe[]>(
  PUZZLE_DIFFICULTIES.map((difficulty) => [
    difficulty.id,
    RECIPES.filter((recipe) => recipe.difficulty === difficulty.id),
  ]),
)

export function puzzleRecipe(id: string): PuzzleRecipe | undefined {
  return RECIPE_BY_ID.get(id)
}

/** The calendar pool for one slot. Chaos recipes never appear here. */
export function recipesForDifficulty(difficulty: PuzzleDifficulty): PuzzleRecipe[] {
  return RECIPES_BY_DIFFICULTY.get(difficulty) ?? RECIPES
}
