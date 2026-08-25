/**
 * Product analytics — the only file that knows which vendor we use.
 *
 * Screens call `track('recipes_viewed')`. They never import the SDK, so
 * swapping PostHog for something else (or for our own /api endpoint) is a
 * change to this file alone.
 *
 * Nothing here can break the app:
 *   - No API key configured → every call is a silent no-op, so the app runs
 *     normally before the PostHog account exists.
 *   - The SDK is lazy-required and every call is wrapped, so a bad key, a
 *     missing module or an offline device costs nothing.
 *   - Calls are fire-and-forget. Never await one in a render path.
 *
 * SETUP: put the project API key in app.json → expo.extra.posthogApiKey.
 * It is a publishable key and is meant to ship inside the app.
 *
 * PRIVACY: never pass an email, name or anything else that identifies a
 * person. `identifyUser` takes the account id and nothing else — that is what
 * links a guest to their account without handing personal data to a vendor.
 */
import Constants from 'expo-constants';

export type EventProps = Record<string, string | number | boolean | null | undefined>;

const extra = (Constants.expoConfig?.extra ?? {}) as {
  posthogApiKey?: string;
  posthogHost?: string;
};

const PLACEHOLDER = /^TODO_/;
const API_KEY = extra.posthogApiKey && !PLACEHOLDER.test(extra.posthogApiKey) ? extra.posthogApiKey : undefined;
const HOST = extra.posthogHost || 'https://us.i.posthog.com';

export const isAnalyticsConfigured = !!API_KEY;

let client: any = null;
let triedInit = false;

function getClient(): any {
  if (triedInit) return client;
  triedInit = true;
  if (!API_KEY) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('posthog-react-native');
    const PostHog = mod.default ?? mod.PostHog ?? mod;
    client = new PostHog(API_KEY, { host: HOST });
  } catch {
    client = null; // SDK missing or failed to start — stay silent
  }
  return client;
}

// Properties attached to every event. Set once from RootNavigator, which is
// the one place that already knows all of them, and refreshed whenever they
// change. Merged in at capture time rather than registered with the SDK, so a
// stale value (is_guest after signing up, say) can never persist.
let context: EventProps = {};

export function setAnalyticsContext(next: EventProps): void {
  context = { ...context, ...next };
}

export function track(event: string, props: EventProps = {}): void {
  const c = getClient();
  if (!c) return;
  try {
    c.capture(event, { ...context, ...props });
  } catch {
    // Analytics must never surface an error to the user.
  }
}

/** Link everything since app open to this account. Pass the id only. */
export function identifyUser(userId: string): void {
  const c = getClient();
  if (!c) return;
  try {
    c.identify(userId);
  } catch {
    // ignore
  }
}

/** Signing out ends the identity — the next session is a fresh anonymous one. */
export function resetAnalytics(): void {
  const c = getClient();
  if (!c) return;
  try {
    c.reset();
  } catch {
    // ignore
  }
}

/**
 * Time-to-value, the number the first-run flow exists to move: how long from
 * opening the app to seeing recipes. Measured in-app rather than derived from
 * event timestamps so it survives batching and clock skew.
 */
let openedAt: number | null = null;

export function markAppOpened(): void {
  openedAt = Date.now();
}

export function secondsSinceOpen(): number | undefined {
  if (openedAt == null) return undefined;
  return Math.round((Date.now() - openedAt) / 100) / 10;
}
