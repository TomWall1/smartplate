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
    refresh_token: session.refresh_token,
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
    refresh_token: session.refresh_token,
    user: profile ?? {
      id: user.id,
      email: user.email,
      is_premium: false,
      state: null,
    },
  });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
// Exchange a Supabase refresh token for a fresh access token. Lets clients
// (esp. mobile) keep a session alive past the ~1h access-token expiry instead
// of being force-logged-out. Keeps the Supabase interaction server-side.
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token is required' });
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error || !data?.session) return res.status(401).json({ error: error?.message ?? 'Could not refresh session' });

  res.json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

// ── POST /api/auth/oauth-native ───────────────────────────────────────────────
// Exchange a native provider ID token (Google / Apple, obtained on-device via
// the native sign-in SDKs) for a Supabase session. Keeps the Supabase anon key
// server-side and returns the same {token, refresh_token, user} shape as login.
//
// SETUP REQUIRED before this works: enable the Google and Apple providers in
// the Supabase dashboard (Auth → Providers) with the matching client IDs, so
// signInWithIdToken accepts the tokens.
router.post('/oauth-native', async (req, res) => {
  const { provider, idToken } = req.body;
  if (!provider || !idToken) return res.status(400).json({ error: 'provider and idToken are required' });
  if (!['google', 'apple'].includes(provider)) return res.status(400).json({ error: 'unsupported provider' });
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data, error } = await supabase.auth.signInWithIdToken({ provider, token: idToken });
  if (error || !data?.session) {
    return res.status(401).json({ error: error?.message ?? 'Native sign-in failed' });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  res.json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: profile ?? {
      id: data.user.id,
      email: data.user.email,
      is_premium: false,
      state: null,
    },
  });
});

module.exports = router;
