/**
 * Pantry routes — "What I Have at Home" premium feature.
 *
 * All routes require authentication. CRUD routes also require premium.
 * The /match endpoint requires premium.
 */

const express        = require('express');
const requireAuth    = require('../middleware/requireAuth');
const requirePremium = require('../middleware/requirePremium');
const { clientForToken } = require('../services/authService');
const { matchPantry }    = require('../services/pantryMatcher');

const router = express.Router();

// All pantry routes require auth
router.use(requireAuth);

// ── GET /api/pantry ───────────────────────────────────────────────────────────
// Returns the current user's saved pantry, or null.
router.get('/', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { data, error } = await supabase
    .from('user_pantries')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    return res.status(500).json({ error: error.message });
  }

  res.json({ pantry: data ?? null });
});

// ── POST /api/pantry ──────────────────────────────────────────────────────────
// Save (upsert) the user's pantry.
router.post('/', requirePremium, async (req, res) => {
  const { ingredients, has_pantry_staples } = req.body;

  if (!Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'ingredients must be an array' });
  }

  const supabase = clientForToken(req.token);
  const { data, error } = await supabase
    .from('user_pantries')
    .upsert(
      {
        user_id:           req.user.id,
        ingredients:       ingredients.map(s => String(s).trim()).filter(Boolean),
        has_pantry_staples: has_pantry_staples !== false,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ pantry: data });
});

// ── DELETE /api/pantry ────────────────────────────────────────────────────────
// Clear the user's saved pantry.
router.delete('/', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { error } = await supabase
    .from('user_pantries')
    .delete()
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── POST /api/pantry/match ────────────────────────────────────────────────────
// Find recipes matching the provided pantry ingredients.
router.post('/match', requirePremium, async (req, res) => {
  const { ingredients, has_pantry_staples } = req.body;

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients must be a non-empty array' });
  }

  try {
    const results = await matchPantry(
      ingredients.map(s => String(s).trim()).filter(Boolean),
      has_pantry_staples !== false
    );
    res.json({ recipes: results, total: results.length });
  } catch (err) {
    console.error('[pantry/match] error:', err.message);
    res.status(500).json({ error: 'Matching failed', detail: err.message });
  }
});

module.exports = router;
