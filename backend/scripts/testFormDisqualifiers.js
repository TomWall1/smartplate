/**
 * testFormDisqualifiers.js
 *
 * Tests the FORM_DISQUALIFIERS feature in recipeMatcher.js.
 *
 * Runs _termsMatch() pairs directly to show:
 *   • Deals now correctly rejected per protein category
 *   • Legitimate fresh protein deals still matching
 *
 * If cached-deals.json exists, also runs the full matchDeals() pipeline and
 * compares recipe counts before/after (using a patched "no-disqualifier" build).
 *
 * Usage:
 *   node backend/scripts/testFormDisqualifiers.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Direct unit tests against _termsMatch ─────────────────────────────────

// We need access to private methods, so we rebuild a minimal version here
// rather than monkey-patching the singleton.

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'can', 'jar', 'tin', 'box',
  'bag', 'bottle', 'pouch', 'frozen', 'chilled', 'dried', 'canned',
  'sliced', 'diced', 'chopped', 'whole', 'half', 'large', 'small',
  'medium', 'mini', 'extra', 'super', 'classic', 'original', 'plain',
  'natural', 'style', 'range', 'family', 'serve', 'serving', 'per',
  'new', 'old', 'big', 'little', 'more', 'less', 'just', 'also',
  'use', 'about', 'like', 'soft', 'hard', 'fine', 'thin', 'thick',
  'water',
]);

const COMPOUND_BLOCKLIST = {
  cream:  ['ice cream', 'ice-cream'],
  butter: ['peanut butter', 'nut butter', 'almond butter'],
  milk:   ['oat milk', 'almond milk', 'soy milk', 'coconut milk', 'skim milk', 'rice milk'],
};

const FORM_DISQUALIFIERS = {
  chicken: [
    'crumbed', 'nugget', 'tender', 'strip', 'schnitzel', 'kiev', 'stuffed',
    'marinated', 'pre-seasoned', 'ready to cook', 'frozen meal',
    'roast', 'rotisserie', 'canned', 'tinned', 'processed', 'deli',
    'smoked', 'chargrilled', 'skewer', 'wing', 'drumstick',
  ],
  beef: [
    'burger', 'patty', 'meatball', 'sausage', 'hotdog', 'frank',
    'canned', 'tinned', 'corned', 'jerky', 'biltong', 'deli', 'smoked',
    'pastrami', 'salami', 'pepperoni', 'pre-made', 'frozen meal',
    'ready to cook', 'marinated', 'pre-seasoned',
  ],
  pork: [
    'bacon', 'ham', 'salami', 'pepperoni', 'chorizo', 'prosciutto', 'pancetta',
    'sausage', 'hotdog', 'frank', 'canned', 'tinned', 'deli', 'smoked',
    'pulled', 'crackling', 'marinated', 'pre-seasoned', 'frozen meal',
  ],
  lamb: [
    'sausage', 'deli', 'marinated', 'pre-seasoned', 'frozen meal',
    'ready to cook', 'canned', 'tinned',
  ],
  salmon: [
    'smoked', 'canned', 'tinned', 'flavoured', 'flavored', 'marinated',
    'pre-seasoned', 'frozen meal', 'crumbed', 'sashimi', 'gravlax', 'dip',
  ],
  fish: [
    'crumbed', 'battered', 'frozen meal', 'fish finger', 'fish cake',
    'fish pie', 'canned', 'tinned', 'smoked', 'dip', 'paste',
  ],
  prawn: [
    'cooked', 'marinated', 'flavoured', 'flavored', 'frozen meal',
    'prawn toast', 'prawn cracker', 'paste',
  ],
  tuna:  ['canned', 'tinned', 'flavoured', 'flavored', 'marinated', 'dip', 'paste', 'smoked'],
  mince: [
    'sausage', 'burger', 'patty', 'meatball', 'pre-seasoned', 'marinated',
    'frozen meal', 'ready to cook',
  ],
};

function singularise(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

function cleanIngredient(name) {
  return name
    .replace(/\([^)]*\)/g, '')
    .replace(/,.*$/, '')
    .replace(/\s*[-–—]\s.*$/, '')
    .replace(/[^a-z\s]/gi, ' ')
    .replace(/\b(or|and|for|of|the|with|to|in|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasFormDisqualifier(proteinKey, dealStr, ingStr) {
  const dqs = FORM_DISQUALIFIERS[proteinKey];
  if (!dqs) return false;
  // Word-level singularised sets — handles plurals and prevents "strip" matching "striploin"
  const dealWords = new Set(dealStr.split(/\s+/).map(singularise));
  const ingWords  = new Set(ingStr.split(/\s+/).map(singularise));
  for (const dq of dqs) {
    const isPhrase = dq.includes(' ');
    let foundInDeal, foundInIng;
    if (isPhrase) {
      foundInDeal = dealStr.includes(dq);
      foundInIng  = ingStr.includes(dq);
    } else {
      const dqSingular = singularise(dq);
      foundInDeal = dealWords.has(dqSingular);
      foundInIng  = ingWords.has(dqSingular);
    }
    if (foundInDeal && !foundInIng) return true;
  }
  return false;
}

function termsMatchOLD(ingredientName, dealKeyword) {
  const ing  = cleanIngredient(ingredientName);
  const deal = dealKeyword.toLowerCase();
  if (ing.length < 3) return false;
  const ingWords  = ing.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  const dealWords = deal.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (!ingWords.length || !dealWords.length) return false;
  const singularDealWords = dealWords.map(singularise);
  for (const iw of ingWords) {
    const blockedPhrases = COMPOUND_BLOCKLIST[iw] || [];
    if (blockedPhrases.some(p => deal.includes(p))) return false;
  }
  for (const iw of ingWords) {
    const iws = singularise(iw);
    const found = singularDealWords.some(dw => {
      if (dw === iws) return true;
      if (dw.length >= 7 && iws.length >= 7) return dw.includes(iws) || iws.includes(dw);
      return false;
    });
    if (!found) return false;
  }
  return true;
}

function termsMatchNEW(ingredientName, dealKeyword) {
  const ing  = cleanIngredient(ingredientName);
  const deal = dealKeyword.toLowerCase();
  if (ing.length < 3) return false;
  const ingWords  = ing.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  const dealWords = deal.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (!ingWords.length || !dealWords.length) return false;
  const singularDealWords = dealWords.map(singularise);
  for (const iw of ingWords) {
    const blockedPhrases = COMPOUND_BLOCKLIST[iw] || [];
    if (blockedPhrases.some(p => deal.includes(p))) return false;
  }
  for (const iw of ingWords) {
    const iws = singularise(iw);
    const found = singularDealWords.some(dw => {
      if (dw === iws) return true;
      if (dw.length >= 7 && iws.length >= 7) return dw.includes(iws) || iws.includes(dw);
      return false;
    });
    if (!found) return false;
  }
  // Form disqualifier check (NEW)
  for (const iw of ingWords) {
    const iws = singularise(iw);
    if (FORM_DISQUALIFIERS[iws] && hasFormDisqualifier(iws, deal, ing)) return false;
  }
  return true;
}

// ── Test cases ─────────────────────────────────────────────────────────────

const cases = [
  // ── CHICKEN — should now be REJECTED ──────────────────────────────────
  { protein: 'chicken', ingredient: 'chicken',        deal: 'frozen crumbed chicken tenders',       expect: 'REJECT' },
  { protein: 'chicken', ingredient: 'chicken',        deal: 'ingham chicken nuggets',                expect: 'REJECT' },
  { protein: 'chicken', ingredient: 'chicken',        deal: 'woolworths chicken strips',             expect: 'REJECT' },
  { protein: 'chicken', ingredient: 'chicken fillet', deal: 'ingham chicken kiev',                   expect: 'REJECT' },
  { protein: 'chicken', ingredient: 'chicken',        deal: 'coles rotisserie chicken',              expect: 'REJECT' },
  { protein: 'chicken', ingredient: 'chicken',        deal: 'woolworths chargrilled chicken',        expect: 'REJECT' },
  { protein: 'chicken', ingredient: 'chicken thigh',  deal: 'marinated chicken thigh skewers',      expect: 'REJECT' },
  { protein: 'chicken', ingredient: 'chicken',        deal: 'smoked deli chicken',                  expect: 'REJECT' },
  // ── CHICKEN — should still MATCH ──────────────────────────────────────
  { protein: 'chicken', ingredient: 'chicken',        deal: 'woolworths rspca chicken thigh',       expect: 'MATCH'  },
  { protein: 'chicken', ingredient: 'chicken breast', deal: 'coles chicken breast fillet',          expect: 'MATCH'  },
  { protein: 'chicken', ingredient: 'chicken thigh',  deal: 'woolworths chicken thighs',            expect: 'MATCH'  },
  { protein: 'chicken', ingredient: 'chicken wings',  deal: 'chicken wings',                        expect: 'MATCH'  }, // form upgrade
  { protein: 'chicken', ingredient: 'chicken schnitzel', deal: 'woolworths chicken schnitzel',      expect: 'MATCH'  }, // form upgrade
  { protein: 'chicken', ingredient: 'chicken drumstick', deal: 'chicken drumsticks',                expect: 'MATCH'  }, // form upgrade
  // ── BEEF — should now be REJECTED ─────────────────────────────────────
  { protein: 'beef',    ingredient: 'beef',           deal: 'woolworths beef burger patties',       expect: 'REJECT' },
  { protein: 'beef',    ingredient: 'beef',           deal: 'woolworths beef meatballs',            expect: 'REJECT' },
  { protein: 'beef',    ingredient: 'beef',           deal: 'primo beef salami',                    expect: 'REJECT' },
  { protein: 'beef',    ingredient: 'beef',           deal: 'jack links beef jerky',                expect: 'REJECT' },
  { protein: 'beef',    ingredient: 'beef',           deal: 'corned beef silverside',               expect: 'REJECT' },
  // ── BEEF — should still MATCH ─────────────────────────────────────────
  { protein: 'beef',    ingredient: 'beef',           deal: 'coles beef mince',                     expect: 'MATCH'  },
  { protein: 'beef',    ingredient: 'beef steak',     deal: 'woolworths beef rump steak',           expect: 'MATCH'  },
  { protein: 'beef',    ingredient: 'beef',           deal: 'woolworths beef striploin',            expect: 'MATCH'  }, // "strip" must NOT block "striploin"
  { protein: 'beef',    ingredient: 'beef mince',     deal: 'coles beef mince',                     expect: 'MATCH'  },
  // ── PORK — should now be REJECTED ─────────────────────────────────────
  { protein: 'pork',    ingredient: 'pork',           deal: 'primo pork salami',                    expect: 'REJECT' },
  { protein: 'pork',    ingredient: 'pork',           deal: 'woolworths pulled pork',               expect: 'REJECT' },
  { protein: 'pork',    ingredient: 'pork',           deal: 'smoked pork deli',                     expect: 'REJECT' },
  // ── PORK — form upgrades ──────────────────────────────────────────────
  { protein: 'pork',    ingredient: 'bacon',          deal: 'primo bacon',                          expect: 'MATCH'  }, // bacon ingredient → bacon deal allowed
  { protein: 'pork',    ingredient: 'pork belly',     deal: 'woolworths pork belly',                expect: 'MATCH'  },
  { protein: 'pork',    ingredient: 'pork',           deal: 'woolworths pork loin',                 expect: 'MATCH'  },
  // ── SALMON — should now be REJECTED ───────────────────────────────────
  { protein: 'salmon',  ingredient: 'salmon',         deal: 'tassal smoked salmon',                 expect: 'REJECT' },
  { protein: 'salmon',  ingredient: 'salmon',         deal: 'john west canned salmon',              expect: 'REJECT' },
  { protein: 'salmon',  ingredient: 'salmon',         deal: 'crumbed salmon pieces',                expect: 'REJECT' },
  { protein: 'salmon',  ingredient: 'salmon',         deal: 'flavoured salmon fillet',              expect: 'REJECT' },
  // ── SALMON — form upgrades ────────────────────────────────────────────
  { protein: 'salmon',  ingredient: 'salmon',         deal: 'coles salmon fillet',                  expect: 'MATCH'  },
  { protein: 'salmon',  ingredient: 'salmon',         deal: 'woolworths atlantic salmon',           expect: 'MATCH'  },
  { protein: 'salmon',  ingredient: 'smoked salmon',  deal: 'tassal smoked salmon',                 expect: 'MATCH'  }, // form upgrade
  // ── FISH — should now be REJECTED ─────────────────────────────────────
  { protein: 'fish',    ingredient: 'fish',           deal: 'birds eye crumbed fish',               expect: 'REJECT' },
  { protein: 'fish',    ingredient: 'fish',           deal: 'frozen battered fish pieces',          expect: 'REJECT' },
  { protein: 'fish',    ingredient: 'fish',           deal: 'gortons fish fingers',                 expect: 'REJECT' },
  // ── FISH — should still MATCH ─────────────────────────────────────────
  { protein: 'fish',    ingredient: 'fish fillet',    deal: 'barramundi fish fillet',               expect: 'MATCH'  },
  // ── PRAWN — should now be REJECTED ────────────────────────────────────
  { protein: 'prawn',   ingredient: 'prawn',          deal: 'cooked tiger prawns',                  expect: 'REJECT' },
  { protein: 'prawn',   ingredient: 'prawn',          deal: 'marinated garlic prawns',              expect: 'REJECT' },
  // ── PRAWN — should still MATCH ────────────────────────────────────────
  { protein: 'prawn',   ingredient: 'prawn',          deal: 'woolworths raw prawn',                 expect: 'MATCH'  },
  // ── TUNA — should now be REJECTED ─────────────────────────────────────
  // "john west tuna in springwater" doesn't say "canned" or "tinned" in the name —
  // name-based filtering can't detect it, so this correctly passes through.
  { protein: 'tuna',    ingredient: 'tuna',           deal: 'john west tuna in springwater',        expect: 'MATCH'  },
  { protein: 'tuna',    ingredient: 'tuna',           deal: 'sirena tuna flavoured',                expect: 'REJECT' },
  // ── TUNA — fresh fillet still matches ────────────────────────────────
  { protein: 'tuna',    ingredient: 'tuna steak',     deal: 'fresh tuna steak',                     expect: 'MATCH'  },
  // ── MINCE — should now be REJECTED ────────────────────────────────────
  { protein: 'mince',   ingredient: 'mince',          deal: 'woolworths beef meatballs',            expect: 'REJECT' },
  { protein: 'mince',   ingredient: 'mince',          deal: 'pre-seasoned mince patties',           expect: 'REJECT' },
  // ── MINCE — should still MATCH ────────────────────────────────────────
  { protein: 'mince',   ingredient: 'mince',          deal: 'coles beef mince',                     expect: 'MATCH'  },
  { protein: 'mince',   ingredient: 'lamb mince',     deal: 'woolworths lamb mince',                expect: 'MATCH'  },
];

// ── Run tests ──────────────────────────────────────────────────────────────

console.log('\n' + '━'.repeat(72));
console.log('Form disqualifier test — ingredient × deal pair results');
console.log('━'.repeat(72));

let pass = 0, fail = 0;
const byProtein = {};

for (const tc of cases) {
  const oldResult = termsMatchOLD(tc.ingredient, tc.deal) ? 'MATCH' : 'REJECT';
  const newResult = termsMatchNEW(tc.ingredient, tc.deal) ? 'MATCH' : 'REJECT';
  const correct   = newResult === tc.expect;
  const changed   = oldResult !== newResult;

  if (!byProtein[tc.protein]) byProtein[tc.protein] = [];
  byProtein[tc.protein].push({ ...tc, oldResult, newResult, correct, changed });

  if (correct) pass++; else fail++;
}

for (const [protein, results] of Object.entries(byProtein)) {
  console.log(`\n  ${protein.toUpperCase()}`);
  for (const r of results) {
    const status  = r.correct ? '✓' : '✗';
    const change  = r.changed ? ` (was ${r.oldResult})` : '';
    const outcome = r.newResult === 'REJECT' ? 'REJECTED' : 'MATCHED ';
    console.log(`    ${status} ${outcome}${change.padEnd(14)}  ing="${r.ingredient}"  deal="${r.deal}"`);
  }
}

console.log('\n' + '━'.repeat(72));
console.log(`Results: ${pass} passed, ${fail} failed out of ${cases.length} cases`);
if (fail > 0) console.log('  ← Review failed cases above and adjust FORM_DISQUALIFIERS or test expectations.');
console.log('━'.repeat(72));

// ── Full pipeline test against cached deals (if available) ────────────────

const CACHE_PATH = path.join(__dirname, '..', 'data', 'cached-deals.json');

if (!fs.existsSync(CACHE_PATH)) {
  console.log('\nNo cached-deals.json found — skipping full pipeline comparison.\n');
  process.exit(fail > 0 ? 1 : 0);
}

console.log('\nRunning full matchDeals() pipeline against cached deals...\n');

// To get a before/after recipe count we need to temporarily disable the form
// disqualifier check. We do this by patching the prototype after requiring.
const matcherModule = require('../services/recipeMatcher');

// Patch: backup real _hasFormDisqualifier, replace with no-op for "before" run
const realHFD = matcherModule._hasFormDisqualifier.bind(matcherModule);
matcherModule._hasFormDisqualifier = () => false; // disable
matcherModule.library = null;                      // reset cache

const cache     = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
const allDeals  = [...cache.woolworths, ...cache.coles, ...cache.iga];

const beforeRecipes = matcherModule.matchDeals(allDeals);
const beforeCount   = beforeRecipes.length;

// Show sample of deals that would have passed (by checking _termsMatch with old logic)
console.log(`BEFORE (no form disqualifier): ${beforeCount} qualifying recipes`);

// Restore and re-run
matcherModule._hasFormDisqualifier = realHFD;
matcherModule.library = null;

const afterRecipes = matcherModule.matchDeals(allDeals);
const afterCount   = afterRecipes.length;

console.log(`AFTER  (with form disqualifier): ${afterCount} qualifying recipes`);
console.log(`Difference: ${beforeCount - afterCount} recipes removed (had only pre-prepared protein matches)\n`);

// Show top 5 after recipes to confirm fresh protein deals still qualify
console.log('Top 5 qualifying recipes (with matched protein deal):');
afterRecipes.slice(0, 5).forEach((r, i) => {
  const protein = r.matchedDeals.find(d =>
    ['chicken','beef','lamb','pork','salmon','fish','prawn','tuna','mince',
     'steak','fillet','thigh','breast','drumstick'].some(p => d.ingredient.includes(p))
  );
  const proteinLabel = protein ? `${protein.ingredient} → "${protein.dealName}"` : '(no protein deal shown)';
  console.log(`  ${i + 1}. ${r.title} [score:${r.matchScore}] — ${proteinLabel}`);
});

console.log('');
