/**
 * Pantry API.
 *
 * Field names here are NOT free choices — they are the wire contract with
 * backend/routes/pantry.js. This file previously sent `items`/`includeStaples`
 * where the server requires `ingredients`/`has_pantry_staples`, so every match
 * returned 400 and the feature never worked in production. Keep the two in
 * step; the server validates on its names, not ours.
 */
import client from './client';
import { Pantry, PantryMatchResult } from '../types';

export async function getPantry(): Promise<Pantry | null> {
  const response = await client.get<{ pantry: Pantry | null }>('/api/pantry');
  return response.data.pantry ?? null;
}

export async function savePantry(
  ingredients: string[],
  hasPantryStaples: boolean
): Promise<Pantry> {
  const response = await client.post<{ pantry: Pantry }>('/api/pantry', {
    ingredients,
    has_pantry_staples: hasPantryStaples,
  });
  return response.data.pantry;
}

export async function clearPantry(): Promise<void> {
  await client.delete('/api/pantry');
}

/**
 * @param state Passed through so missing ingredients are priced against the
 *   right state's catalogue — the server defaults to NSW without it.
 * @param store The user's supermarket. Results are ranked by what they still
 *   have to spend, so a price at a store they are not visiting is no use.
 */
export async function matchPantry(
  ingredients: string[],
  hasPantryStaples: boolean,
  state?: string | null,
  store?: string | null
): Promise<PantryMatchResult[]> {
  const response = await client.post<{ recipes: PantryMatchResult[]; total: number }>(
    '/api/pantry/match',
    {
      ingredients,
      has_pantry_staples: hasPantryStaples,
      state: state ?? undefined,
      store: store ?? undefined,
    }
  );
  return response.data.recipes ?? [];
}
