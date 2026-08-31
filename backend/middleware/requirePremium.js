const { clientForToken } = require('../services/authService');
const { PREMIUM_COLUMNS, isPremiumNow } = require('../services/premiumService');

/**
 * Middleware that checks the authenticated user holds a live premium
 * entitlement — is_premium AND not lapsed. See services/premiumService.js.
 * Must be used after requireAuth (which sets req.user and req.token).
 *
 * Three outcomes, and the distinction matters:
 *   403 — we read the row and the user genuinely is not premium.
 *   503 — we could not read the row at all. NOT a 403: telling a paying
 *         customer to "upgrade" because of a transient database error is the
 *         worst possible failure here, and the old code did exactly that by
 *         discarding the Supabase error and letting `profile` be undefined.
 *   next() — premium.
 *
 * The degraded path mirrors routes/premium.js GET /status: the subscription
 * columns come from a manual migration (scripts/migrations/addSubscriptionColumns.js)
 * and selecting them errors where it has not run. Both call sites now fall back
 * to the base `is_premium` column, so the client and the gate agree. Before
 * this, /status degraded OPEN while this middleware degraded CLOSED — the app
 * said "Premium" everywhere and every premium endpoint 403'd.
 */
async function requirePremium(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const deny = () => res.status(403).json({
    error: 'Premium required',
    message: 'Upgrade to Deals to Dish Premium to use this feature',
    upgradeUrl: '/premium',
  });

  const unavailable = () => res.status(503).json({
    error: 'Subscription check unavailable',
    message: 'We could not confirm your subscription just now. Please try again.',
  });

  try {
    const supabase = clientForToken(req.token);
    if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

    const { data: profile, error } = await supabase
      .from('users')
      .select(PREMIUM_COLUMNS)
      .eq('id', req.user.id)
      .single();

    if (!error && profile) {
      if (!isPremiumNow(profile)) return deny();
      req.isPremium = true;
      return next();
    }

    // Full read failed. Retry with the one column that predates the
    // subscription migration before concluding anything.
    console.error('[requirePremium] full read failed:', error?.message ?? 'no row');
    const { data: basic, error: basicError } = await supabase
      .from('users')
      .select('is_premium')
      .eq('id', req.user.id)
      .single();

    if (basicError || !basic) {
      console.error('[requirePremium] fallback read failed:', basicError?.message ?? 'no row');
      return unavailable();
    }

    // No expiry column available here, so this grants access while the
    // migration is outstanding rather than revoking it from a paying user.
    if (!basic.is_premium) return deny();
    req.isPremium = true;
    req.premiumDegraded = true;
    return next();
  } catch (err) {
    console.error('[requirePremium] error:', err.message);
    return unavailable();
  }
}

module.exports = requirePremium;
