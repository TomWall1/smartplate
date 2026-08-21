import client from './client';

export interface PremiumStatus {
  isPremium: boolean;
  premiumSince: string | null;
  expiresAt: string | null;
  source: 'admin' | 'app_store' | 'play' | null;
  /** Active but with a known end date — cancelled, running out the clock. */
  lapsing: boolean;
}

/**
 * Ask the server to reconcile this user's entitlement against RevenueCat.
 *
 * Called straight after a purchase or restore. Without it the client would race
 * the webhook — the purchase succeeds and the app unlocks locally, but
 * /api/premium/* keeps returning 403 until the webhook arrives.
 */
export async function refreshSubscription(): Promise<PremiumStatus> {
  const res = await client.post<PremiumStatus>('/api/subscriptions/refresh');
  return res.data;
}

export async function getPremiumStatus(): Promise<PremiumStatus> {
  const res = await client.get<PremiumStatus>('/api/premium/status');
  return res.data;
}
