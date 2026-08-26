/**
 * Per-state catalogue fetcher.
 *
 * WHY A BROWSER. Salefinder's structured product data lives behind
 * `embed.salefinder.com.au/productlist/view/{saleId}/?locationId=…&token=…`.
 * The token is minted client-side and does not survive being replayed from a
 * server (verified: same URL from Node returns HTTP 200 with an empty body).
 * Rather than reverse-engineer how it is generated — obfuscated, and free to
 * change without notice — we let a real browser make the call and read the
 * response off the wire.
 *
 * WHY THIS EXISTS AT ALL. The old pipeline called
 * `productlist/category/{id}` with no token. That endpoint now answers
 * "catalogue not found" for every id, which is why every per-state artifact
 * froze on 11 June 2026 while the national cache kept updating through a
 * separate HTML-scraping fallback. Nothing reported it for ten weeks.
 *
 * FLOW, per retailer × state:
 *   1. locationsearch → postcodeId for that state's capital
 *   2. postcodeId cookie → the retailer's catalogue list for THAT state
 *   3. open the catalogue viewer, intercept the productlist/view response
 *   4. parse the returned HTML fragment into deals
 *
 * Usage:
 *   node fetch.js                                  # every retailer, every state
 *   node fetch.js --state vic --retailer woolworths
 *   node fetch.js --state vic --debug              # save raw responses
 *   node fetch.js --post https://api…/api/deals/ingest --secret $CRON_SECRET
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Capital-city postcodes. Salefinder scopes catalogues by location, and a
// capital is the safest proxy for "this state's catalogue" — the alternative
// (per-suburb) would multiply requests for pricing that is state-wide anyway.
const STATE_POSTCODES = {
  nsw: '2000',
  vic: '3000',
  qld: '4000',
  wa: '6000',
  sa: '5000',
  tas: '7000',
  nt: '0800',
  act: '2600',
};

const RETAILERS = ['woolworths', 'coles', 'iga'];

const SALEFINDER = 'https://www.salefinder.com.au';

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { states: Object.keys(STATE_POSTCODES), retailers: RETAILERS, debug: false };
  for (let i = 2; i < argv.length; i++) {
    const next = argv[i + 1];
    switch (argv[i]) {
      case '--state':    args.states = [next.toLowerCase()]; i++; break;
      case '--retailer': args.retailers = [next.toLowerCase()]; i++; break;
      case '--post':     args.post = next; i++; break;
      case '--secret':   args.secret = next; i++; break;
      case '--out':      args.out = next; i++; break;
      case '--debug':    args.debug = true; break;
    }
  }
  return args;
}

// ── Step 1: postcode → Salefinder location id ────────────────────────────────

async function locationIdForState(state) {
  const postcode = STATE_POSTCODES[state];
  const res = await fetch(`${SALEFINDER}/ajax/locationsearch?query=${postcode}`, {
    headers: { 'User-Agent': UA, Referer: SALEFINDER + '/' },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  // JSONP: ({...})
  const json = JSON.parse(text.replace(/^\(|\)$/g, ''));
  const suggestion = (json.suggestions || [])[0];
  if (!suggestion) throw new Error(`no location for ${state} (${postcode})`);
  return { postcodeId: suggestion.data, label: suggestion.value };
}

// ── Step 2: which catalogues exist for this retailer in this state ───────────

/**
 * Prefer the weekly food catalogue. Retailers also publish health & beauty and
 * "best buys" catalogues that carry no groceries — picking one of those would
 * yield a technically-successful fetch with nothing a recipe can use.
 */
function rankCatalogue(name, state) {
  const n = name.toLowerCase();
  let score = 0;
  if (n.includes('weekly')) score += 10;
  if (n.includes(state)) score += 5;
  if (n.includes('special')) score += 3;
  if (n.includes('health') || n.includes('beauty')) score -= 10;
  if (n.includes('gaming') || n.includes('best-buys') || n.includes('liquor')) score -= 10;
  return score;
}

