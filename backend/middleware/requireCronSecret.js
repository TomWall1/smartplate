const crypto = require('crypto');

/**
 * Guards the endpoints that trigger expensive work — full catalogue scrapes
 * and Claude recipe generation.
 *
 * These were reachable by anyone who knew the URL. A rate limit (3/hour per
 * IP) and a 12-hour freshness guard bounded the damage, but `?force=true`
 * skips the freshness check and three triggers an hour is enough to keep a
 * 25-minute pipeline running back to back — each run regenerating 252 recipes
 * through Claude, on our bill.
 *
 * This is a machine-to-machine secret for the GitHub Actions cron, not a user
 * identity: the admin routes that expose user data use requireAuth +
 * ADMIN_EMAIL instead, which is the right check for a person.
 *
 * Fails CLOSED. If CRON_SECRET is not configured the endpoint is unavailable
 * rather than open — but see server.js, which warns loudly at boot when it is
 * missing, so a silent misconfiguration cannot quietly stop the weekly refresh
 * the way past silent failures have.
 */
function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error(
      `[CronAuth] ${req.method} ${req.originalUrl} refused — CRON_SECRET is not set. ` +
        'Set it in the Render dashboard and in GitHub repo secrets.'
    );
    return res.status(503).json({
      error: 'Pipeline trigger not configured',
      message: 'CRON_SECRET is not set on the server.',
    });
  }

  const header = req.get('x-cron-secret') ?? '';
  const bearer = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const supplied = header || bearer;

  if (!supplied || !timingSafeEqual(supplied, expected)) {
    console.warn(`[CronAuth] ${req.method} ${req.originalUrl} rejected from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * Constant-time comparison. A plain `===` leaks how much of the secret is
 * correct through response timing, which is enough to recover it byte by byte.
 * Hashing both sides first keeps the lengths equal, since timingSafeEqual
 * throws on a length mismatch — and the length itself is a hint worth hiding.
 */
function timingSafeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = requireCronSecret;
