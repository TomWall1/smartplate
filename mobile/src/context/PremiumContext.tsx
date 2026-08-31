import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
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
  const loadStatus = useCallback(async () => {
    if (!userId) { setStatus(null); return; }
    try {
      const s = await getPremiumStatus();
      setStatus(s);
      // The local flag may only widen access, but it must not outlive the
      // server saying no — otherwise a refund or lapse leaves the UI unlocked
      // (and every premium endpoint 403-ing) until the app is killed.
      if (!s.isPremium) setLocalEntitlement(false);
    } catch {
      // Keep whatever we had rather than downgrading on a network blip.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) { setStatus(null); return; }
    setStatus(null);
    loadStatus();
  }, [userId, loadStatus]);

  // Entitlement changes while the app is backgrounded — a renewal, a lapse, a
  // cancellation taking effect, a subscription bought on another device. A
  // status read on foreground is the cheapest way to notice.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') loadStatus();
    });
    return () => sub.remove();
  }, [loadStatus]);

  // A subscription that runs out mid-session needs no server round trip to
  // detect — we already know the second it expires. Re-read then, so access
  // closes on time instead of at the next launch.
  useEffect(() => {
    const expiresAt = status?.expiresAt ? Date.parse(status.expiresAt) : NaN;
    if (!status?.isPremium || Number.isNaN(expiresAt)) return;
    const ms = expiresAt - Date.now();
    // setTimeout clamps above ~24.8 days; the foreground check covers longer.
    if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return;
    const timer = setTimeout(loadStatus, ms + 1000);
    return () => clearTimeout(timer);
  }, [status?.isPremium, status?.expiresAt, loadStatus]);

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

  // Cached data is tier-dependent: the recipe list is 50 rows for a free
  // account and 150 for a subscriber, and the premium screens cache 403s.
  // Without this, a purchase changed nothing visible until the app restarted,
  // because every query was still inside its 10-minute staleTime.
  const previousTier = useRef<boolean | null>(null);
  useEffect(() => {
    if (previousTier.current !== null && previousTier.current !== isPremium) {
      queryClient.invalidateQueries();
    }
    previousTier.current = isPremium;
  }, [isPremium, queryClient]);

  return (
    <PremiumContext.Provider value={{ isPremium, status, refreshPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}
