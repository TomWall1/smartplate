const express = require('express');
const { supabase } = require('../services/authService');

const router = express.Router();

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });

  const session = data.session;
  if (!session) {
    // Email confirmation required — no session yet
    return res.json({ message: 'Check your email to confirm your account before signing in.' });
  }

  res.json({
    token: session.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      is_premium: false,
      state: null,
    },
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });

  const { session, user } = data;

  // Fetch full profile from our users table (has is_premium, state, etc.)
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  res.json({
    token: session.access_token,
    user: profile ?? {
      id: user.id,
      email: user.email,
      is_premium: false,
      state: null,
    },
  });
});

module.exports = router;
