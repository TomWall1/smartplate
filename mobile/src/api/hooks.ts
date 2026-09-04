/**
 * React Query hooks over the API layer. Screens use these instead of
 * hand-rolling useEffect/useState/loading/error — they get caching, retries,
 * stale-while-revalidate and pull-to-refresh (refetch) for free, and tab
 * switches no longer refetch from scratch.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDealsByStore, getDealsStatus } from './deals';
import { getRecipeSuggestions, getRecipeById } from './recipes';
import { getFavorites, getFavoriteIds, getFavoriteById, addFavorite, removeFavorite } from './favorites';
import { getPantry, savePantry, matchPantry } from './pantry';
import {
  getPriceAlerts, createPriceAlert, deletePriceAlert,
  getOrCreateDefaultList, updateShoppingList,
} from './premium';
import { Recipe, ShoppingListItem } from '../types';

export const keys = {
  deals: (store: string, state: string) => ['deals', store, state] as const,
  dealsStatus: () => ['deals-status'] as const,
  // `tier` is part of the key because the server returns a different number of
  // recipes to a subscriber (150) than to a free account (50). Without it, a
  // purchase left the cached free list in place until the app was restarted.
  recipes: (state: string, store: string, tier: string) => ['recipes', state, store, tier] as const,
  recipe: (id: string, store: string, state: string) => ['recipe', id, store, state] as const,
  favorites: () => ['favorites'] as const,
  favoriteIds: () => ['favorite-ids'] as const,
  pantry: () => ['pantry'] as const,
  priceAlerts: () => ['price-alerts'] as const,
  shoppingList: () => ['shopping-list'] as const,
};

export function useDeals(store: string | null | undefined, state?: string | null) {
  return useQuery({
    queryKey: keys.deals(store ?? '', state ?? 'any'),
    queryFn: () => getDealsByStore(store as string, state),
    enabled: !!store,
  });
}

export function useDealsStatus() {
  return useQuery({
    queryKey: keys.dealsStatus(),
    queryFn: getDealsStatus,
    staleTime: 60 * 60 * 1000, // deals refresh weekly; no need to re-ask often
  });
}

export function useRecipes(
  state: string | null | undefined,
  store?: string | null,
  isPremium = false,
) {
  return useQuery({
    queryKey: keys.recipes(state ?? '', store ?? 'all', isPremium ? 'premium' : 'free'),
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

// ── Favourites (free for any signed-in account) ──────────────────────────────

export function useFavorites(enabled = true) {
  return useQuery({
    queryKey: keys.favorites(),
    queryFn: getFavorites,
    enabled,
  });
}

/**
 * The saved copy of one recipe, used only when the live fetch fails. Enabled
 * by the caller so it never runs for a recipe that loaded normally.
 */
export function useFavoriteSnapshot(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...keys.favorites(), 'snapshot', id] as const,
    queryFn: () => getFavoriteById(id),
    enabled: enabled && !!id,
  });
}

/** Ids only — what the heart on a recipe reads to know if it is already saved. */
export function useFavoriteIds(enabled = true) {
  return useQuery({
    queryKey: keys.favoriteIds(),
    queryFn: getFavoriteIds,
    enabled,
  });
}

/**
 * Save or unsave, with the heart flipped optimistically and rolled back if the
 * request fails. The screen used to keep its own boolean that was never seeded
 * from the server and flipped on success regardless of what the server did.
 */
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, recipe, isFavorite }: { id: string; recipe?: Recipe; isFavorite: boolean }) => {
      if (isFavorite) await removeFavorite(id);
      else await addFavorite(id, recipe);
      return !isFavorite;
    },
    onMutate: async ({ id, isFavorite }) => {
      await qc.cancelQueries({ queryKey: keys.favoriteIds() });
      const previous = qc.getQueryData<string[]>(keys.favoriteIds());
      qc.setQueryData<string[]>(keys.favoriteIds(), (ids = []) =>
        isFavorite ? ids.filter((f) => f !== id) : [...ids, id]
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.favoriteIds(), context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.favoriteIds() });
      qc.invalidateQueries({ queryKey: keys.favorites() });
    },
  });
}

// ── Pantry ───────────────────────────────────────────────────────────────────

export function usePantry(enabled = true) {
  return useQuery({ queryKey: keys.pantry(), queryFn: getPantry, enabled });
}

/**
 * Save the pantry AND tell every other screen about it.
 *
 * The pantry used to be written with a bare savePantry() call, which meant
 * nothing invalidated the cached copy. usePantry holds its result for ten
 * minutes and does not refetch on focus, so a recipe opened straight after
 * editing the pantry read the OLD list and marked nothing — the item was
 * genuinely saved, and genuinely not visible.
 */
export function useSavePantry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ingredients, hasPantryStaples }:
      { ingredients: string[]; hasPantryStaples: boolean }) =>
      savePantry(ingredients, hasPantryStaples),
    // Seed the cache from the server's own response, then revalidate — the
    // pantry screen and the recipe screens read the same query.
    onSuccess: (pantry) => {
      qc.setQueryData(keys.pantry(), pantry);
      qc.invalidateQueries({ queryKey: keys.pantry() });
    },
  });
}

export function useMatchPantry() {
  return useMutation({
    mutationFn: ({ ingredients, hasPantryStaples, state, store }:
      { ingredients: string[]; hasPantryStaples: boolean; state?: string | null; store?: string | null }) =>
      matchPantry(ingredients, hasPantryStaples, state, store),
  });
}

// ── Price alerts ─────────────────────────────────────────────────────────────

export function usePriceAlerts(enabled = true) {
  return useQuery({
    queryKey: keys.priceAlerts(),
    queryFn: getPriceAlerts,
    enabled,
    // Status is computed against the weekly deals, which change once a week.
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreatePriceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productName, targetPrice, store }:
      { productName: string; targetPrice: number; store?: string | null }) =>
      createPriceAlert(productName, targetPrice, store),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.priceAlerts() }),
  });
}

export function useDeletePriceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePriceAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.priceAlerts() }),
  });
}

// ── Shopping list ────────────────────────────────────────────────────────────

export function useShoppingList(enabled = true) {
  return useQuery({
    queryKey: keys.shoppingList(),
    queryFn: getOrCreateDefaultList,
    enabled,
  });
}

/**
 * Writes the whole item array — the server stores it as one JSON column, so
 * there is no per-item endpoint to tick a box against.
 */
export function useUpdateShoppingItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: ShoppingListItem[] }) =>
      updateShoppingList(id, { items }),
    onSuccess: (list) => qc.setQueryData(keys.shoppingList(), list),
  });
}

export type { Recipe };
