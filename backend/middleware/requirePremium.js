const { clientForToken } = require('../services/authService');

/**
 * Middleware that checks the authenticated user has is_premium = true.
 * Must be used after requireAuth (which sets req.user and req.token).
 * Returns 403 with upgrade message if user is not premium.
 */
async function requirePremium(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const supabase = clientForToken(req.token);
    if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

    const { data: profile } = await supabase
      .from('users')
      .select('is_premium')
      .eq('id', req.user.id)
      .single();

    if (!profile?.is_premium) {
      return res.status(403).json({
        error: 'Premium required',
        message: 'Upgrade to SmartPlate Premium to access this feature',
        upgradeUrl: '/premium',
      });
    }

    req.isPremium = true;
    next();
  } catch (err) {
    console.error('[requirePremium] error:', err.message);
    return res.status(500).json({ error: 'Failed to check premium status' });
  }
}

module.exports = requirePremium;