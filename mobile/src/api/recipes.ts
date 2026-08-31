import client from './client';
import { Recipe } from '../types';

export async function getRecipeSuggestions(state: string, store?: string | null): Promise<Recipe[]> {
  // The backend exposes POST /suggestions (no GET — a GET falls through to
  // /:recipeId and returns nothing). It returns a bare array, store-gated
  // server-side when `store` is provided. Parse defensively for both shapes.
  const response = await client.post('/api/recipes/suggestions', { state, store: store ?? undefined });
  const data = response.data as Recipe[] | { recipes?: Recipe[] };
  return Array.isArray(data) ? data : (data?.recipes ?? []);
}

export async function getRecipeById(id: string, store?: string | null, state?: string | null): Promise<Recipe> {
  // Pass store + state so the backend isolates deals to the selected store
  // (otherwise matchedDeals include other stores — e.g. IGA on a Woolworths page).
  const response = await client.get<Recipe>(`/api/recipes/${id}`, {
    params: { store: store ?? undefined, state: state ?? undefined },
  });
  return response.data;
}

// Favourites live in api/favorites.ts. They used to be here, pointing at
// /api/recipes/favorites and POST /api/recipes/:id/favorite — routes the
// backend has never defined.
