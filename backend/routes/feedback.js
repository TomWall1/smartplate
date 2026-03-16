/**
 * feedback.js  —  Phase 4
 *
 * User feedback on ingredient-to-product matches.
 * Auth is optional — anonymous feedback is accepted.
 */
const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

let _pool = null;
function getPool() {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return _pool;
}

// Optional auth — extract user_id if JWT present but don't require it
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    supabase.auth.getUser(header.slice(7)).then(({ data }) => {
      req.userId = data?.user?.id || null;
      next();
    }).catch(() => { req.userId = null; next(); });
  } else {
    req.userId = null;
    next();
  }
}

// ── POST /api/feedback/match ──────────────────────────────────────────────
router.post('/match', optionalAuth, async (req, res) => {
  const pg = getPool();
  if (!pg) return res.status(503).json({ error: 'Database not configured' });

  const { recipe_id, recipe_title, ingredient_name, product_name, store, feedback_type, reason } = req.body;

  if (!ingredient_name || !product_name || !feedback_type) {
    return res.status(400).json({ error: 'ingredient_name, product_name, and feedback_type are required' });
  }
  if (!['incorrect', 'correct'].includes(feedback_type)) {
    return res.status(400).json({ error: 'feedback_type must be "incorrect" or "correct"' });
  }

  try {
    await pg.query(
      `INSERT INTO match_feedback (recipe_id, recipe_title, ingredient_name, product_name, store, user_id, feedback_type, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        recipe_id   || null,
        recipe_title || null,
        ingredient_name.toLowerCase().trim(),
        product_name.toLowerCase().trim(),
        store       || null,
        req.userId  || null,
        feedback_type,
        reason      || null,
      ],
    );
    res.json({ message: 'Feedback recorded — thank you!' });
  } catch (err) {
    console.error('[feedback/match]', err.message);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

module.exports = router;
