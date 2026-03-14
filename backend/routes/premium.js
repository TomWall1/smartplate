const express = require('express');
const requireAuth   = require('../middleware/requireAuth');
const requirePremium = require('../middleware/requirePremium');
const { clientForToken } = require('../services/authService');

const router = express.Router();

// All premium routes require authentication
router.use(requireAuth);

// ── GET /api/premium/status ───────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const supabase = clientForToken(req.token);
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_premium, premium_since')
    .eq('id', req.user.id)
    .single();

  res.json({
    isPremium:    profile?.is_premium    ?? false,
    premiumSince: profile?.premium_since ?? null,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FAVORITES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/premium/favorites
router.get('/favorites', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { data, error } = await supabase
    .from('favorite_recipes')
    .select('*')
    .eq('user_id', req.user.id)
    .order('saved_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorites: data ?? [] });
});

// POST /api/premium/favorites/:recipeId
router.post('/favorites/:recipeId', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { recipeId } = req.params;
  const { recipe_data } = req.body; // Optional snapshot: { title, image, tags, prepTime }

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

// DELETE /api/premium/favorites/:recipeId
router.delete('/favorites/:recipeId', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { recipeId } = req.params;

  const { error } = await supabase
    .from('favorite_recipes')
    .delete()
    .eq('user_id', req.user.id)
    .eq('recipe_id', recipeId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// MEAL PLAN
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/premium/meal-plan?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/meal-plan', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { startDate, endDate } = req.query;

  let query = supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', req.user.id)
    .order('date', { ascending: true });

  if (startDate) query = query.gte('date', startDate);
  if (endDate)   query = query.lte('date', endDate);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ mealPlan: data ?? [] });
});

// POST /api/premium/meal-plan
router.post('/meal-plan', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { date, meal_type, recipe_id, recipe_data } = req.body;

  if (!date || !meal_type || !recipe_id) {
    return res.status(400).json({ error: 'date, meal_type, and recipe_id are required' });
  }
  if (!['breakfast', 'lunch', 'dinner'].includes(meal_type)) {
    return res.status(400).json({ error: 'meal_type must be breakfast, lunch, or dinner' });
  }

  const { data, error } = await supabase
    .from('meal_plans')
    .upsert(
      { user_id: req.user.id, date, meal_type, recipe_id, recipe_data: recipe_data ?? null },
      { onConflict: 'user_id,date,meal_type' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ meal: data });
});

// DELETE /api/premium/meal-plan/:id
router.delete('/meal-plan/:id', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { id } = req.params;

  const { error } = await supabase
    .from('meal_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// SHOPPING LISTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/premium/shopping-lists
router.get('/shopping-lists', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ lists: data ?? [] });
});

// POST /api/premium/shopping-lists
router.post('/shopping-lists', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { name, items } = req.body;

  const { data, error } = await supabase
    .from('shopping_lists')
    .insert({
      user_id: req.user.id,
      name:    name  || 'My Shopping List',
      items:   items || [],
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ list: data });
});

// PUT /api/premium/shopping-lists/:id
router.put('/shopping-lists/:id', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { id } = req.params;
  const { name, items } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (name  !== undefined) updates.name  = name;
  if (items !== undefined) updates.items = items;

  const { data, error } = await supabase
    .from('shopping_lists')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ list: data });
});

// DELETE /api/premium/shopping-lists/:id
router.delete('/shopping-lists/:id', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { id } = req.params;

  const { error } = await supabase
    .from('shopping_lists')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// PRICE ALERTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/premium/price-alerts
router.get('/price-alerts', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ alerts: data ?? [] });
});

// POST /api/premium/price-alerts
router.post('/price-alerts', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { product_name, target_price, store } = req.body;

  if (!product_name || target_price == null) {
    return res.status(400).json({ error: 'product_name and target_price are required' });
  }

  const { data, error } = await supabase
    .from('price_alerts')
    .insert({
      user_id:      req.user.id,
      product_name,
      target_price,
      store:        store || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ alert: data });
});

// DELETE /api/premium/price-alerts/:id
router.delete('/price-alerts/:id', requirePremium, async (req, res) => {
  const supabase = clientForToken(req.token);
  const { id } = req.params;

  const { error } = await supabase
    .from('price_alerts')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;