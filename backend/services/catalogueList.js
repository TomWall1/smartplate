/**
 * services/catalogueList.js
 *
 * Per-state catalogue deals, scraped from Salefinder's server-rendered product
 * list. Plain HTTP — no browser, no token, no API key.
 *
 * BACKGROUND. The old per-state path called
 * `embed.salefinder.com.au/productlist/category/{id}`. That endpoint now
 * answers "Sorry, catalogue not found." for every id — including ones that
 * demonstrably worked in June — which is why every state artifact froze on
 * 11 June 2026 while the national cache kept updating through a separate
 * HTML fallback. Nothing reported the gap for ten weeks.
 *
 * WHAT REPLACED IT. Each catalogue has a plain list view at
 * `/{retailer}-catalogue/{slug}/{saleId}/list`, paginated with `?qs={page},,,,`
 * at 12 items per page. It carries more than the old API did: the advertised
 * unit price ("$21 per kg", "68¢ per 100g") and the retailer's real offer
 * dates, rather than the fetch-time-plus-seven-days we used to invent.
 *
 * THE STATE SWITCH. Two cookies, both required. `postcodeId` alone scopes the
 * catalogue LIST, but the viewer then blocks on a "View catalogues in your
 * area" modal — the site's own region.js sets `postcodeId` AND `regionName`
 * together, and so must we. Get both from
 * `/ajax/locationsearch?query={postcode}`.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { isLikelyFood, mapCategory } = require('./salefinder');

const BASE = 'https://www.salefinder.com.au';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Capital-city postcodes — pricing is state-wide, so a capital is a sound
// proxy and avoids multiplying requests per suburb.
const STATE_POSTCODES = {
  nsw: '2000', vic: '3000', qld: '4000', wa: '6000',
  sa: '5000', tas: '7000', nt: '0800', act: '2600',
};

const ITEMS_PER_PAGE = 12;
const MAX_PAGES = 40; // 480 items — comfortably above a full weekly catalogue

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Location ────────────────────────────────────────────────────────────────

async function locationFor(state) {
  const postcode = STATE_POSTCODES[state];
  if (!postcode) throw new Error(`unknown state: ${state}`);

  const res = await axios.get(`${BASE}/ajax/locationsearch`, {
    params: { query: postcode },
    headers: { 'User-Agent': UA, Referer: `${BASE}/` },
    timeout: 20000,
    responseType: 'text',
  });

  // JSONP: ({"suggestions":[{"data":"347","value":"BARANGAROO, 2000"}]})
  const parsed = JSON.parse(String(res.data).replace(/^\(|\)$/g, ''));
  const first = (parsed.suggestions || [])[0];
  if (!first) throw new Error(`no Salefinder location for ${state} (${postcode})`);

  return {
    cookie: `postcodeId=${first.data}; regionName=${encodeURIComponent(first.value)}`,
    label: first.value,
  };
}

// ── Catalogue discovery ─────────────────────────────────────────────────────

/**
 * Retailers also publish health & beauty and "best buys" catalogues with no
 * groceries in them. Picking one of those would look like a successful fetch
 * and yield nothing a recipe can use.
 */
function scoreCatalogue(slug, state) {
  const s = slug.toLowerCase();
  let score = 0;
  if (s.includes('weekly')) score += 10;
  if (s.includes(state)) score += 5;
  if (s.includes('special')) score += 3;
  if (/(health|beauty|gaming|liquor|best-buys|toy|baby)/.test(s)) score -= 20;
  return score;
}

async function cataloguesFor(retailer, state, cookie) {
  const res = await axios.get(`${BASE}/${retailer}-catalogue`, {
    headers: { 'User-Agent': UA, Cookie: cookie },
    timeout: 30000,
    responseType: 'text',
  });

  const $ = cheerio.load(res.data);
  const re = new RegExp(`/${retailer}-catalogue/([^/]+)/(\\d+)/`, 'i');
  const found = new Map();

  $('a[href*="-catalogue/"]').each((_, el) => {
    const m = ($(el).attr('href') || '').match(re);
    if (m && !found.has(m[2])) found.set(m[2], { id: m[2], slug: m[1] });
  });

  return [...found.values()].sort(
    (a, b) => scoreCatalogue(b.slug, state) - scoreCatalogue(a.slug, state)
  );
}

// ── Parsing ─────────────────────────────────────────────────────────────────

// Catalogue names arrive HTML-encoded ("Nestl&eacute;", "Allen&rsquo;s",
// "M&amp;Ms") - about a quarter of them. Decode at the source so every
// consumer, web and mobile, gets clean text.
const ENTITIES = {
  amp: '&', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö',
  hellip: '…', reg: '®', trade: '™', deg: '°',
  frac12: '½', lt: '<', gt: '>',
};

