import client from './client';
import { PantryItem, PantryMatchResult } from '../types';

export async function getPantry(): Promise<PantryItem[]> {
  const response = await client.get<{ items: PantryItem[] }>('/api/pantry');
  return response.data.items ?? [];
}

export async function savePantry(items: string[]): Promise<void> {
  await client.post('/api/pantry', { items });
}

export async function clearPantry(): Promise<void> {
  await client.delete('/api/pantry');
}

export async function matchPantry(
  items: string[],
  includeStaples: boolean
): Promise<PantryMatchResult[]> {
  const response = await client.post<{ results: PantryMatchResult[] }>('/api/pantry/match', {
    items,
    includeStaples,
  });
  return response.data.results ?? [];
}
