/**
 * RevenueCat wrapper.
 *
 * Gated the same way as nativeAuth.ts: the native module does not exist in Expo
 * Go, so everything is behind `isPurchasesAvailable` and the module is
 * lazy-`require`d inside the calls. Importing this file in Expo Go is safe —
 * the paywall renders an explanatory state instead of crashing.
 *
 * The server, not this file, is the source of truth for entitlement. The SDK
 * gives us an instant local answer so the UI can unlock without waiting on a
 * webhook, and `POST /api/subscriptions/refresh` reconciles the server right
 * after. See backend/routes/subscriptions.js.
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Expo Go reports `storeClient`; dev/standalone builds report `bare`/`standalone`.
export const isPurchasesAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

const extra = (Constants.expoConfig?.extra ?? {}) as {
  revenueCatIosKey?: string;
  revenueCatAndroidKey?: string;
  revenueCatEntitlementId?: string;
};

const PLACEHOLDER = /^TODO_/;
const configured = (v?: string) => (v && !PLACEHOLDER.test(v) ? v : undefined);

const API_KEY = Platform.select({
  ios:     configured(extra.revenueCatIosKey),
  android: configured(extra.revenueCatAndroidKey),
});

export const ENTITLEMENT_ID = extra.revenueCatEntitlementId || 'premium';

/** True once the platform's RevenueCat key is filled in. */
export const isPurchasesConfigured = !!API_KEY;

/** Both gates — the only check callers should need. */
export const canPurchase = isPurchasesAvailable && isPurchasesConfigured;

function getPurchases(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-purchases').default;
}

let configuredForUser: string | null = null;

/**
 * Point the SDK at a user. Called on login and whenever the user changes.
 *
 * The RevenueCat app user id IS the Supabase user id — that is what makes the
 * webhook able to map an event straight to a row without a lookup table.
 */
export async function identifyPurchaser(userId: string): Promise<void> {
  if (!canPurchase) return;
  const Purchases = getPurchases();

  if (configuredForUser === userId) return;

  if (configuredForUser === null) {
    Purchases.configure({ apiKey: API_KEY, appUserID: userId });
  } else {
    await Purchases.logIn(userId);
  }
  configuredForUser = userId;
}

/** Detach the SDK from the signed-out user so their entitlement is not reused. */
export async function forgetPurchaser(): Promise<void> {
  if (!canPurchase || configuredForUser === null) return;
  try {
    await getPurchases().logOut();
  } catch {
    // logOut throws if already anonymous — not worth surfacing.
  }
  configuredForUser = null;
}

export interface SubscriptionOffer {
  identifier: string;
  /** Localised, store-formatted price string — never build this yourself. */
  priceString: string;
  title: string;
  description: string;
  /** e.g. "P1M" */
  period: string | null;
  raw: any;
}

/**
 * The current offering's available packages. Prices come from the store, so
 * they are already in the viewer's currency and correctly formatted — required
 * by Guideline 3.1.2, and the reason no price is hardcoded in the app.
 */
export async function getOffers(): Promise<SubscriptionOffer[]> {
  if (!canPurchase) return [];
  const offerings = await getPurchases().getOfferings();
  const current = offerings?.current;
  if (!current) return [];

  return (current.availablePackages ?? []).map((pkg: any) => ({
    identifier:  pkg.identifier,
    priceString: pkg.product?.priceString ?? '',
    title:       pkg.product?.title ?? '',
    description: pkg.product?.description ?? '',
    period:      pkg.product?.subscriptionPeriod ?? null,
    raw:         pkg,
  }));
}

function hasEntitlement(customerInfo: any): boolean {
  return !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
}

/** @returns true if the user now holds the entitlement. */
export async function purchase(offer: SubscriptionOffer): Promise<boolean> {
  if (!canPurchase) throw new Error('Purchases are not available in this build.');
  const { customerInfo } = await getPurchases().purchasePackage(offer.raw);
  return hasEntitlement(customerInfo);
}

/** @returns true if a prior purchase was found and restored. */
export async function restore(): Promise<boolean> {
  if (!canPurchase) throw new Error('Purchases are not available in this build.');
  const customerInfo = await getPurchases().restorePurchases();
  return hasEntitlement(customerInfo);
}

/** Local entitlement check — instant, but not authoritative. */
export async function hasActiveEntitlement(): Promise<boolean> {
  if (!canPurchase) return false;
  try {
    return hasEntitlement(await getPurchases().getCustomerInfo());
  } catch {
    return false;
  }
}

/** True when the user cancelled the native purchase sheet — not an error. */
export function isUserCancelled(err: any): boolean {
  return !!(err?.userCancelled || err?.code === '1' || err?.code === 1);
}
