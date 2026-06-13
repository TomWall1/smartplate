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

export async function getRecipeById(id: string): Promise<Recipe> {
  const response = await client.get<Recipe>(`/api/recipes/${id}`);
  return response.data;
}

export async function toggleFavorite(id: string): Promise<void> {
  await client.post(`/api/recipes/${id}/favorite`);
}

export async function getFavorites(): Promise<Recipe[]> {
  const response = await client.get<{ recipes: Recipe[] }>('/api/recipes/favorites');
  return response.data.recipes ?? [];
}
