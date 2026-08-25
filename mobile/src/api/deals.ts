import client from './client';
import { Deal } from '../types';

/**
 * This week's deals for one store.
 *
 * State matters as much as store: each state has its own catalogue, and
 * `/api/deals/store/:name` serves the main (NSW) cache regardless of who is
 * asking. Using it for a Victorian showed NSW deals at NSW prices, and left
 * the recipes — which ARE state-aware — pointing at specials that were not in
 * the list. Ask for the state's own artifact whenever we know the state, and
 * filter to the store here.
 */
export async function getDealsByStore(storeName: string, state?: string | null): Promise<Deal[]> {
  const response = await client.get<Deal[] | { deals?: Deal[] }>(
    `/api/deals/store/${storeName}`,
    state ? { params: { state } } : undefined,
  );
  const data = Array.isArray(response.data) ? response.data : (response.data?.deals ?? []);
  // The endpoint already filters by store; re-filter so a backend that has not
  // been redeployed with the ?state= support cannot leak other stores in.
  return data.filter((d) => (d.store ?? '').toLowerCase() === storeName.toLowerCase());
}

export interface DealsStatus {
  loading: boolean;
  lastUpdated: string | null;
  counts?: Record<string, number>;
}

/** Cache metadata for the deals feed — used to show when deals last changed. */
export async function getDealsStatus(): Promise<DealsStatus> {
  const response = await client.get<DealsStatus>('/api/deals/status');
  return response.data;
}
