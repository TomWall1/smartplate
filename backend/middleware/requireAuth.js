const { supabase } = require('../services/authService');

/**
 * Express middleware that validates a Supabase JWT from the Authorization header.
 * On success, attaches req.user (Supabase User object) and req.token (raw JWT).
 * Returns 401 if the header is missing, malformed, or the token is invalid.
 */
async function requireAuth(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ error: 'Auth service not configured — set SUPABASE_URL and SUPABASE_ANON_KEY' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user  = user;
  req.token = token;
  next();
}

module.exports = requireAuth;
