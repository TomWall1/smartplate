/**
 * Premium feature APIs — price alerts and shopping lists.
 *
 * Both are gated by requirePremium on the server (backend/routes/premium.js),
 * so a free account gets a 403 here and the screens show the paywall rather
 * than an error. The endpoints already existed and were only ever used by the
 * web app; this is the mobile half.
 */
import client from './client';
import { PriceAlert, ShoppingList, ShoppingListItem } from '../types';

// ── Price alerts ─────────────────────────────────────────────────────────────

/**
 * Alerts come back enriched with a live `status` computed against this week's
 * deals — there are no push notifications yet, so this in-app status is how a
 * met alert is actually seen.
 */
export async function getPriceAlerts(): Promise<PriceAlert[]> {
  const response = await client.get<{ alerts: PriceAlert[] }>('/api/premium/price-alerts');
  return response.data.alerts ?? [];
}

export async function createPriceAlert(
  productName: string,
  targetPrice: number,
  store?: string | null
): Promise<PriceAlert> {
  const response = await client.post<{ alert: PriceAlert }>('/api/premium/price-alerts', {
    product_name: productName,
    target_price: targetPrice,
    store: store ?? null,
  });
  return response.data.alert;
}

export async function deletePriceAlert(id: string): Promise<void> {
  await client.delete(`/api/premium/price-alerts/${encodeURIComponent(id)}`);
}

// ── Shopping lists ───────────────────────────────────────────────────────────

export async function getShoppingLists(): Promise<ShoppingList[]> {
  const response = await client.get<{ lists: ShoppingList[] }>('/api/premium/shopping-lists');
  return (response.data.lists ?? []).map((l) => ({ ...l, items: l.items ?? [] }));
}

export async function createShoppingList(
  name: string,
  items: ShoppingListItem[] = []
): Promise<ShoppingList> {
  const response = await client.post<{ list: ShoppingList }>('/api/premium/shopping-lists', {
    name,
    items,
  });
  return { ...response.data.list, items: response.data.list.items ?? [] };
}

export async function updateShoppingList(
  id: string,
  updates: { name?: string; items?: ShoppingListItem[] }
): Promise<ShoppingList> {
  const response = await client.put<{ list: ShoppingList }>(
    `/api/premium/shopping-lists/${encodeURIComponent(id)}`,
    updates
  );
  return { ...response.data.list, items: response.data.list.items ?? [] };
}

export async function deleteShoppingList(id: string): Promise<void> {
  await client.delete(`/api/premium/shopping-lists/${encodeURIComponent(id)}`);
}

/**
 * The app keeps ONE list rather than making people manage several — the job is
 * "what do I buy this week", not list administration. This finds it or makes it.
 */
export const DEFAULT_LIST_NAME = 'My shopping list';

export async function getOrCreateDefaultList(): Promise<ShoppingList> {
  const lists = await getShoppingLists();
  return lists[0] ?? (await createShoppingList(DEFAULT_LIST_NAME));
}

/**
 * Add a recipe's ingredients, skipping anything already on the list.
 * De-duplication is by lower-cased name so "2 Brown Onions" added twice from
 * two recipes does not appear twice.
 */
export async function addItemsToList(
  list: ShoppingList,
  names: string[],
  recipe?: { id: string; title: string }
): Promise<{ list: ShoppingList; added: number }> {
  const existing = new Set(list.items.map((i) => i.name.trim().toLowerCase()));
  const additions: ShoppingListItem[] = [];

  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    additions.push({
      name,
      checked: false,
      recipeId: recipe?.id,
      recipeTitle: recipe?.title,
      addedAt: new Date().toISOString(),
    });
  }

  if (additions.length === 0) return { list, added: 0 };

  const updated = await updateShoppingList(list.id, {
    items: [...list.items, ...additions],
  });
  return { list: updated, added: additions.length };
}
