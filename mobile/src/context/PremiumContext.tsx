import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getPremiumStatus, refreshSubscription, PremiumStatus } from '../api/subscriptions';
import { identifyPurchaser, forgetPurchaser, hasActiveEntitlement, canPurchase } from '../api/purchases';

interface PremiumContextValue {
  isPremium: boolean;
  status: PremiumStatus | null;
  /** Reconcile with the store, then re-read the server. Call after a purchase. */
  refreshPremium: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextValue>({
  isPremium: false,
  status: null,
  refreshPremium: async () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<PremiumStatus | null>(null);
  // Set the instant a purchase succeeds, before the server has caught up. Only
  // ever widens access — the server still gates the actual premium endpoints.
  const [localEntitlement, setLocalEntitlement] = useState(false);

  const userId = user?.id ?? null;

  // Point RevenueCat at the signed-in user. The RevenueCat app user id is the
  // Supabase user id, which is what lets the webhook map an event to a row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        await forgetPurchaser();
        if (!cancelled) setLocalEntitlement(false);
        return;
      }
      try {
        await identifyPurchaser(userId);
        if (canPurchase && !cancelled) {
          setLocalEntitlement(await hasActiveEntitlement());
        }
      } catch {
        // Store unreachable — server status still governs.
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Server status is authoritative: it applies the expiry that the raw
  // `is_premium` column does not, so a lapsed subscription reads as free here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) { setStatus(null); return; }
      try {
        const s = await getPremiumStatus();
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const refreshPremium = useCallback(async () => {
    if (!userId) return;
    try {
      const s = await refreshSubscription();
      setStatus(s);
      setLocalEntitlement(s.isPremium);
    } catch {
      // Reconciliation failed — fall back to the plain status read so a
      // successful purchase is not left looking like a failure.
      try { setStatus(await getPremiumStatus()); } catch { /* keep current */ }
    }
    await refreshUser();
  }, [userId, refreshUser]);

  const isPremium = (status?.isPremium ?? user?.is_premium ?? false) || localEntitlement;

  return (
    <PremiumContext.Provider value={{ isPremium, status, refreshPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}
