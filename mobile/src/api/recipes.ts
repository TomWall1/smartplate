import client from './client';
import { Recipe } from '../types';

export async function getRecipeSuggestions(state: string): Promise<Recipe[]> {
  const response = await client.get<{ recipes: Recipe[] }>('/api/recipes/suggestions', {
    params: { state },
  });
  return response.data.recipes ?? [];
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
