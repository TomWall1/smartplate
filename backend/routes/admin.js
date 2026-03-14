const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { adminSupabase } = require('../services/authService');

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
    .select('id, email, is_premium, premium_since, selected_store, created_at')
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
    adminSupabase.from('users').select('id, is_premium'),
    adminSupabase.from('favorite_recipes').select('id', { count: 'exact', head: true }),
    adminSupabase.from('meal_plans').select('id', { count: 'exact', head: true }),
    adminSupabase.from('shopping_lists').select('id', { count: 'exact', head: true }),
    adminSupabase.from('price_alerts').select('id', { count: 'exact', head: true }),
  ]);

  const allUsers    = usersResult.data ?? [];
  const totalUsers  = allUsers.length;
  const premiumUsers = allUsers.filter(u => u.is_premium).length;

  res.json({
    totalUsers,
    premiumUsers,
    freeUsers:           totalUsers - premiumUsers,
    totalFavorites:      favResult.count   ?? 0,
    totalMealPlans:      mealResult.count  ?? 0,
    totalShoppingLists:  listResult.count  ?? 0,
    totalPriceAlerts:    alertResult.count ?? 0,
  });
});

module.exports = router;