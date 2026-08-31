/**
 * services/priceHistoryService.js
 *
 * Records the real prices the catalogue scraper reads every week.
 *
 * WHY IT EXISTS. Ingredient costs currently come from a Claude estimate of a
 * recipe's TOTAL (recipeCostService). That is fine for a rough price chip and
 * unfit for ranking: a ranking takes the argmin over thousands of recipes, so
 * it systematically surfaces whichever costs were estimated most wrongly
 * cheap. The fix is measurement, and measurement has to start before it can
 * be used — a price not recorded this week cannot be recovered next week.
 *
 * WHAT IT RECORDS. Every catalogue deal, with:
 *   price      — what it costs this week (discounted)
 *   wasPrice   — the pre-discount regular price, where the catalogue states it
 *   unitValue  — the advertised unit price normalised to $/kg, $/L or $/each
 *   tier       — own-brand / branded / premium (see lib/unitPrice.js)
 *
 * price and wasPrice are kept apart on purpose. The special answers "what does
 * this cost this week"; the was-price answers "what does this normally cost".
 * Pooling them makes every reference rate drift downward for ever.
 *
 * KNOWN LIMITS, stated so nobody later mistakes this for a full price index:
 *   - Catalogues only carry SPECIALS. Anything never discounted is invisible.
 *   - Coverage is ~470 items a week, heavily repeated, skewed to centre-aisle
 *     branded goods; fresh produce and butcher meat are under-represented.
 *   - Fresh produce moves weekly and seasonally, so a long median is wrong for
 *     it in a way it is not for tinned goods. Weight by recency when the rates
 *     are eventually derived.
 *   - Prices differ by state, so the series is kept per state, never pooled.
 */

const db = require('../database/db');
const { normalizeName } = require('../lib/normalize');
const { parseUnitPrice, priceTier } = require('../lib/unitPrice');

/**
 * Monday of the week a scrape belongs to, as YYYY-MM-DD.
 *
 * Bucketing to a week (rather than a timestamp) is what makes recording
 * idempotent: the weekly pipeline can run twice, or be retried after a
 * failure, without writing the same price into the series twice.
 */
function weekOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Turn scraped deals into observation rows. Pure — no I/O — so it can be
 * tested and inspected without a database.
 *
 * @param {Array}  deals - deals for ONE state, as the catalogue scraper returns them
 * @param {string} state
 * @param {Date}   [now]
 */
function buildObservations(deals, state, now = new Date()) {
  const observedWeek = weekOf(now);
  const seen = new Set(); // (store, normalized) — the DB key is unique per week
  const rows = [];

  for (const deal of deals ?? []) {
    const name = deal?.name;
    const store = deal?.store;
    if (!name || !store) continue;

    const normalized = normalizeName(name);
    if (!normalized) continue;

    const key = `${store}||${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const price = Number(deal.price);
    const was   = Number(deal.originalPrice ?? deal.wasPrice);
    const unit  = parseUnitPrice(deal.unitPrice);

    // A row with no usable price at all teaches us nothing.
    if (!isFinite(price) && !unit) continue;

    const brand = deal.productIntelligence?.brand ?? null;

    rows.push({
      observedWeek,
      store:      String(store).toLowerCase(),
      state:      String(state).toLowerCase(),
      productName: name,
      normalized,
      brand,
      tier:       priceTier(name, brand),
      price:      isFinite(price) ? +price.toFixed(2) : null,
      // Only keep a was-price that is genuinely above the sale price;
      // some catalogue lines repeat the sale price as the "was".
      wasPrice:   isFinite(was) && isFinite(price) && was > price ? +was.toFixed(2) : null,
      unitValue:  unit?.value ?? null,
      unitBasis:  unit?.basis ?? null,
      category:   deal.productIntelligence?.category ?? deal.category ?? null,
      baseIngredient: deal.productIntelligence?.baseIngredient ?? null,
    });
  }

  return rows;
}

/**
 * Record one state's deals. Never throws: this is bookkeeping running inside
 * the weekly pipeline, and a failure to record prices must not take down the
 * deal refresh that users actually depend on.
 *
 * @returns {Promise<number>} rows written
 */
async function recordDeals(deals, state, now = new Date()) {
  try {
    if (!db?.savePriceObservations) return 0;
    const rows = buildObservations(deals, state, now);
    if (rows.length === 0) return 0;

    const written = await db.savePriceObservations(rows);
    const withUnit = rows.filter(r => r.unitValue != null).length;
    console.log(
      `[priceHistory] ${state.toUpperCase()}: recorded ${written} prices ` +
      `(${withUnit} with a unit price) for week ${rows[0].observedWeek}`
    );
    return written;
  } catch (err) {
    console.warn(`[priceHistory] recording failed for ${state}: ${err.message}`);
    return 0;
  }
}

/** How much history exists yet — the answer to "can we start using this". */
async function getStats() {
  try {
    if (!db?.getPriceObservationStats) return null;
    return await db.getPriceObservationStats();
  } catch (err) {
    console.warn('[priceHistory] stats unavailable:', err.message);
    return null;
  }
}

module.exports = { recordDeals, buildObservations, getStats, weekOf };
