const crypto = require('crypto');
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { adminSupabase } = require('../services/authService');
const { PREMIUM_COLUMNS, premiumStatus } = require('../services/premiumService');

const router = express.Router();

const WEBHOOK_SECRET   = process.env.REVENUECAT_WEBHOOK_SECRET;
const RC_SECRET_API_KEY = process.env.REVENUECAT_SECRET_API_KEY;
const ENTITLEMENT_ID   = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';

// Supabase user ids are UUIDs. RevenueCat also issues anonymous ids of the form
// `$RCAnonymousID:...` for users who never logged in — those map to nobody and
// must never be treated as a user id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Write an entitlement decision for one user.
 *
 * `expiresAt` is the authoritative value from the store: past means lapsed.
 * `nonExpiring` says a null expiry means "granted forever" (a lifetime or
 * non-renewing product) rather than "no entitlement" — without it, any product
 * the store reports without an expiration date is silently written as lapsed.
 *
 * A manual comp (premium_source 'admin', expiry NULL) is never touched by a
 * store event. The old code claimed this but did not do it: it wrote
 * is_premium and premium_source unconditionally, so one EXPIRATION for a
 * comped user who had also once subscribed revoked the comp. The row is read
 * first and admin-sourced rows are left alone.
 */
async function applyEntitlement({ userId, expiresAt, productId, store, nonExpiring = false }) {
  const active = expiresAt
    ? new Date(expiresAt).getTime() > Date.now()
    : nonExpiring;

  const { data: current } = await adminSupabase
    .from('users')
    .select('premium_since, premium_source, premium_expires_at, is_premium')
    .eq('id', userId)
    .single();

  // A comp is an admin decision; only an admin revokes it.
  if (current?.premium_source === 'admin' && !current?.premium_expires_at) {
    console.log(`[subscriptions] ${userId} holds an admin comp — store event ignored`);
    return !!current.is_premium;
  }

  const update = {
    is_premium:         active,
    premium_expires_at: expiresAt,
    premium_source:     store === 'PLAY_STORE' ? 'play' : 'app_store',
    premium_product_id: productId ?? null,
  };

  // premium_since is a FIRST-purchase marker. It used to be rewritten to now()
  // on every active event, so each monthly renewal reset it and tenure was
  // always "joined this month". Set it only when there is nothing there.
  if (active && !current?.premium_since) {
    update.premium_since = new Date().toISOString();
  }

  const { error } = await adminSupabase
    .from('users')
    .update(update)
    .eq('id', userId);

  if (error) throw new Error(`entitlement update failed: ${error.message}`);
  return active;
}

/**
 * TRANSFER moves a store subscription from one app user to another (the same
 * receipt signing in on a second account). RevenueCat reports who lost it and
 * who gained it; without handling this the losing account keeps premium for
 * ever off a subscription it no longer holds.
 */
async function applyTransfer(event) {
  const ids = (list) => (Array.isArray(list) ? list : []).filter(id => UUID_RE.test(id));

  for (const userId of ids(event.transferred_from)) {
    await adminSupabase
      .from('users')
      .update({ is_premium: false, premium_expires_at: new Date().toISOString() })
      .eq('id', userId)
      .neq('premium_source', 'admin');
  }

  // The gaining side has no expiry on the transfer event itself; /refresh (or
  // the next renewal event) fills it in. Grant nothing here rather than guess.
  return ids(event.transferred_to).length > 0;
}

