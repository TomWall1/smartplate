/**
 * React Query hooks over the API layer. Screens use these instead of
 * hand-rolling useEffect/useState/loading/error — they get caching, retries,
 * stale-while-revalidate and pull-to-refresh (refetch) for free, and tab
 * switches no longer refetch from scratch.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDealsByStore } from './deals';
import { getRecipeSuggestions, getRecipeById, getFavorites, toggleFavorite } from './recipes';
import { getPantry, matchPantry } from './pantry';
import { Recipe } from '../types';

export const keys = {
  deals: (store: string) => ['deals', store] as const,
  recipes: (state: string, store: string) => ['recipes', state, store] as const,
  recipe: (id: string, store: string, state: string) => ['recipe', id, store, state] as const,
  favorites: () => ['favorites'] as const,
  pantry: () => ['pantry'] as const,
};

export function useDeals(store: string | null | undefined) {
  return useQuery({
    queryKey: keys.deals(store ?? ''),
    queryFn: () => getDealsByStore(store as string),
    enabled: !!store,
  });
}

export function useRecipes(state: string | null | undefined, store?: string | null) {
  return useQuery({
    queryKey: keys.recipes(state ?? '', store ?? 'all'),
    queryFn: () => getRecipeSuggestions(state as string, store),
    enabled: !!state,
  });
}

export function useRecipe(id: string, store?: string | null, state?: string | null) {
  return useQuery({
    queryKey: keys.recipe(id, store ?? '', state ?? ''),
    queryFn: () => getRecipeById(id, store, state),
    enabled: !!id,
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: keys.favorites(),
    queryFn: getFavorites,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleFavorite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.favorites() }),
  });
}

export function usePantry() {
  return useQuery({ queryKey: keys.pantry(), queryFn: getPantry });
}

export function useMatchPantry() {
  return useMutation({
    mutationFn: ({ items, includeStaples }: { items: string[]; includeStaples: boolean }) =>
      matchPantry(items, includeStaples),
  });
}

export type { Recipe };
