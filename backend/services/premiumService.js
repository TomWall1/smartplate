/**
 * Single definition of "is this user premium right now".
 *
 * `is_premium` alone is not enough once subscriptions exist: it is set at
 * purchase and would stay true forever after a cancellation. Entitlement is
 * `is_premium AND not expired`, where a NULL expiry means "never expires" —
 * that is what manual admin grants and the App Review demo account use.
 *
 * Three call sites read premium status (middleware/requirePremium.js,
 * routes/recipes.js, routes/premium.js) and they must agree, so they all go
 * through here rather than testing the column directly.
 */

/** Columns any caller must select for isPremiumNow() to be meaningful. */
const PREMIUM_COLUMNS = 'is_premium, premium_expires_at, premium_source, premium_product_id';

/**
 * @param {{is_premium?: boolean, premium_expires_at?: string|null}|null} profile
 * @param {Date} [now]
 */
function isPremiumNow(profile, now = new Date()) {
  if (!profile?.is_premium) return false;
  if (!profile.premium_expires_at) return true; // manual/comped grant — no expiry
  return new Date(profile.premium_expires_at).getTime() > now.getTime();
}

/**
 * Shape returned to clients by GET /api/premium/status. Deliberately does not
 * leak the raw column — callers should trust `isPremium`, not re-derive it.
 */
function premiumStatus(profile, now = new Date()) {
  const active = isPremiumNow(profile, now);
  return {
    isPremium:    active,
    premiumSince: profile?.premium_since ?? null,
    expiresAt:    profile?.premium_expires_at ?? null,
    source:       profile?.premium_source ?? null,
    // True when access is running out the clock after a cancellation, so the
    // client can say "premium until 3 May" instead of implying it will renew.
    lapsing:      active && !!profile?.premium_expires_at,
  };
}

module.exports = { PREMIUM_COLUMNS, isPremiumNow, premiumStatus };
