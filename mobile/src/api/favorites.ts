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

/** The snapshot worth keeping — enough to render a card without a fetch. */
export function snapshotOf(recipe: Recipe): Partial<Recipe> {
  return {
    id:              recipe.id,
    title:           recipe.title,
    image:           recipe.image,
    prepTime:        recipe.prepTime,
    cookTime:        recipe.cookTime,
    servings:        recipe.servings,
    tags:            recipe.tags,
    estimatedSaving: recipe.estimatedSaving,
    totalEstimatedCost: recipe.totalEstimatedCost,
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
  return (response.data.favorites ?? []).map((row) => ({
    ...(row.recipe_data ?? {}),
    id:    String(row.recipe_id),
    title: row.recipe_data?.title ?? 'Saved recipe',
  })) as Recipe[];
}

export async function addFavorite(recipeId: string, recipe?: Recipe): Promise<void> {
  await client.post(`/api/favorites/${encodeURIComponent(recipeId)}`, {
    recipe_data: recipe ? snapshotOf(recipe) : null,
  });
}

export async function removeFavorite(recipeId: string): Promise<void> {
  await client.delete(`/api/favorites/${encodeURIComponent(recipeId)}`);
}
