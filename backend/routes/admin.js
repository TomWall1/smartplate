const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { adminSupabase } = require('../services/authService');
const { Pool } = require('pg');

const router = express.Router();

// Middleware: verify the authenticated user is the configured admin
function requireAdmin(req, res, next) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return res.status(503).json({ error: 'Admin not configured — set ADMIN_EMAIL env var' });
  }
  if (req.user.email !== adminEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── GET /api/admin/users — list all users with premium status ─────────────
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  if (!adminSupabase) {
    return res.status(503).json({ error: 'Admin client not configured — set SUPABASE_SERVICE_ROLE_KEY' });
  }

  const { data: users, error } = await adminSupabase
    .from('users')
    .select('id, email, is_premium, premium_since, selected_store, state, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/users] error:', error.message);
    return res.status(500).json({ error: 'Failed to list users' });
  }

  res.json({ users: users ?? [] });
});

// ── POST /api/admin/users/:userId/toggle-premium ──────────────────────────
router.post('/users/:userId/toggle-premium', requireAuth, requireAdmin, async (req, res) => {
  if (!adminSupabase) {
    return res.status(503).json({ error: 'Admin client not configured' });
  }

  const { userId } = req.params;

  const { data: user, error: fetchError } = await adminSupabase
    .from('users')
    .select('id, email, is_premium')
    .eq('id', userId)
    .single();

  if (fetchError || !user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newPremium = !user.is_premium;
  const { data: updated, error } = await adminSupabase
    .from('users')
    .update({
      is_premium:    newPremium,
      premium_since: newPremium ? new Date().toISOString() : null,
    })
    .eq('id', userId)
    .select('id, email, is_premium, premium_since')
    .single();

  if (error) {
    console.error('[admin/toggle-premium] error:', error.message);
    return res.status(500).json({ error: 'Failed to update premium status' });
  }

  res.json({
    user: updated,
    message: `Premium ${newPremium ? 'enabled' : 'disabled'} for ${user.email}`,
  });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  if (!adminSupabase) {
    return res.status(503).json({ error: 'Admin client not configured' });
  }

  const [usersResult, favResult, mealResult, listResult, alertResult] = await Promise.all([
    adminSupabase.from('users').select('id, is_premium, state'),
    adminSupabase.from('favorite_recipes').select('id', { count: 'exact', head: true }),
    adminSupabase.from('meal_plans').select('id', { count: 'exact', head: true }),
    adminSupabase.from('shopping_lists').select('id', { count: 'exact', head: true }),
    adminSupabase.from('price_alerts').select('id', { count: 'exact', head: true }),
  ]);

  const allUsers    = usersResult.data ?? [];
  const totalUsers  = allUsers.length;
  const premiumUsers = allUsers.filter(u => u.is_premium).length;

  // State distribution
  const STATE_ORDER = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
  const stateCounts = {};
  for (const u of allUsers) {
    const s = u.state?.toLowerCase() || 'nsw'; // default unset users to NSW
    stateCounts[s] = (stateCounts[s] || 0) + 1;
  }
  const stateDistribution = STATE_ORDER.map(s => ({
    state: s.toUpperCase(),
    count: stateCounts[s] || 0,
    pct: totalUsers > 0 ? Math.round(((stateCounts[s] || 0) / totalUsers) * 100) : 0,
  })).filter(s => s.count > 0);

  res.json({
    totalUsers,
    premiumUsers,
    freeUsers:           totalUsers - premiumUsers,
    totalFavorites:      favResult.count   ?? 0,
    totalMealPlans:      mealResult.count  ?? 0,
    totalShoppingLists:  listResult.count  ?? 0,
    totalPriceAlerts:    alertResult.count ?? 0,
    stateDistribution,
  });
});

// ── Lazy PG pool for recipes table (only initialised when needed) ────────────
let _pgPool = null;
function getPgPool() {
  if (!_pgPool && process.env.DATABASE_URL) {
    _pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return _pgPool;
}

// ── GET /api/admin/recipes ─────────────────────────────────────────────────
// Query params: page, limit, search, source, skill, hasMetadata, status (active|inactive|all)
router.get('/recipes', requireAuth, requireAdmin, async (req, res) => {
  const pg = getPgPool();
  if (!pg) return res.status(503).json({ error: 'Database not configured' });

  const page        = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit       = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset      = (page - 1) * limit;
  const search      = req.query.search   || '';
  const source      = req.query.source   || '';
  const skill       = req.query.skill    || '';
  const hasMetadata = req.query.hasMetadata;
  const status      = req.query.status  || 'all'; // 'active' | 'inactive' | 'all'

  const conditions = [];
  const params     = [];
  let   p          = 1;

  if (search) {
    conditions.push(`title ILIKE $${p++}`);
    params.push(`%${search}%`);
  }
  if (source) {
    conditions.push(`source = $${p++}`);
    params.push(source);
  }
  if (skill) {
    conditions.push(`metadata->>'skillLevel' = $${p++}`);
    params.push(skill);
  }
  if (hasMetadata === 'true') {
    conditions.push('metadata IS NOT NULL');
  } else if (hasMetadata === 'false') {
    conditions.push('metadata IS NULL');
  }
  if (status === 'active') {
    conditions.push('is_active = true');
  } else if (status === 'inactive') {
    conditions.push('is_active = false');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [countResult, rowsResult] = await Promise.all([
      pg.query(`SELECT COUNT(*) AS n FROM recipes ${where}`, params),
      pg.query(
        `SELECT id, source_id, source, title, url, image,
                prep_time, cook_time, servings, category, cuisine,
                is_active, metadata, enriched_at, created_at
         FROM recipes ${where}
         ORDER BY id
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      ),
    ]);

    const total = parseInt(countResult.rows[0].n, 10);
    res.json({
      recipes: rowsResult.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[admin/recipes] error:', err.message);
    res.status(500).json({ error: 'Failed to query recipes' });
  }
});

// ── GET /api/admin/recipes/:id ─────────────────────────────────────────────
router.get('/recipes/:id', requireAuth, requireAdmin, async (req, res) => {
  const pg = getPgPool();
  if (!pg) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { rows } = await pg.query('SELECT * FROM recipes WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ recipe: rows[0] });
  } catch (err) {
    console.error('[admin/recipes/:id] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
});

// ── PUT /api/admin/recipes/:id ─────────────────────────────────────────────
// Accepts: { metadata, title, description, is_active, ingredients }
router.put('/recipes/:id', requireAuth, requireAdmin, async (req, res) => {
  const pg = getPgPool();
  if (!pg) return res.status(503).json({ error: 'Database not configured' });

  const { metadata, title, description, is_active, ingredients } = req.body;
  const sets   = [];
  const params = [];
  let   p      = 1;

  if (metadata !== undefined)    { sets.push(`metadata = $${p++}`);     params.push(JSON.stringify(metadata)); }
  if (title !== undefined)       { sets.push(`title = $${p++}`);        params.push(title); }
  if (description !== undefined) { sets.push(`description = $${p++}`);  params.push(description); }
  if (is_active !== undefined)   { sets.push(`is_active = $${p++}`);    params.push(Boolean(is_active)); }

  if (ingredients !== undefined) {
    // Sanitise: subheadings must not carry ingredientTags
    const cleaned = ingredients.map(ing => {
      if (ing.isSubheading) {
        const { ingredientTags, quantity, unit, ...rest } = ing;
        return rest;
      }
      return ing;
    });
    sets.push(`ingredients = $${p++}`);
    params.push(JSON.stringify(cleaned));
  }

  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);

  try {
    const { rows } = await pg.query(
      `UPDATE recipes SET ${sets.join(', ')} WHERE id = $${p}
       RETURNING id, title, is_active, metadata, ingredients`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ recipe: rows[0], message: 'Updated' });
  } catch (err) {
    console.error('[admin/recipes PUT] error:', err.message);
    res.status(500).json({ error: 'Failed to update recipe' });
  }
});

// ── DELETE /api/admin/recipes/:id ──────────────────────────────────────────
router.delete('/recipes/:id', requireAuth, requireAdmin, async (req, res) => {
  const pg = getPgPool();
  if (!pg) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { rowCount } = await pg.query('DELETE FROM recipes WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[admin/recipes DELETE] error:', err.message);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

module.exports = router;