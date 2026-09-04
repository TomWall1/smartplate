/**
 * Favourites API — free for any signed-in account (backend/routes/favorites.js).
 *
 * The old calls lived in recipes.ts and pointed at /api/recipes/favorites and
 * POST /api/recipes/:id/favorite. Neither route has ever existed: the GET fell
 * through to GET /api/recipes/:recipeId with the id "favorites" and the POST
 * 404'd, so the whole feature was dead on the client side.
 *
 * A favourite row stores an optional snapshot of the recipe, which is what
 * lets a saved recipe still render after it drops out of this week's library.
 */
import client from './client';
import { Recipe } from '../types';

interface FavoriteRow {
  recipe_id: string;
  saved_at?: string;
  recipe_data?: Partial<Recipe> | null;
}

function toRecipe(row: FavoriteRow): Recipe {
  // Snapshots written before this change stored a saving and a cost. Drop
  // them here rather than migrating the table: they were computed against a
  // catalogue week that has since been replaced.
  const {
    estimatedSaving: _saving,
    totalEstimatedCost: _cost,
    totalMealSaving: _mealSaving,
    totalPerServingSaving: _perServe,
    matchedDeals: _deals,
    dealHighlights: _highlights,
    ...rest
  } = row.recipe_data ?? {};

  return {
    ...rest,
    id:      String(row.recipe_id),
    title:   row.recipe_data?.title ?? 'Saved recipe',
    // Rows saved before the snapshot carried a date still have the server's.
    savedAt: row.recipe_data?.savedAt ?? row.saved_at,
  } as Recipe;
}

/**
 * The snapshot worth keeping — enough to render the whole recipe, not just
 * its card. It used to hold the card fields only, so a favourite that fell
 * out of the current week's menu listed fine and then failed to open: the
 * detail screen refetches by id, and the server only searches THIS week.
 *
 * NOTHING priced is kept. Deals, savings and cost estimates are all true for
 * exactly one catalogue week at one store, so a saved copy shows none of
 * them — a saved recipe is a recipe you liked, not a price you were quoted.
 * When the recipe is back in the current week the detail screen fetches it
 * live and every figure returns.
 */
export function snapshotOf(recipe: Recipe): Partial<Recipe> {
  return {
    id:              recipe.id,
    title:           recipe.title,
    image:           recipe.image,
    prepTime:        recipe.prepTime,
    cookTime:        recipe.cookTime,
    servings:        recipe.servings,
    tags:            recipe.tags,
    // What the detail screen needs to stand on its own.
    allIngredients:  recipe.allIngredients ?? recipe.ingredients,
    source:          recipe.source,
    sourceUrl:       recipe.sourceUrl,
    savedAt:         new Date().toISOString(),
  };
}

/** Just the ids, for deciding whether a heart is filled. */
export async function getFavoriteIds(): Promise<string[]> {
  const response = await client.get<{ favorites: FavoriteRow[] }>('/api/favorites');
  return (response.data.favorites ?? []).map((f) => String(f.recipe_id));
}

/**
 * Favourites as renderable recipes. Rows saved before snapshots existed have
 * no recipe_data; they still get a card, titled from what we have.
 */
export async function getFavorites(): Promise<Recipe[]> {
  const response = await client.get<{ favorites: FavoriteRow[] }>('/api/favorites');
  return (response.data.favorites ?? []).map(toRecipe);
}

/**
 * One saved recipe by id, or null. This is the detail screen's fallback when
 * the live fetch 404s because the recipe is not in the current week's menu —
 * the point of saving something is that it is still there next month.
 */
export async function getFavoriteById(recipeId: string): Promise<Recipe | null> {
  const response = await client.get<{ favorites: FavoriteRow[] }>('/api/favorites');
  const row = (response.data.favorites ?? []).find(
    (f) => String(f.recipe_id) === String(recipeId)
  );
  return row ? toRecipe(row) : null;
}

export async function addFavorite(recipeId: string, recipe?: Recipe): Promise<void> {
  await client.post(`/api/favorites/${encodeURIComponent(recipeId)}`, {
    recipe_data: recipe ? snapshotOf(recipe) : null,
  });
}

export async function removeFavorite(recipeId: string): Promise<void> {
  await client.delete(`/api/favorites/${encodeURIComponent(recipeId)}`);
}