async function cataloguesFor(page, retailer, state, postcodeId) {
  await page.context().addCookies([
    { name: 'postcodeId', value: String(postcodeId), domain: '.salefinder.com.au', path: '/' },
  ]);
  await page.goto(`${SALEFINDER}/${retailer}-catalogue`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  const hrefs = await page.$$eval('a[href*="-catalogue/"]', (els) =>
    els.map((e) => e.getAttribute('href') || '')
  );

  const re = new RegExp('/' + retailer + '-catalogue/([^/]+)/([0-9]+)/', 'i');
  const seen = new Map();
  for (const href of hrefs) {
    const m = href.match(re);
    if (!m) continue;
    const id = m[2];
    if (!seen.has(id)) seen.set(id, { id, name: m[1], href });
  }

  return [...seen.values()].sort(
    (a, b) => rankCatalogue(b.name, state) - rankCatalogue(a.name, state)
  );
}

// ── Step 3: open the viewer and catch the productlist response ──────────────

async function productListHtml(page, catalogue, debugDir) {
  const captured = [];
  const onResponse = async (response) => {
    const url = response.url();
    if (!url.includes('/productlist/view/')) return;
    try {
      captured.push({ url, body: await response.text() });
    } catch {
      // response already consumed or navigation raced it
    }
  };
  page.on('response', onResponse);

  try {
    // rows_per_page is a query param on the embed call. We cannot set it
    // directly — the page builds the URL — so take the default page and follow
    // up with the "Product List" view, which requests a larger page size.
    await page.goto(`${SALEFINDER}${catalogue.href.replace(/\/$/, '')}/catalogue2`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });

    // The viewer opens on the page images. The product list is a separate view
    // and is what triggers the structured request.
    const link = page
      .locator('a, button', { hasText: /product list/i })
      .first();
    if (await link.count()) {
      await link.click({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }

    // Give any lazy pagination a chance to fire.
    for (let i = 0; i < 3 && captured.length === 0; i++) {
      await page.waitForTimeout(2000);
    }
  } finally {
    page.off('response', onResponse);
  }

  if (debugDir && captured.length) {
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(
      path.join(debugDir, `${catalogue.id}.txt`),
      captured.map((c) => c.url + '\n\n' + c.body).join('\n\n===\n\n'),
      'utf8'
    );
  }

  return captured;
}

// ── Step 4: parse the fragment into deals ───────────────────────────────────

/** JSONP → the HTML fragment inside. */
function unwrap(body) {
  const start = body.indexOf('(');
  const end = body.lastIndexOf(')');
  const inner = start !== -1 && end > start ? body.slice(start + 1, end) : body;
  try {
    const parsed = JSON.parse(inner);
    return parsed.content ?? parsed.html ?? '';
  } catch {
    return inner;
  }
}

const money = (s) => {
  const m = String(s || '').match(/\$\s?([0-9]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1]) : null;
};

/**
 * Two markup shapes appear in the wild: the `.sf-item` blocks the old embed
 * API returned, and the `a.item-image[data-itemname]` cards the HTML listing
 * pages use. Handle both rather than betting on one.
 */
function parseDeals(html, { store, state }) {
  const $ = cheerio.load(html);
  const deals = [];
  const push = (d) => {
    if (d.name && d.price != null) deals.push(d);
  };

  $('.sf-item').each((_, el) => {
    const $el = $(el);
    const name =
      $el.find('.sf-item-heading').text().trim() ||
      $el.find('[class*=name]').first().text().trim() ||
      $el.find('h3, h4').first().text().trim();
    const priceText = $el.find('[class*=price]').first().text().trim();
    const optionsText = $el.text();
    const price = money(priceText);
    const save = money((optionsText.match(/save\s*\$[0-9.]+/i) || [])[0]);
    // "$21 per kg", "68¢ per 100g" — the unit price the retailer advertises.
    const unitPrice = (optionsText.match(/\$[0-9.]+\s*(?:per|\/)\s*[0-9]*\s*(?:kg|g|l|ml|each)/i) || [])[0] || null;
    push({
      name,
      price,
      originalPrice: price != null && save != null ? +(price + save).toFixed(2) : null,
      unitPrice,
      store,
      state,
    });
  });

  if (deals.length === 0) {
    $('a.item-image').each((_, el) => {
      const $el = $(el);
      const name = ($el.attr('data-itemname') || '').trim();
      const wrap = $el.parent();
      const price = money(wrap.find('.price').first().text());
      const save = money((wrap.find('.price-options').text().match(/save\s*\$?[0-9.]+/i) || [])[0]);
      push({
        name,
        price,
        originalPrice: price != null && save != null ? +(price + save).toFixed(2) : null,
        unitPrice: null,
        store,
        state,
      });
    });
  }

  return deals;
}

// ── Orchestration ────────────────────────────────────────────────────────────

async function run() {
  const args = parseArgs(process.argv);
  const browser = await chromium.launch({ headless: true });
  const results = {};
  const problems = [];

  try {
    for (const state of args.states) {
      if (!STATE_POSTCODES[state]) {
        problems.push(`unknown state ${state}`);
        continue;
      }

      const { postcodeId, label } = await locationIdForState(state);
      console.log(`\n== ${state.toUpperCase()} — ${label} (postcodeId ${postcodeId})`);

      const stateDeals = [];
      for (const retailer of args.retailers) {
        const context = await browser.newContext({ userAgent: UA });
        const page = await context.newPage();
        try {
          const catalogues = await cataloguesFor(page, retailer, state, postcodeId);
          if (catalogues.length === 0) {
            problems.push(`${state}/${retailer}: no catalogues listed`);
            console.log(`   ${retailer}: no catalogues`);
            continue;
          }

          const chosen = catalogues[0];
          console.log(`   ${retailer}: "${chosen.name}" (${chosen.id})`);

          const captured = await productListHtml(
            page,
            chosen,
            args.debug ? path.join(__dirname, 'debug', state, retailer) : null
          );
          if (captured.length === 0) {
            problems.push(`${state}/${retailer}: no productlist response captured`);
            console.log('      no product data captured');
            continue;
          }

          const deals = captured.flatMap((c) => parseDeals(unwrap(c.body), { store: retailer, state }));
          console.log(`      ${deals.length} deals`);
          if (deals.length === 0) problems.push(`${state}/${retailer}: response captured but parsed 0 deals`);
          stateDeals.push(...deals);
        } catch (err) {
          problems.push(`${state}/${retailer}: ${err.message}`);
          console.log(`      failed: ${err.message}`);
        } finally {
          await context.close();
        }
      }

      results[state] = stateDeals;
      console.log(`   ${state.toUpperCase()} total: ${stateDeals.length}`);
    }
  } finally {
    await browser.close();
  }

  const payload = { fetchedAt: new Date().toISOString(), states: results, problems };

  const outPath = args.out || path.join(__dirname, 'catalogue-deals.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nwrote ${outPath}`);

  if (args.post) {
    for (const [state, deals] of Object.entries(results)) {
      // An empty result must never overwrite a good artifact — that is exactly
      // how 145 Woolworths deals became 4 and got saved.
      if (deals.length === 0) {
        console.log(`skipping ${state}: 0 deals, refusing to overwrite`);
        continue;
      }
      const res = await fetch(args.post, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': args.secret || '' },
        body: JSON.stringify({ state, deals }),
        signal: AbortSignal.timeout(60000),
      });
      console.log(`posted ${state}: HTTP ${res.status} (${deals.length} deals)`);
      if (!res.ok) problems.push(`${state}: ingest returned ${res.status}`);
    }
  }

  if (problems.length) {
    console.log('\nPROBLEMS:');
    problems.forEach((p) => console.log('  - ' + p));
    // Fail the job so the GitHub Actions run goes red and emails you, rather
    // than succeeding quietly with nothing fetched.
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('fetcher failed:', err);
  process.exit(1);
});
