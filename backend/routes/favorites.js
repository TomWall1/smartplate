/**
 * Favourites — saved recipes.
 *
 * Auth-only, NOT premium. Favourites used to sit behind requirePremium inside
 * routes/premium.js, which made the heart on a recipe unusable for the free
 * accounts it was meant to convert. Keeping a recipe is table stakes: it is
 * what makes an account worth creating, and it costs nothing to serve.
 *
 * Mounted twice by server.js — at /api/favorites (mobile) and at
 * /api/premium/favorites (the web app's existing path). Same router, so the
 * two can never drift.
 */

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { clientForToken } = require('../services/authService');

const router = express.Router();

router.use(requireAuth);

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const supabase = clientForToken(req.token);
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data, error } = await supabase
    .from('favorite_recipes')
    .select('*')
    .eq('user_id', req.user.id)
    .order('saved_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorites: data ?? [] });
});

// ── POST /:recipeId ───────────────────────────────────────────────────────────
// `recipe_data` is an optional snapshot ({ title, image, tags, prepTime, … }).
// Storing it means a saved recipe still renders after it drops out of the
// current week's library, which is the whole point of saving one.
router.post('/:recipeId', async (req, res) => {
  const supabase = clientForToken(req.token);
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { recipeId } = req.params;
  const { recipe_data } = req.body ?? {};

  const { data, error } = await supabase
    .from('favorite_recipes')
    .upsert(
      { user_id: req.user.id, recipe_id: recipeId, recipe_data: recipe_data ?? null },
      { onConflict: 'user_id,recipe_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorite: data });
});

// ── DELETE /:recipeId ─────────────────────────────────────────────────────────
router.delete('/:recipeId', async (req, res) => {
  const supabase = clientForToken(req.token);
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { recipeId } = req.params;

  const { error } = await supabase
    .from('favorite_recipes')
    .delete()
    .eq('user_id', req.user.id)
    .eq('recipe_id', recipeId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