function decodeEntities(input) {
  return String(input || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // Named last, so a decoded &amp; cannot re-trigger a match.
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
    .trim();
}

const money = (text) => {
  const m = String(text || '').match(/\$\s?([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
};

/**
 * One page of the list view. Markup is the same `.item-landscape` /
 * `a.item-image[data-itemname]` shape the national scraper already reads.
 */
function parseListPage(html, { store, validUntil }) {
  const $ = cheerio.load(html);
  const deals = [];

  $('a.item-image').each((_, el) => {
    const $el = $(el);
    const name = decodeEntities($el.attr('data-itemname'));
    if (!name) return;

    const wrap = $el.closest('.item-landscape');
    const detail = wrap.length ? wrap : $el.parent();
    const text = detail.text().replace(/\s+/g, ' ').trim();

    const price = money(detail.find('.price').first().text() || text);
    if (price == null) return;

    // "Was $12.00" and "1/2 Price, Save $2.80" both appear; either gives us
    // the pre-discount price.
    const wasPrice = money((text.match(/was\s*\$[\d.]+/i) || [])[0]);
    const save = money((text.match(/save\s*\$[\d.]+/i) || [])[0]);
    const originalPrice =
      wasPrice != null ? wasPrice : save != null ? +(price + save).toFixed(2) : null;

    // The advertised unit price — "$21 per kg", "68¢ per 100g", "$4.13 per
    // litre". This is what the old feed never gave us, and its absence is why
    // a whole chicken advertised per kilo read as a $4 chicken.
    const unitPrice = (text.match(/(?:\$[\d.]+|\d+¢)\s*(?:per|\/)\s*[\d]*\s*(?:kg|g|ml|l|litre|each)/i) || [])[0] || null;

    // Category from the product URL: /67397/food-and-beverage/groceries/meat/…
    const href = $el.attr('href') || '';
    const segments = href.split('/').filter(Boolean);
    const rawCategory =
      segments.find(
        (p) => !/^\d+$/.test(p) && !['food-and-beverage', 'groceries'].includes(p)
      ) || '';

    deals.push({
      name,
      category: mapCategory(rawCategory.replace(/-/g, ' ')),
      price: +price.toFixed(2),
      originalPrice,
      discountPercentage:
        originalPrice && originalPrice > price
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : 0,
      unitPrice,
      store,
      description: name,
      validUntil,
    });
  });

  return deals;
}

/** The offer window the retailer actually advertises, e.g. "Wed 26 Aug 2026 - Tue 1 Sep 2026". */
function parseValidUntil(html) {
  const m = html.match(/Offer valid[^<]*?-\s*([A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
  if (m) {
    const d = new Date(m[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Every food deal in one retailer's current catalogue for one state.
 * Returns [] rather than throwing when a retailer has no catalogue this week —
 * the caller distinguishes "none published" from "fetch broke".
 */
async function fetchStoreCatalogue(retailer, state, { cookie, delayMs = 400 } = {}) {
  const location = cookie ? { cookie } : await locationFor(state);
  const catalogues = await cataloguesFor(retailer, state, location.cookie);
  if (catalogues.length === 0) return { deals: [], catalogue: null };

  const chosen = catalogues[0];
  const listUrl = `${BASE}/${retailer}-catalogue/${chosen.slug}/${chosen.id}/list`;

  const seen = new Set();
  const deals = [];
  let validUntil = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await axios.get(listUrl, {
      params: page === 1 ? undefined : { qs: `${page},,,,` },
      headers: { 'User-Agent': UA, Cookie: location.cookie },
      timeout: 30000,
      responseType: 'text',
    });

    if (validUntil == null) validUntil = parseValidUntil(res.data);

    const pageDeals = parseListPage(res.data, {
      store: retailer,
      validUntil: validUntil ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    let added = 0;
    for (const d of pageDeals) {
      if (seen.has(d.name)) continue;
      seen.add(d.name);
      if (!isLikelyFood(d.name)) continue;
      deals.push(d);
      added++;
    }

    // A short page or a page that added nothing new means we are at the end.
    if (pageDeals.length < ITEMS_PER_PAGE || added === 0) break;
    await sleep(delayMs); // be a considerate client
  }

  return { deals, catalogue: chosen, validUntil };
}

/** All three retailers for one state, sharing a single location lookup. */
async function fetchStateCatalogues(state, retailers = ['woolworths', 'coles', 'iga']) {
  const location = await locationFor(state);
  const byStore = {};
  const missing = [];

  for (const retailer of retailers) {
    try {
      const { deals, catalogue } = await fetchStoreCatalogue(retailer, state, {
        cookie: location.cookie,
      });
      byStore[retailer] = deals;
      if (deals.length === 0) missing.push(retailer);
      console.log(
        `[CatalogueList] ${state}/${retailer}: ${deals.length} deals` +
          (catalogue ? ` from "${catalogue.slug}" (${catalogue.id})` : ' — no catalogue listed')
      );
    } catch (err) {
      console.warn(`[CatalogueList] ${state}/${retailer} failed: ${err.message}`);
      byStore[retailer] = [];
      missing.push(retailer);
    }
  }

  return { byStore, missing, location: location.label };
}

module.exports = {
  STATE_POSTCODES,
  locationFor,
  cataloguesFor,
  fetchStoreCatalogue,
  fetchStateCatalogues,
  parseListPage,
  decodeEntities,
};
