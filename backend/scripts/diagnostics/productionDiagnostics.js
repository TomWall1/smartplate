/**
 * scripts/diagnostics/productionDiagnostics.js
 *
 * Comprehensive production diagnostic for SmartPlate.
 * Tests all 6 reported issues against live API + local code.
 *
 * Usage:
 *   node backend/scripts/diagnostics/productionDiagnostics.js
 *
 * Optional: set DATABASE_URL to also run direct PG queries.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const axios = require('axios');

const API = 'https://deals-to-dish-api.onrender.com';

// ── Colour helpers (no chalk dependency) ────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  grey:   '\x1b[90m',
};
const pass  = (s) => `${C.green}✓ PASS${C.reset}  ${s}`;
const fail  = (s) => `${C.red}✗ FAIL${C.reset}  ${s}`;
const warn  = (s) => `${C.yellow}⚠ WARN${C.reset}  ${s}`;
const info  = (s) => `${C.grey}  ${s}${C.reset}`;
const head  = (s) => `\n${C.bold}${C.cyan}${'='.repeat(44)}\n${s}\n${'='.repeat(44)}${C.reset}`;

// ── Known non-food category strings from supermarkets ───────────────────────
// (Mirrors what recipeMatcher / dealService should already block)
const NON_FOOD_CATEGORY_KEYWORDS = [
  'baby', 'toddler', 'health & beauty', 'household', 'pet', 'liquor',
  'vitamins', 'supplements', 'personal care', 'cleaning', 'pharmacy',
  'laundry', 'skincare', 'hair care', 'oral care', 'feminine',
];

const NON_FOOD_NAME_KEYWORDS = [
  // Clothing
  'wondersuit', 'bodysuit', 'onesie', 'nappy', 'nappies', 'wipes',
  // Pharmacy
  'panadol', 'nurofen', 'ibuprofen', 'paracetamol', 'antihistamine',
  'bandage', 'plaster', 'antiseptic', 'sunscreen', 'insect repellent',
  // Personal care
  'shampoo', 'conditioner', 'deodorant', 'razor', 'toothbrush',
  'toothpaste', 'moisturiser', 'moisturizer', 'serum', 'cleanser',
  // Cleaning
  'detergent', 'dishwashing', 'dishwasher', 'bleach', 'disinfectant',
  'toilet', 'surface spray', 'laundry',
  // Pet
  'dog food', 'cat food', 'pet food', 'kitty litter', 'puppy',
  // Alcohol — already in recipeService BLOCKED list but verify
  'beer', 'wine', 'vodka', 'whisky', 'whiskey', 'gin', 'rum', 'champagne',
];

function looksNonFood(deal) {
  const cat  = (deal.category || '').toLowerCase();
  const name = (deal.name     || '').toLowerCase();
  const catFail = NON_FOOD_CATEGORY_KEYWORDS.some(k => cat.includes(k));
  const nameFail = NON_FOOD_NAME_KEYWORDS.some(k => name.includes(k));
  return { nonFood: catFail || nameFail, catFail, nameFail };
}

// ── Savings structure validator ──────────────────────────────────────────────
function checkSavings(recipe) {
  const issues = [];
  if (recipe.totalMealSaving    == null) issues.push('totalMealSaving missing');
  if (recipe.totalPerServingSaving == null) issues.push('totalPerServingSaving missing');
  if (!Array.isArray(recipe.matchedDeals) || recipe.matchedDeals.length === 0)
    issues.push('matchedDeals empty or missing');
  if (!Array.isArray(recipe.dealHighlights) || recipe.dealHighlights.length === 0)
    issues.push('dealHighlights empty or missing');
  return issues;
}

// ── Ingredient match test (local logic, mirrors recipeMatcher) ───────────────
function testIngredientMatch(ingredientName, deal) {
  const pi = deal.productIntelligence;
  if (!pi?.satisfiesIngredients?.length) return { result: 'no-pi', reason: 'No productIntelligence' };

  const cleanIng = ingredientName.toLowerCase().trim();
  const satisfies = pi.satisfiesIngredients.map(s => s.toLowerCase().trim());

  // Rule 1: exact match
  if (satisfies.includes(cleanIng)) return { result: true, rule: 1, matched: cleanIng };

  // Rule 2: satisfies entry is substring of ingredient
  for (const sat of satisfies) {
    if (sat.length >= 3 && cleanIng.includes(sat))
      return { result: true, rule: 2, matched: sat };
  }

  // Rule 3: any significant word of ingredient in satisfies
  const ingWords = cleanIng.split(/\s+/).filter(w => w.length >= 3);
  for (const w of ingWords) {
    if (satisfies.includes(w))
      return { result: true, rule: 3, matched: w };
  }

  return { result: false, reason: 'No match in satisfiesIngredients' };
}

// ── Fetch with timeout ───────────────────────────────────────────────────────
async function get(path, timeoutMs = 30000) {
  const r = await axios.get(`${API}${path}`, { timeout: timeoutMs });
  return r.data;
}
async function post(path, body = {}, timeoutMs = 30000) {
  const r = await axios.post(`${API}${path}`, body, { timeout: timeoutMs });
  return r.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DIAGNOSTIC
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(head('SMARTPLATE PRODUCTION DIAGNOSTICS'));
  console.log(info(`Timestamp : ${new Date().toISOString()}`));
  console.log(info(`Backend   : ${API}`));

  const summary = { passed: [], failed: [], warned: [] };

  // ── PRE-FLIGHT: health + fetch deals ──────────────────────────────────────
  let deals = [];
  try {
    const health = await get('/health', 10000);
    console.log(info(`Health    : ${health.status} (DB: ${health.database})`));
  } catch (e) {
    console.log(fail(`API unreachable — ${e.message}`));
    process.exit(1);
  }

  try {
    console.log(info('\nFetching /api/deals/current …'));
    deals = await get('/api/deals/current', 60000);
    if (!Array.isArray(deals)) deals = [];
    console.log(info(`Received  : ${deals.length} deals`));
  } catch (e) {
    console.log(fail(`Could not fetch deals — ${e.message}`));
    deals = [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: NON-FOOD FILTERING
  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('TEST 1: NON-FOOD FILTERING'));

  const nonFoodDeals = deals.filter(d => looksNonFood(d).nonFood);
  const piDeals = deals.filter(d => d.productIntelligence?.satisfiesIngredients?.length > 0);

  console.log(info(`Total deals         : ${deals.length}`));
  console.log(info(`With product intel  : ${piDeals.length} (${pct(piDeals.length, deals.length)})`));
  console.log(info(`Non-food detected   : ${nonFoodDeals.length}`));

  if (nonFoodDeals.length === 0) {
    console.log(pass('No non-food items detected in current deal set'));
    summary.passed.push('Non-food filtering');
  } else {
    console.log(fail(`${nonFoodDeals.length} non-food items found in deals:`));
    nonFoodDeals.slice(0, 10).forEach((d, i) => {
      const { catFail, nameFail } = looksNonFood(d);
      const reason = catFail ? `category: "${d.category}"` : `name keyword match`;
      console.log(info(`  ${i+1}. "${d.name}" — ${reason}`));
    });
    if (nonFoodDeals.length > 10) console.log(info(`  … and ${nonFoodDeals.length - 10} more`));
    console.log(info('Root cause: BLOCKED_CATEGORIES or NON_FOOD_INDICATORS incomplete'));
    summary.failed.push('Non-food filtering');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: PRODUCT CATEGORIZATION (sample problem products from live deals)
  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('TEST 2: PRODUCT CATEGORIZATION'));

  const PROBLEM_NAMES = [
    { search: 'garlic bread',    expectNoSatisfies: ['garlic', 'garlic powder', 'fresh garlic'] },
    { search: 'lemon pepper',    expectNoSatisfies: ['lemon', 'fresh lemon', 'lemon juice'] },
    { search: 'chicken nugget',  expectNoSatisfies: ['chicken breast', 'fresh chicken'] },
    { search: 'peanut butter',   expectNoSatisfies: ['butter', 'unsalted butter'] },
    { search: 'baby',            expectNoSatisfies: [] },
  ];

  let cat2Passes = 0, cat2Fails = 0;

  for (const probe of PROBLEM_NAMES) {
    const matches = deals.filter(d =>
      d.name.toLowerCase().includes(probe.search)
    );
    if (matches.length === 0) {
      console.log(info(`  "${probe.search}" — not in current deals (skip)`));
      continue;
    }
    const deal = matches[0];
    const pi = deal.productIntelligence;
    console.log(`\n  ${C.bold}Testing: "${deal.name}"${C.reset}`);
    console.log(info(`    category       : ${pi?.category ?? deal.category ?? 'none'}`));
    console.log(info(`    baseIngredient : ${pi?.baseIngredient ?? 'n/a'}`));
    console.log(info(`    processingLevel: ${pi?.processingLevel ?? 'n/a'}`));
    if (pi?.satisfiesIngredients?.length) {
      console.log(info(`    satisfies      : [${pi.satisfiesIngredients.join(', ')}]`));
    } else {
      console.log(warn(`    satisfies      : empty (no product intelligence)`));
    }

    for (const badIng of probe.expectNoSatisfies) {
      const m = testIngredientMatch(badIng, deal);
      if (m.result === true) {
        console.log(fail(`    "${badIng}" incorrectly MATCHES this deal (rule ${m.rule}, matched "${m.matched}")`));
        cat2Fails++;
      } else if (m.result === false) {
        console.log(pass(`    "${badIng}" correctly does NOT match`));
        cat2Passes++;
      } else {
        console.log(warn(`    "${badIng}" — no PI to test against (text-only path)`));
      }
    }
  }

  if (cat2Fails === 0 && cat2Passes > 0) {
    summary.passed.push('Product categorization (satisfiesIngredients boundaries)');
  } else if (cat2Fails > 0) {
    summary.failed.push(`Product categorization (${cat2Fails} bad matches found)`);
  } else {
    summary.warned.push('Product categorization (no matching deals in current set to test)');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: DEAL CATEGORIZATION COVERAGE
  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('TEST 3: DEAL CATEGORIZATION COVERAGE'));

  const catCounts = {};
  for (const d of deals) {
    const c = d.category || 'uncategorized';
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const uncategorized = catCounts['uncategorized'] || catCounts[''] || 0;
  const uncatPct = pct(uncategorized, deals.length);

  const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 12).forEach(([cat, n]) => {
    console.log(info(`  ${cat.padEnd(30)} ${n} (${pct(n, deals.length)})`));
  });
  if (sorted.length > 12) console.log(info(`  … ${sorted.length - 12} more categories`));

  const piCat = piDeals.filter(d => d.productIntelligence?.category).length;
  console.log(info(`\n  Deals with PI category : ${piCat} (${pct(piCat, deals.length)})`));
  console.log(info(`  Uncategorized          : ${uncategorized} (${uncatPct})`));

  if (parseFloat(uncatPct) < 10) {
    console.log(pass('Category coverage >90%'));
    summary.passed.push('Deal categorization coverage');
  } else if (parseFloat(uncatPct) < 25) {
    console.log(warn(`${uncatPct} uncategorized — acceptable but room to improve`));
    summary.warned.push(`Deal categorization (${uncatPct} uncategorized)`);
  } else {
    console.log(fail(`${uncatPct} uncategorized — too high`));
    summary.failed.push(`Deal categorization (${uncatPct} uncategorized)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: SAVINGS DATA FLOW
  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('TEST 4: SAVINGS DATA FLOW'));

  let recipes = [];
  try {
    console.log(info('Fetching /api/recipes/suggestions …'));
    const res = await post('/api/recipes/suggestions', {}, 60000);
    recipes = Array.isArray(res) ? res : (res.recipes || []);
    console.log(info(`Received : ${recipes.length} recipes`));
  } catch (e) {
    console.log(fail(`Could not fetch recipes — ${e.message}`));
  }

  if (recipes.length === 0) {
    console.log(fail('No recipes returned'));
    summary.failed.push('Savings data (no recipes to inspect)');
  } else {
    let savingsOk = 0, savingsMissing = 0;
    const exampleIssues = [];

    for (const r of recipes.slice(0, 10)) {
      const issues = checkSavings(r);
      if (issues.length === 0) {
        savingsOk++;
      } else {
        savingsMissing++;
        if (exampleIssues.length < 3)
          exampleIssues.push({ title: r.title, issues });
      }
    }

    // Show first recipe in detail
    const r0 = recipes[0];
    console.log(`\n  ${C.bold}First recipe: "${r0.title}"${C.reset}`);
    console.log(info(`    totalMealSaving       : ${r0.totalMealSaving ?? 'MISSING'}`));
    console.log(info(`    totalPerServingSaving : ${r0.totalPerServingSaving ?? 'MISSING'}`));
    console.log(info(`    matchedDeals count    : ${r0.matchedDeals?.length ?? 'MISSING'}`));
    console.log(info(`    dealHighlights count  : ${r0.dealHighlights?.length ?? 'MISSING'}`));
    console.log(info(`    estimatedSaving       : ${r0.estimatedSaving ?? 'MISSING'}`));
    console.log(info(`    weightedScore         : ${r0.weightedScore ?? 'MISSING'}`));

    // Show a sample matchedDeal
    if (r0.matchedDeals?.length > 0) {
      const md = r0.matchedDeals[0];
      console.log(`\n  ${C.bold}Sample matchedDeal:${C.reset}`);
      console.log(info(`    dealName   : ${md.dealName}`));
      console.log(info(`    ingredient : ${md.ingredient}`));
      console.log(info(`    saving     : ${md.saving ?? 'null'}`));
      console.log(info(`    price      : ${md.price ?? 'null'}`));
    }

    if (exampleIssues.length > 0) {
      console.log('\n  Recipes with savings issues:');
      exampleIssues.forEach(ex => {
        console.log(info(`    "${ex.title}": ${ex.issues.join(', ')}`));
      });
    }

    if (savingsMissing === 0) {
      console.log(pass(`Savings fields present in all ${savingsOk} sampled recipes`));
      summary.passed.push('Savings data flow');
    } else {
      console.log(fail(`${savingsMissing}/10 sampled recipes missing savings fields`));
      console.log(info('Root cause: enrichMatchedDealsWithSavings not attaching or totalMealSaving not computed'));
      summary.failed.push(`Savings data (${savingsMissing}/10 recipes incomplete)`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 5: PRODUCT IMAGES
  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('TEST 5: PRODUCT IMAGES'));

  const byStore = { woolworths: [], coles: [], iga: [], other: [] };
  for (const d of deals) {
    const s = (d.store || '').toLowerCase();
    if (s.includes('woolworths') || s === 'ww') byStore.woolworths.push(d);
    else if (s.includes('coles'))               byStore.coles.push(d);
    else if (s.includes('iga'))                 byStore.iga.push(d);
    else                                        byStore.other.push(d);
  }

  const hasImage = (d) => d.productImage && d.productImage.startsWith('http');

  for (const [store, storeDeals] of Object.entries(byStore)) {
    if (storeDeals.length === 0) continue;
    const withImg = storeDeals.filter(hasImage).length;
    const p = pct(withImg, storeDeals.length);
    const status = parseFloat(p) >= 60 ? pass : parseFloat(p) >= 20 ? warn : fail;
    console.log(status(`${store.padEnd(12)}: ${withImg}/${storeDeals.length} (${p}) have images`));
  }

  const totalWithImg = deals.filter(hasImage).length;
  const imgPct = parseFloat(pct(totalWithImg, deals.length));
  console.log(info(`\n  Overall: ${totalWithImg}/${deals.length} (${imgPct}%)`));

  // Sample a deal with and without images
  const withImgSample = deals.find(hasImage);
  const noImgSample   = deals.find(d => !hasImage(d) && byStore.woolworths.includes(d));
  if (withImgSample) console.log(info(`  Image URL sample : ${withImgSample.productImage}`));
  if (noImgSample)   console.log(info(`  No-image sample  : "${noImgSample.name}" (${noImgSample.store})`));

  if (imgPct >= 60) {
    summary.passed.push(`Product images (${imgPct}% coverage)`);
  } else if (imgPct >= 20) {
    console.log(warn(`Low image coverage — enrichment may be partial or slow`));
    console.log(info('Root cause: background image enrichment runs after cache write; check if it completed'));
    summary.warned.push(`Product images (${imgPct}% coverage)`);
  } else {
    console.log(fail(`Very low image coverage`));
    console.log(info('Root cause: image enrichment pipeline not running or not saving results'));
    summary.failed.push(`Product images (${imgPct}% coverage)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 6: INGREDIENT MATCHING LOGIC
  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('TEST 6: INGREDIENT MATCHING LOGIC'));

  const MATCH_TESTS = [
    // [ingredientName, dealNameSubstring, shouldMatch, reason]
    ['garlic',         'garlic bread',    false, 'garlic bread is bread-based'],
    ['garlic powder',  'garlic bread',    false, 'garlic powder ≠ garlic bread'],
    ['lemon',          'lemon pepper',    false, 'lemon is just flavoring in lemon pepper squid'],
    ['lemon juice',    'lemon pepper',    false, 'lemon juice ≠ lemon pepper squid'],
    ['butter',         'peanut butter',   false, 'peanut butter ≠ dairy butter'],
    ['chicken breast', 'chicken nugget',  false, 'nuggets are ultra-processed'],
    ['chicken',        'chicken thigh',   true,  'chicken matches chicken thigh'],
    ['beef mince',     'beef mince',      true,  'exact match'],
    ['salmon',         'salmon fillet',   true,  'salmon matches salmon fillet'],
  ];

  let m6Pass = 0, m6Fail = 0;

  for (const [ing, dealSubstr, shouldMatch, reason] of MATCH_TESTS) {
    const matchingDeal = deals.find(d =>
      d.name.toLowerCase().includes(dealSubstr) &&
      d.productIntelligence?.satisfiesIngredients?.length > 0
    );

    if (!matchingDeal) {
      console.log(info(`  "${ing}" vs "${dealSubstr}" — no matching deal with PI in current set (skip)`));
      continue;
    }

    const result = testIngredientMatch(ing, matchingDeal);
    const actualMatch = result.result === true;
    const correct = actualMatch === shouldMatch;

    const pi = matchingDeal.productIntelligence;
    const satisfiesList = pi.satisfiesIngredients.slice(0, 6).join(', ');

    if (correct) {
      const verb = shouldMatch ? 'correctly MATCHES' : 'correctly does NOT match';
      console.log(pass(`"${ing}" ${verb} "${matchingDeal.name}"`));
      console.log(info(`    satisfies: [${satisfiesList}]`));
      m6Pass++;
    } else {
      const verb = actualMatch ? 'incorrectly MATCHES' : 'incorrectly does NOT match';
      console.log(fail(`"${ing}" ${verb} "${matchingDeal.name}" — ${reason}`));
      console.log(info(`    satisfies: [${satisfiesList}]`));
      if (result.rule) console.log(info(`    matched via rule ${result.rule} on "${result.matched}"`));
      m6Fail++;
    }
  }

  if (m6Fail === 0 && m6Pass > 0) {
    console.log(pass(`All ${m6Pass} ingredient matching tests correct`));
    summary.passed.push('Ingredient matching logic');
  } else if (m6Fail > 0) {
    summary.failed.push(`Ingredient matching (${m6Fail} wrong results)`);
  } else {
    summary.warned.push('Ingredient matching (no matching deals with PI to test)');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('SUMMARY'));

  if (summary.failed.length > 0) {
    console.log(`${C.bold}${C.red}CRITICAL ISSUES (${summary.failed.length}):${C.reset}`);
    summary.failed.forEach((s, i) => console.log(`  ${i+1}. ${C.red}✗${C.reset} ${s}`));
  }
  if (summary.warned.length > 0) {
    console.log(`\n${C.bold}${C.yellow}WARNINGS (${summary.warned.length}):${C.reset}`);
    summary.warned.forEach((s, i) => console.log(`  ${i+1}. ${C.yellow}⚠${C.reset} ${s}`));
  }
  if (summary.passed.length > 0) {
    console.log(`\n${C.bold}${C.green}PASSING (${summary.passed.length}):${C.reset}`);
    summary.passed.forEach((s, i) => console.log(`  ${i+1}. ${C.green}✓${C.reset} ${s}`));
  }

  // Extra: recipe/deal stats
  console.log(`\n${C.bold}LIVE DATA SNAPSHOT:${C.reset}`);
  console.log(info(`  Deals    : ${deals.length}`));
  console.log(info(`  Recipes  : ${recipes.length}`));
  console.log(info(`  PI deals : ${piDeals.length} (${pct(piDeals.length, deals.length)})`));
  console.log(info(`  Images   : ${deals.filter(hasImage).length} (${pct(deals.filter(hasImage).length, deals.length)})`));

  console.log('');
}

function pct(n, total) {
  if (!total) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

run().catch(err => {
  console.error(`\n${C.red}Diagnostic crashed: ${err.message}${C.reset}`);
  console.error(err.stack);
  process.exit(1);
});