// ── POST /api/subscriptions/webhook ──────────────────────────────────────────
// RevenueCat webhook. Authenticated by a shared secret sent in the
// Authorization header (configured in the RevenueCat dashboard), not an HMAC of
// the body — so the parsed JSON body is fine here.
//
// NOTE ON SANDBOX: App Review makes *sandbox* purchases. Sandbox events are
// honoured deliberately — dropping them would make the app look broken to the
// reviewer. The environment is recorded on the event row for auditing.
router.post('/webhook', async (req, res) => {
  if (!WEBHOOK_SECRET) {
    console.error('[subscriptions] REVENUECAT_WEBHOOK_SECRET not set — rejecting');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  if (!adminSupabase) {
    console.error('[subscriptions] admin client not configured');
    return res.status(503).json({ error: 'Not configured' });
  }
  if (!timingSafeEqual(req.headers.authorization || '', WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body?.event;
  if (!event?.id || !event?.type) {
    return res.status(400).json({ error: 'Malformed event' });
  }

  // TEST events come from the dashboard's "Send test event" button.
  if (event.type === 'TEST') return res.json({ ok: true, ignored: 'TEST' });

  const appUserId = event.app_user_id;
  const userId = UUID_RE.test(appUserId || '') ? appUserId : null;

  // Replay guard. The primary key on event_id makes the insert itself the
  // check: a duplicate delivery conflicts and we stop before touching
  // entitlement. Without this, a redelivered EXPIRATION after a re-purchase
  // would revoke a subscription that is actually live.
  const { error: insertError } = await adminSupabase
    .from('subscription_events')
    .insert({
      event_id:   event.id,
      user_id:    userId,
      event_type: event.type,
      store:      event.store ?? null,
      payload:    req.body,
    });

  if (insertError) {
    // 23505 = unique_violation → already processed. Ack so RevenueCat stops.
    if (insertError.code === '23505') {
      return res.json({ ok: true, duplicate: true });
    }
    console.error('[subscriptions] event log failed:', insertError.message);
    return res.status(500).json({ error: 'Could not record event' });
  }

  try {
    // TRANSFER carries the affected users in transferred_from/to rather than
    // in app_user_id, so it is handled before the app_user_id check below.
    if (event.type === 'TRANSFER') {
      const moved = await applyTransfer(event);
      console.log(`[subscriptions] TRANSFER handled (moved=${moved})`);
      return res.json({ ok: true, transferred: moved });
    }

    if (!userId) {
      // Anonymous purchase — nothing to grant until the user logs in and
      // RevenueCat aliases the id. Recorded above, so it is not lost.
      console.warn('[subscriptions] event for non-UUID app_user_id:', appUserId);
      return res.json({ ok: true, unmapped: true });
    }

    // Entitlement is derived from expiration_at_ms rather than from the event
    // type, which handles every lifecycle case with one rule:
    //   purchase/renewal  → future expiry  → active
    //   cancellation      → future expiry  → stays active until period end
    //   refund            → past expiry    → revoked immediately
    //   expiration        → past expiry    → revoked
    //   billing issue     → grace expiry   → active through the grace period
    const grantsEntitlement =
      !event.entitlement_ids || event.entitlement_ids.includes(ENTITLEMENT_ID);

    if (!grantsEntitlement) {
      return res.json({ ok: true, ignored: 'other entitlement' });
    }

    const expiresAt = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    // A non-subscription purchase (lifetime unlock, non-renewing pass) carries
    // no expiration. Treating a missing expiry as "lapsed" would revoke it the
    // moment it was bought, so the grant is explicit for those product types.
    const NON_EXPIRING = new Set(['NON_RENEWING_PURCHASE', 'NON_SUBSCRIPTION_PURCHASE']);
    const revoking = event.type === 'EXPIRATION' || event.type === 'REFUND';

    const active = await applyEntitlement({
      userId,
      expiresAt: revoking ? new Date().toISOString() : expiresAt,
      productId: event.product_id,
      store:     event.store,
      nonExpiring: !revoking && NON_EXPIRING.has(event.type),
    });

    console.log(`[subscriptions] ${event.type} ${userId} → premium=${active} until=${expiresAt}`);
    res.json({ ok: true, isPremium: active });
  } catch (err) {
    console.error('[subscriptions] apply failed:', err.message);
    // 500 makes RevenueCat retry, which is what we want — but the event row is
    // already written, so the retry would be swallowed as a duplicate. Remove
    // it so the retry can do real work.
    await adminSupabase.from('subscription_events').delete().eq('event_id', event.id);
    res.status(500).json({ error: 'Could not apply entitlement' });
  }
});

// ── POST /api/subscriptions/refresh ──────────────────────────────────────────
// Reconcile this user's entitlement against RevenueCat on demand.
//
// The app calls this straight after a purchase or restore. Without it the
// client would be racing the webhook: the purchase succeeds, the app unlocks
// from its local CustomerInfo, but /api/premium/* keeps 403-ing until the
// webhook lands. This makes unlock deterministic.
router.post('/refresh', requireAuth, async (req, res) => {
  if (!RC_SECRET_API_KEY) return res.status(503).json({ error: 'Not configured' });
  if (!adminSupabase)     return res.status(503).json({ error: 'Not configured' });

  try {
    const rcRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(req.user.id)}`,
      { headers: { Authorization: `Bearer ${RC_SECRET_API_KEY}` } },
    );

    if (!rcRes.ok) {
      console.error('[subscriptions/refresh] RevenueCat', rcRes.status);
      return res.status(502).json({ error: 'Could not reach the store' });
    }

    const body = await rcRes.json();
    const ent = body?.subscriber?.entitlements?.[ENTITLEMENT_ID];

    // No entitlement at all: leave the row alone rather than revoking. A manual
    // comp has no RevenueCat record and must survive this call.
    if (!ent) {
      const { data: profile } = await adminSupabase
        .from('users')
        .select(`premium_since, ${PREMIUM_COLUMNS}`)
        .eq('id', req.user.id)
        .single();
      return res.json(premiumStatus(profile));
    }

    await applyEntitlement({
      userId:    req.user.id,
      expiresAt: ent.expires_date ?? null,
      productId: ent.product_identifier,
      store:     body?.subscriber?.subscriptions?.[ent.product_identifier]?.store,
      // RevenueCat reports a lifetime entitlement as present with no
      // expires_date. It is granted, not lapsed.
      nonExpiring: !ent.expires_date,
    });

    const { data: profile } = await adminSupabase
      .from('users')
      .select(`premium_since, ${PREMIUM_COLUMNS}`)
      .eq('id', req.user.id)
      .single();

    res.json(premiumStatus(profile));
  } catch (err) {
    console.error('[subscriptions/refresh]', err.message);
    res.status(500).json({ error: 'Could not refresh subscription' });
  }
});

module.exports = router;
