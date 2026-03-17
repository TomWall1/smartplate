const express     = require('express');
const requireAuth = require('../middleware/requireAuth');
const { clientForToken, supabase } = require('../services/authService');

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

  if (error) {
    console.error('[users/profile] upsert error:', error.message);
    return res.status(500).json({ error: 'Failed to create profile' });
  }

  res.json(data);
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

module.exports = router;
