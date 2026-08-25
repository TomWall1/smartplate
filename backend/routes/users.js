const express     = require('express');
const requireAuth = require('../middleware/requireAuth');
const { clientForToken, supabase, adminSupabase } = require('../services/authService');

const router = express.Router();

// ── GET /api/users/oauth-config ───────────────────────────────────────────────
// Returns public config needed for mobile OAuth flows (no secrets)
router.get('/oauth-config', (_req, res) => {
  res.json({ supabaseUrl: process.env.SUPABASE_URL ?? null });
});

// ── POST /api/users/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://www.dealtodish.com/auth?reset=true',
  });

  // Always return 200 — don't leak whether email exists
  if (error) console.error('[forgot-password]', error.message);
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// ── GET /api/users/profile ────────────────────────────────────────────────────
// Returns the current user's profile. Creates the row on first access.
router.get('/profile', requireAuth, async (req, res) => {
  const supabase = clientForToken(req.token);
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  // Try a plain select first (most common path)
  const { data: existing, error: selError } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (!selError && existing) return res.json(existing);

  // Row doesn't exist yet — use UPSERT to avoid duplicate key errors
  const { data, error } = await supabase
    .from('users')
    .upsert({ id: req.user.id, email: req.user.email }, { onConflict: 'id' })
    .select()
    .single();

  if (!error) return res.json(data);

  // The user-scoped insert can fail on RLS (see migrations/002) — most visibly
  // on a first-ever OAuth sign-in, where there is no row yet and nothing to
  // select. Fall back to the service-role client: req.user.id comes from a JWT
  // this server already verified, so we are only creating that user's own row.
  console.error('[users/profile] upsert error:', error.message);

  if (adminSupabase) {
    const { data: adminData, error: adminError } = await adminSupabase
      .from('users')
      .upsert({ id: req.user.id, email: req.user.email }, { onConflict: 'id' })
      .select()
      .single();

    if (!adminError) return res.json(adminData);
    console.error('[users/profile] service-role upsert error:', adminError.message);
    return res.status(500).json({ error: `Failed to create profile: ${adminError.message}` });
  }

  res.status(500).json({ error: `Failed to create profile: ${error.message}` });
});

// ── POST /api/users/state ─────────────────────────────────────────────────────
// Saves the user's Australian state (nsw, vic, qld, etc.)
router.post('/state', requireAuth, async (req, res) => {
  const supabase = clientForToken(req.token);
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const VALID_STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
  const state = (req.body.state || '').toLowerCase();

  if (!VALID_STATES.includes(state)) {
    return res.status(400).json({ error: `Invalid state. Must be one of: ${VALID_STATES.join(', ')}` });
  }

  const { data, error } = await supabase
    .from('users')
    .upsert({ id: req.user.id, email: req.user.email, state }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('[users/state] upsert error:', error.message);
    return res.status(500).json({ error: 'Failed to save state' });
  }

  res.json({ state: data.state });
});

// ── PUT /api/users/preferences ────────────────────────────────────────────────
// Saves selected_store, dietary_restrictions, household_size, excluded_ingredients.
router.put('/preferences', requireAuth, async (req, res) => {
  const supabase = clientForToken(req.token);
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const {
    selected_store,
    dietary_restrictions,
    household_size,
    excluded_ingredients,
  } = req.body;

  const updates = { id: req.user.id, email: req.user.email };
  if (selected_store       !== undefined) updates.selected_store       = selected_store;
  if (dietary_restrictions !== undefined) updates.dietary_restrictions = dietary_restrictions;
  if (household_size       !== undefined) updates.household_size       = household_size;
  if (excluded_ingredients !== undefined) updates.excluded_ingredients = excluded_ingredients;

  const { data, error } = await supabase
    .from('users')
    .upsert(updates, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('[users/preferences] upsert error:', error.message);
    return res.status(500).json({ error: 'Failed to save preferences' });
  }

  res.json(data);
});

// ── DELETE /api/users/me ──────────────────────────────────────────────────────
// Permanent account deletion. Required by App Store Guideline 5.1.1(v): an app
// that creates accounts must let the user delete theirs from inside the app.
//
// The id always comes from the verified JWT — never from the request — so this
// cannot be pointed at another account.
//
// The user-owned tables carry bare `user_id UUID` columns with no
// REFERENCES users(id), so nothing cascades and each one is cleared explicitly.
// Rows first, auth user last: if this fails midway the account still exists and
// the user can retry, which is recoverable. The reverse leaves orphaned rows
// with no owner and no way to reach them.
const USER_OWNED_TABLES = [
  'favorite_recipes',
  'meal_plans',
  'shopping_lists',
  'price_alerts',
  'user_pantries',
];

router.delete('/me', requireAuth, async (req, res) => {
  const { adminSupabase } = require('../services/authService');
  if (!adminSupabase) {
    return res.status(503).json({ error: 'Account deletion is not configured' });
  }

  const userId = req.user.id;

  try {
    for (const table of USER_OWNED_TABLES) {
      const { error } = await adminSupabase.from(table).delete().eq('user_id', userId);
      // A table that does not exist yet in this environment is not a reason to
      // strand the user with an undeletable account.
      if (error && error.code !== '42P01') {
        throw new Error(`${table}: ${error.message}`);
      }
    }

    // Matcher training data: keep the signal, drop the person. Anonymised
    // rather than deleted because it is aggregate feedback, not personal
    // content, and the column is nullable by design.
    const { error: fbError } = await adminSupabase
      .from('match_feedback')
      .update({ user_id: null })
      .eq('user_id', userId);
    if (fbError && fbError.code !== '42P01') {
      console.error('[users/me] match_feedback anonymise failed:', fbError.message);
    }

    // Subscription history is kept — it is a financial record, and the store
    // may still send events for this id. Detach it from the person instead.
    await adminSupabase
      .from('subscription_events')
      .update({ user_id: null })
      .eq('user_id', userId);

    const { error: profileError } = await adminSupabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (profileError) throw new Error(`users: ${profileError.message}`);

    const { error: authError } = await adminSupabase.auth.admin.deleteUser(userId);
    // Already gone (a retried delete) is success, not failure.
    if (authError && !/not.?found/i.test(authError.message)) {
      throw new Error(`auth: ${authError.message}`);
    }

    console.log(`[users/me] deleted account ${userId}`);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[users/me] deletion failed:', err.message);
    res.status(500).json({ error: 'Could not delete your account. Please try again.' });
  }
});

module.exports = router;
