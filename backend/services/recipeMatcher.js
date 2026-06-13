const fs = require('fs');
const { validateMatch, isAboveThreshold } = require('./matchingValidator');
const { quantityRelevanceScore } = require('./quantityParser');
const { parseDealSize } = require('./savingsCalculator');
const { normalizeName } = require('../lib/normalize');

// ── Ingredient blocklist (DB-backed negative match cache) ────────────────────
// Loaded once per process; refreshed on matchDeals() if stale.
let _blocklist = null;
let _blocklistLoadedAt = 0;
const BLOCKLIST_TTL = 30 * 60 * 1000; // 30 minutes

async function loadBlocklist() {
  if (_blocklist && Date.now() - _blocklistLoadedAt < BLOCKLIST_TTL) return _blocklist;
  try {
    const db = require('../database/db');
    const pool = db.getDb();
    // Support both pg (pool.query) and sqlite (prepare)
    if (typeof pool.query === 'function') {
      const { rows } = await pool.query('SELECT ingredient_pattern, blocked_product_patterns FROM ingredient_blocklist');
      _blocklist = rows;
    } else {
      // SQLite — table may not exist locally
      try {
        _blocklist = pool.prepare('SELECT ingredient_pattern, blocked_product_patterns FROM ingredient_blocklist').all();
        _blocklist = _blocklist.map(r => ({
          ...r,
          blocked_product_patterns: typeof r.blocked_product_patterns === 'string'
            ? JSON.parse(r.blocked_product_patterns) : r.blocked_product_patterns,
        }));
      } catch {
        _blocklist = [];
      }
    }
    _blocklistLoadedAt = Date.now();
  } catch {
    _blocklist = [];
  }
  return _blocklist;
}

/**
 * Check if an ingredient + deal name is blocklisted.
 * @param {string} ingredientName - Cleaned ingredient name
 * @param {string} dealName       - Raw deal name
 */
function isBlocklisted(ingredientName, dealName) {
  if (!_blocklist || _blocklist.length === 0) return false;
  const ingLower  = ingredientName.toLowerCase();
  const dealLower = dealName.toLowerCase();
  for (const rule of _blocklist) {
    if (ingLower.includes(rule.ingredient_pattern)) {
      const patterns = rule.blocked_product_patterns || [];
      if (patterns.length === 0) return true; // blanket block on this ingredient
      if (patterns.some(p => dealLower.includes(p))) return true;
    }
  }
  return false;
}

// ── Matching configuration ──────────────────────────────────────────────────
// All tuning data (weights, blocklists, keyword lists, form disqualifiers)
// lives in config/matching.js so it can be reviewed and adjusted without
// touching the algorithm below.
const {
  USE_PRODUCT_INTELLIGENCE,
  CATEGORY_WEIGHTS,
  DIVERSITY_DECAY,
  MIN_PER_BUCKET,
  PROTEIN_BUCKETS,
  LIBRARIES,
  FOOD_KEYWORDS,
  NON_FOOD_INDICATORS,
  COMPOUND_NON_FOOD_PHRASES,
  BLOCKED_CATEGORIES,
  COMPOUND_BLOCKLIST,
  PROTEIN_CUT_WORDS,
  SPECIFIC_CHEESE_TYPES,
  FORM_DISQUALIFIERS,
  PROTEIN_KEYWORDS,
  PROTEIN_COMPOUND_DISQUALIFIERS,
  STOP_WORDS,
} = require('../config/matching');

class RecipeMatcher {
  constructor() {
    this.library = null;
  }

  /**
   * Drop the cached recipe library so the next matchDeals() reloads from disk.
   * Note: the library is loaded from the JSON files in data/ — admin recipe
   * edits write to the Postgres `recipes` table, which is NOT read here.
   */
  invalidateLibrary() {
    this.library = null;
  }

  /**
   * Load recipe library from both source files and merge into a single array.
   * Each recipe gets a `source` field ('recipetineats' or 'jamieoliver') so
   * we can tell them apart. IDs are reassigned globally after merging.
   */
  loadLibrary() {
    if (this.library) return this.library;

    const allRecipes = [];

    // Per-publisher kill switch: EXCLUDED_RECIPE_SOURCES="donnahay,jamieoliver"
    // removes a source from matching AND serving entirely (good-faith response
    // if a publisher objects to inclusion). Takes effect on next generation.
    const excludedSources = new Set(
      (process.env.EXCLUDED_RECIPE_SOURCES || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    );

    for (const lib of LIBRARIES) {
      if (excludedSources.has(lib.source.toLowerCase())) {
        console.warn(`RecipeMatcher: source "${lib.source}" EXCLUDED via EXCLUDED_RECIPE_SOURCES`);
        continue;
      }
      // Prefer enriched file if it exists; fall back to original
      const filePath = fs.existsSync(lib.enriched) ? lib.enriched : lib.src;
      const isEnriched = filePath === lib.enriched;
      try {
        const data    = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const recipes = (data.recipes || []).map(r => ({ ...r, source: lib.source }));
        allRecipes.push(...recipes);
        console.log(`RecipeMatcher: Loaded ${recipes.length} recipes from ${lib.source}${isEnriched ? ' (enriched)' : ''}`);
      } catch (err) {
        if (filePath === lib.src) {
          // Main file missing — warn
          console.warn(`RecipeMatcher: Could not load ${lib.source}: ${err.message}`);
        }
        // Enriched file missing — silently skip (expected before enrichment run)
      }
    }

    // Exclude recipes marked inactive (is_active: false)
    const active = allRecipes.filter(r => r.is_active !== false);
    if (active.length < allRecipes.length) {
      console.log(`RecipeMatcher: Filtered ${allRecipes.length - active.length} inactive recipes`);
    }

    // Reassign sequential IDs across the merged library
    this.library = active.map((r, i) => ({ ...r, id: i + 1 }));
    console.log(`RecipeMatcher: Combined library: ${this.library.length} recipes`);
    return this.library;
  }

  /**
   * Clean an ingredient name from the scraped library
   */
  _cleanIngredientName(name) {
    if (!name) return '';
    let clean = name
      .replace(/\([^)]*\)/g, '')          // remove parentheticals
      .replace(/,.*$/, '')                 // remove everything after first comma
      .replace(/\s*[-–—]\s.*$/, '')        // remove " - description" suffixes
      .replace(/[^a-z\s]/gi, ' ')          // remove non-alpha chars
      .replace(/\b(or|and|for|of|the|with|to|in|a|an)\b/gi, ' ')  // remove conjunctions
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return clean;
  }

  /**
   * Normalise a deal name to extract the core ingredient
   * e.g. "Woolworths RSPCA Chicken Thighs 1kg" → "chicken thighs"
   * Delegates to the shared normalizer so matching and DB enrichment
   * can never drift apart.
   */
  normalizeDealName(name) {
    return normalizeName(name);
  }

  /**
   * Check if a deal looks like a food product.
   * @param {string} dealKeywords - Normalised deal name
   * @param {string} [category]   - Mapped app category (e.g. 'Baby', 'Dairy')
   */
  _isFoodDeal(dealKeywords, category) {
    // 1. Hard-block by category
    if (category && BLOCKED_CATEGORIES.has(category)) return false;

    const lower = dealKeywords.toLowerCase();

    // 2. Compound phrase block (food word + non-food modifier)
    if (COMPOUND_NON_FOOD_PHRASES.some(phrase => lower.includes(phrase))) return false;

    // 3. Individual non-food indicator block
    if (NON_FOOD_INDICATORS.some(kw => lower.includes(kw))) return false;

    // 4. Must contain at least one recognisable food keyword
    return FOOD_KEYWORDS.some(kw => lower.includes(kw));
  }

  /**
   * Check whether a deal is disqualified by form for a given protein.
   *
   * Returns true  → deal should be REJECTED for this protein.
   * Returns false → no disqualifying form found; match is fine.
   *
   * Form upgrade: if the recipe ingredient itself names the disqualifying form
   * (e.g. ingredient = "chicken schnitzel" and dq = "schnitzel"), the match is
   * allowed through because the recipe explicitly calls for that prepared form.
   *
   * @param {string} proteinKey - Key into FORM_DISQUALIFIERS (e.g. 'chicken')
   * @param {string} dealStr    - Lowercased normalised deal keyword string
   * @param {string} ingStr     - Lowercased cleaned ingredient string
   */
  _hasFormDisqualifier(proteinKey, dealStr, ingStr) {
    const disqualifiers = FORM_DISQUALIFIERS[proteinKey];
    if (!disqualifiers) return false;

    // Pre-singularise deal and ingredient words once for efficient lookup.
    // Word-level comparison naturally prevents "strip" from matching "striploin"
    // (they are different tokens) and handles plurals ("nuggets" → "nugget").
    const dealWords = new Set(dealStr.split(/\s+/).map(w => this._singularise(w)));
    const ingWords  = new Set(ingStr.split(/\s+/).map(w => this._singularise(w)));

    for (const dq of disqualifiers) {
      const isPhrase = dq.includes(' ');
      let foundInDeal, foundInIng;

      if (isPhrase) {
        // Multi-word phrases: substring match on the full string (specific enough).
        foundInDeal = dealStr.includes(dq);
        foundInIng  = ingStr.includes(dq);
      } else {
        // Single words: compare against the singularised word sets.
        const dqSingular = this._singularise(dq);
        foundInDeal = dealWords.has(dqSingular);
        foundInIng  = ingWords.has(dqSingular);
      }

      if (foundInDeal && !foundInIng) {
        return true; // disqualified — wrong form for this recipe
      }
    }
    return false;
  }

  /**
   * Simple singularise: strip trailing "s" where appropriate
   */
  _singularise(word) {
    if (word.length <= 3) return word;
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
    return word;
  }

  // ── Product intelligence matching ──────────────────────────────────────────

  /**
   * Match a recipe ingredient against an enriched deal using product intelligence.
   *
   * Returns:
   *   true  — PI confirms a match
   *   false — PI confirms NO match (skip text fallback for this pair)
   *   null  — No PI data available; caller should fall back to text matching
   */
  _ingredientMatchesDeal(ingredientName, enrichedDeal) {
    const pi = enrichedDeal.productIntelligence;
    if (!pi?.satisfiesIngredients?.length) return null; // signal: use text fallback

    const cleanIng = this._cleanIngredientName(ingredientName);
    if (cleanIng.length < 2) return false;

    const ingWords  = cleanIng.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    if (ingWords.length === 0) return false;

    const satisfies = pi.satisfiesIngredients.map(s => s.toLowerCase().trim());

    // Category guard: baked_goods deals (garlic bread, crumpets, etc.) only match recipe
    // ingredients that are themselves baked goods. Prevents "garlic bread" from satisfying
    // a recipe that simply calls for "garlic".
    if (pi.category === 'baked_goods') {
      const BAKED_GOOD_WORDS = new Set([
        'bread', 'loaf', 'roll', 'bun', 'muffin', 'bagel', 'wrap',
        'tortilla', 'croissant', 'pita', 'naan', 'flatbread', 'crumpet',
        'scone', 'focaccia', 'sourdough', 'rye', 'brioche',
      ]);
      if (!ingWords.some(w => BAKED_GOOD_WORDS.has(w))) return false;
    }

    // If the ingredient is a compound with a disqualifying context word (sauce, stock,
    // oil, butter, paste, etc.) require a full exact phrase match.
    // Prevents "fish" (in satisfies for salmon) matching recipe ingredient "fish sauce".
    const hasDisqualifier = ingWords.some(w => PROTEIN_COMPOUND_DISQUALIFIERS.has(w));

    if (hasDisqualifier) {
      // Only exact full-phrase match qualifies
      return satisfies.includes(cleanIng);
    }

    // Specificity requirements extracted from the recipe ingredient.
    // If a recipe requests a specific protein cut or cheese variety, the deal must
    // confirm that cut/variety in its satisfiesIngredients or deal name.
    const dealNameLower = (enrichedDeal.name || enrichedDeal.dealName || '').toLowerCase();
    const ingCutWords    = ingWords.filter(w => PROTEIN_CUT_WORDS.has(w));
    const ingCheeseWords = ingWords.filter(w => SPECIFIC_CHEESE_TYPES.has(w));

    // Returns true if the given satisfies entry covers the ingredient's specificity.
    const specificityCovered = (sat) => {
      if (ingCutWords.length > 0) {
        if (!ingCutWords.some(cut => sat.includes(cut) || dealNameLower.includes(cut))) return false;
      }
      if (ingCheeseWords.length > 0) {
        if (!ingCheeseWords.some(ct => sat.includes(ct) || dealNameLower.includes(ct))) return false;
      }
      return true;
    };

    // Rule 1: Exact match on full cleaned ingredient name (always passes specificity)
    if (satisfies.includes(cleanIng)) return true;

    // Rule 2: Any satisfies entry appears as a whole-word substring of the ingredient
    //   "chicken" in satisfies → matches ingredient "diced chicken breast"
    for (const sat of satisfies) {
      if (sat.length >= 3 && cleanIng.includes(sat) && specificityCovered(sat)) return true;
    }

    // Rule 3: Any significant ingredient word exactly in satisfies
    //   ingredient "chicken" → word "chicken" in satisfies ["chicken breast","chicken","poultry"]
    for (const w of ingWords) {
      if (satisfies.includes(w) && specificityCovered(w)) return true;
    }

    return false;
  }

  /**
   * Return the importance weight for a matched deal.
   * Uses product intelligence category when available; falls back to text detection.
   */
  _getIngredientWeight(matchedDeal) {
    const piCategory = matchedDeal.productCategory;
    if (piCategory && CATEGORY_WEIGHTS[piCategory] !== undefined) {
      return CATEGORY_WEIGHTS[piCategory];
    }

    // Text-based fallback: detect weight from recipe ingredient name
    const ing = (matchedDeal.ingredient || '').toLowerCase();
    const ingWords = ing.split(/\s+/).map(w => this._singularise(w));

    if (PROTEIN_KEYWORDS.some(p => ingWords.includes(p))) {
      // Compound disqualifiers (fish sauce, chicken stock, etc.) → condiment weight
      if (ingWords.some(w => PROTEIN_COMPOUND_DISQUALIFIERS.has(w))) return CATEGORY_WEIGHTS.condiments;
      return CATEGORY_WEIGHTS.meat;
    }

    const dairyWords = ['milk', 'cheese', 'butter', 'cream', 'yoghurt', 'yogurt', 'egg'];
    if (dairyWords.some(d => ing.includes(d))) return CATEGORY_WEIGHTS.dairy;

    const veggieWords = ['broccoli', 'carrot', 'spinach', 'onion', 'potato', 'tomato', 'capsicum',
      'zucchini', 'pumpkin', 'mushroom', 'lettuce', 'cabbage', 'cauliflower'];
    if (veggieWords.some(v => ing.includes(v))) return CATEGORY_WEIGHTS.vegetables;

    const oilWords = ['oil', 'sauce', 'vinegar', 'soy', 'stock', 'paste'];
    if (oilWords.some(o => ing.includes(o))) return CATEGORY_WEIGHTS.condiments;

    const spiceWords = ['garlic', 'ginger', 'herb', 'spice', 'pepper', 'salt', 'chilli', 'cumin',
      'paprika', 'oregano', 'basil', 'thyme', 'lemon', 'lime'];
    if (spiceWords.some(s => ing.includes(s))) return CATEGORY_WEIGHTS.herbs_spices;

    return CATEGORY_WEIGHTS.other;
  }

  /**
   * Weighted recipe score: sum of (ingredient_weight × saving_amount × quantity_fit) for each matched deal.
   * A protein deal on special is worth 10× more than a garnish deal on special.
   * Quantity relevance adjusts the score based on how well the deal size fits the recipe.
   */
  _calculateRecipeScore(recipe) {
    let score = 0;
    for (const deal of recipe.matchedDeals) {
      const weight   = this._getIngredientWeight(deal);
      const saving   = deal.saving || 0;
      const qtyScore = quantityRelevanceScore(deal.dealName || '', deal.ingredient || '');
      // Add weight even if saving is $0 so recipes with protein deals rank above those without
      score += weight * (1 + saving) * qtyScore;
    }
    return score;
  }

  /**
   * Identify the "anchor ingredient" — the matched deal ingredient with the
   * highest category weight (i.e. the main reason this recipe was surfaced).
   */
  _getAnchorIngredient(recipe) {
    let best = null;
    let bestWeight = -1;
    for (const deal of recipe.matchedDeals) {
      const w = this._getIngredientWeight(deal);
      if (w > bestWeight) {
        bestWeight = w;
        best = deal.ingredient;
      }
    }
    return best;
  }

  /**
   * Get the broad protein bucket for a recipe using its enrichment data.
   * Returns 'poultry', 'red-meat', 'seafood', or 'other'.
   */
  _getProteinBucket(recipe) {
    const primary = (recipe.metadata?.primaryProtein || recipe.enrichment?.primaryProtein || '').toLowerCase();
    if (!primary) return 'other';
    return PROTEIN_BUCKETS[primary] || 'other';
  }

  /**
   * Post-scoring diversity pass. Applies two layers:
   *  1. Anchor ingredient decay — repeated use of the same anchor ingredient
   *     gets a diminishing score multiplier.
   *  2. Protein bucket guarantee — ensures at least MIN_PER_BUCKET recipes
   *     per protein category (poultry, red-meat, seafood) appear in results.
   */
  _diversifyResults(scoredRecipes, limit) {
    // Step 1: Filter to valid recipes and compute base scores
    const candidates = scoredRecipes
      .filter(r => r.matchScore > 0 && this._hasProteinMatch(r))
      .map(r => ({
        ...r,
        weightedScore:    +this._calculateRecipeScore(r).toFixed(2),
        anchorIngredient: this._getAnchorIngredient(r),
        proteinBucket:    this._getProteinBucket(r),
      }));

    // Step 2: Sort by raw weighted score (same as before)
    candidates.sort((a, b) =>
      b.weightedScore - a.weightedScore
      || b.matchScore - a.matchScore
      || b.totalSaving - a.totalSaving
    );

    // Step 3: Apply anchor ingredient decay
    const anchorCounts = new Map();
    for (const recipe of candidates) {
      const anchor = recipe.anchorIngredient || '';
      const count = anchorCounts.get(anchor) || 0;
      recipe.decayedScore = +(recipe.weightedScore / (1 + DIVERSITY_DECAY * count)).toFixed(2);
      anchorCounts.set(anchor, count + 1);
    }

    // Step 4: Re-sort by decayed score
    candidates.sort((a, b) =>
      b.decayedScore - a.decayedScore
      || b.matchScore - a.matchScore
      || b.totalSaving - a.totalSaving
    );

    // Step 5: Protein bucket guarantee — pull top recipes per bucket to the front
    const bucketQueues = new Map();
    for (const recipe of candidates) {
      const bucket = recipe.proteinBucket;
      if (!bucketQueues.has(bucket)) bucketQueues.set(bucket, []);
      bucketQueues.get(bucket).push(recipe);
    }

    const result = [];
    const placed = new Set();

    // Place MIN_PER_BUCKET from each non-'other' bucket that has matches
    for (const bucket of ['poultry', 'red-meat', 'seafood']) {
      const queue = bucketQueues.get(bucket) || [];
      for (let i = 0; i < Math.min(MIN_PER_BUCKET, queue.length); i++) {
        result.push(queue[i]);
        placed.add(queue[i]);
      }
    }

    // Fill remaining slots from the decay-sorted list
    for (const recipe of candidates) {
      if (result.length >= limit) break;
      if (!placed.has(recipe)) {
        result.push(recipe);
        placed.add(recipe);
      }
    }

    return result.slice(0, limit);
  }

  /**
   * Check if an ingredient matches a deal keyword (strict matching)
   */
  _termsMatch(ingredientName, dealKeyword) {
    if (!ingredientName || !dealKeyword) return false;

    const ing = this._cleanIngredientName(ingredientName);
    const deal = dealKeyword.toLowerCase();

    // Skip very short or empty ingredient names
    if (ing.length < 3) return false;

    // Extract significant words (length >= 3, not stop words).
    // Using 3 (not 4) so short but meaningful ingredient words like
    // "soy", "oil", "pea", "egg" are included. Noise 3-letter words
    // ("can", "jar", "the", etc.) are already excluded by STOP_WORDS.
    const ingWords = ing.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    const dealWords = deal.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));

    if (ingWords.length === 0 || dealWords.length === 0) return false;

    // Pre-compute singularised deal words once
    const singularDealWords = dealWords.map(w => this._singularise(w));

    // Reject matches where the ingredient word appears inside a different compound food.
    // e.g. "cream" must not match "Bulla Ice Cream" — the deal is ice cream, not cream.
    for (const iw of ingWords) {
      const blockedPhrases = COMPOUND_BLOCKLIST[iw] || [];
      if (blockedPhrases.some(phrase => deal.includes(phrase))) return false;
    }

    // ALL significant ingredient words must appear in the deal name.
    // This prevents partial matches such as:
    //   "fish sauce"      → "pasta sauce"       (only "sauce" overlaps)
    //   "white pepper"    → "white chocolate"   (only "white" overlaps)
    //   "chicken stock"   → "Easter Egg with Chick" (substring "chick" inside "chicken")
    //   "thickened cream" → "Baby Moisturising Cream" (only "cream" overlaps)
    for (const iw of ingWords) {
      const iwSingular = this._singularise(iw);
      const foundInDeal = singularDealWords.some(dw => {
        if (dw === iwSingular) return true;
        // Substring match only for long words (>= 7 chars) to handle stemming edge cases
        if (dw.length >= 7 && iwSingular.length >= 7) {
          return dw.includes(iwSingular) || iwSingular.includes(dw);
        }
        return false;
      });
      if (!foundInDeal) return false;
    }

    // Form disqualifier check — reject deals that are processed/pre-prepared versions
    // of a protein even when the protein keyword itself matches.
    // e.g. ingredient "chicken" must NOT match "frozen crumbed chicken tenders".
    // Form upgrade: if the ingredient explicitly names the same prepared form
    // (e.g. "chicken schnitzel"), the match is allowed through.
    for (const iw of ingWords) {
      const iwSingular = this._singularise(iw);
      if (FORM_DISQUALIFIERS[iwSingular] && this._hasFormDisqualifier(iwSingular, deal, ing)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match deals against the recipe library.
   * Returns top N recipes ranked by weighted score.
   *
   * Deal matching uses two tiers:
   *   1. Product intelligence (satisfiesIngredients) — precise, avoids false positives
   *   2. Text-based matching (_termsMatch) — fallback when PI unavailable
   *
   * Scoring weights protein deals (10×) over garnish deals (0.1×) so that
   * recipes featuring on-special main proteins rank first.
   *
   * @param {Array}  deals - Deal objects; enriched deals include a `productIntelligence` field
   * @param {number} limit - Max recipes to return (default 150; free tier slices to 50 at the route level)
   * @returns {Array} Top N matched recipes with matchedDeals, matchScore, totalSaving, weightedScore
   */
  async _scoreAllRecipes(deals) {
    const recipes = this.loadLibrary();
    if (recipes.length === 0) return [];

    // Load ingredient blocklist from DB (cached, refreshes every 30 min)
    await loadBlocklist();

    // Normalise all deal names upfront and filter to food deals only.
    // The spread preserves productIntelligence if present on the original deal.
    const normalisedDeals = deals
      .map(deal => ({
        ...deal,
        keywords: this.normalizeDealName(deal.name),
      }))
      .filter(deal => deal.keywords && this._isFoodDeal(deal.keywords, deal.category));

    const piCount   = normalisedDeals.filter(d => d.productIntelligence?.satisfiesIngredients?.length > 0).length;
    const textCount = normalisedDeals.length - piCount;
    console.log(
      `RecipeMatcher: ${normalisedDeals.length} food deals ` +
      `(${piCount} with product intelligence, ${textCount} text-only) of ${deals.length} total`
    );

    const scored = recipes.map(recipe => {
      const rawMatches = [];
      const seenPairs  = new Set(); // avoid same ingredient+deal pair twice

      for (const deal of normalisedDeals) {
        for (const ingredient of recipe.ingredients) {
          // Skip section headers and admin-deactivated ingredients
          if (ingredient.isSubheading || ingredient.isActive === false) continue;

          const cleanName = this._cleanIngredientName(ingredient.name);
          if (cleanName.length < 3) continue;

          // Check blocklist — skip pairs that have been confirmed as bad matches
          if (isBlocklisted(cleanName, deal.name)) continue;

          // Unique key distinguishes PI and text paths for the same deal
          const pathKey = deal.productIntelligence ? 'pi' : 'txt';
          const pairKey = `${cleanName}:${pathKey}:${deal.keywords || deal.name}`;
          if (seenPairs.has(pairKey)) continue;

          let matched = false;

          // ── Tier 1: Product Intelligence matching ────────────────────────
          if (USE_PRODUCT_INTELLIGENCE && deal.productIntelligence?.satisfiesIngredients?.length > 0) {
            const piResult = this._ingredientMatchesDeal(ingredient.name, deal);
            if (piResult === true) {
              matched = true;
            } else if (piResult === false) {
              // PI explicitly rejects this pair — skip text fallback
              seenPairs.add(pairKey);
              continue;
            }
            // piResult === null → no usable PI data, fall through to text matching
          }

          // ── Tier 2: Text-based matching (fallback) ───────────────────────
          if (!matched && deal.keywords) {
            matched = this._termsMatch(ingredient.name, deal.keywords);
            // Phase 1: validate using enriched ingredient tags when available
            if (matched && ingredient.ingredientTags) {
              const v = validateMatch(
                ingredient.ingredientTags,
                deal.keywords,
                deal.productIntelligence?.category ?? null,
              );
              if (!v.valid || !isAboveThreshold(v.confidence)) matched = false;
            }
          }

          if (matched) {
            rawMatches.push({
              dealName:            deal.name,
              ingredient:          cleanName,
              price:               deal.price               ?? null,
              originalPrice:       deal.originalPrice       ?? null,
              discountPercentage:  deal.discountPercentage  ?? null,
              saving: (deal.originalPrice && deal.price)
                ? +(deal.originalPrice - deal.price).toFixed(2)
                : null,
              store:              deal.store               ?? null,
              productCategory:    deal.productIntelligence?.category ?? null,
              productIntelligence: deal.productIntelligence ?? null,
            });
            seenPairs.add(pairKey);
            break; // One match per deal per recipe
          }
        }
      }

      // Deduplicate by ingredient — keep the best saving per ingredient.
      const bestByIngredient = new Map();
      for (const md of rawMatches) {
        const existing = bestByIngredient.get(md.ingredient);
        if (!existing || (md.saving || 0) > (existing.saving || 0)) {
          bestByIngredient.set(md.ingredient, md);
        }
      }
      const matchedDeals = Array.from(bestByIngredient.values());
      const totalSaving  = matchedDeals.reduce((sum, d) => sum + (d.saving || 0), 0);

      return {
        ...recipe,
        matchedDeals,
        matchScore:    matchedDeals.length,
        totalSaving:   +totalSaving.toFixed(2),
      };
    });

    return scored;
  }

  /**
   * Legacy public matcher: score the whole library then apply the old
   * diversity selection. Retained for backward compatibility and A/B; it is
   * also the fallback selector when the hero-anchored path qualifies nothing.
   * The production pipeline now uses scoreCandidates() + edge verification +
   * selectMenu() so the hero guarantee runs on VERIFIED deals.
   */
  async matchDeals(deals, limit = 150) {
    return this._diversifyResults(await this._scoreAllRecipes(deals), limit);
  }

  /**
   * Score the whole library, keep recipes with any text/PI match, attach a
   * weighted score, and return the top `poolSize` candidates.
   *
   * This pool goes to edge verification BEFORE selection. The old code
   * selected + applied the protein guarantee inside matchDeals, THEN verified
   * — so when the edge judge dropped the qualifying protein (e.g. a marinated
   * or spurious match), the recipe stayed in the list anchored on whatever
   * pantry scrap survived (the "kebabs because of olive oil" failure). Scoring
   * a generous pool and deferring selection fixes that inversion.
   */
  async scoreCandidates(deals, poolSize = 400) {
    const scored = (await this._scoreAllRecipes(deals)).filter(r => r.matchScore > 0);
    for (const r of scored) {
      r.weightedScore = +this._calculateRecipeScore(r).toFixed(2);
    }
    scored.sort((a, b) =>
      b.weightedScore - a.weightedScore
      || b.matchScore - a.matchScore
      || b.totalSaving - a.totalSaving
    );
    return scored.slice(0, poolSize);
  }

  /**
   * Returns true if the recipe has at least one matched deal where the RECIPE
   * INGREDIENT ITSELF is a core protein — not a condiment or pantry item.
   *
   * Rules (all checked against deal.ingredient, never deal.dealName):
   *  1. Whole-word match: "fish" must be the word "fish", not a substring of
   *     "fishcake" or "starfish". Uses singularised word comparison.
   *  2. Compound disqualifier: if the ingredient also contains a word from
   *     PROTEIN_COMPOUND_DISQUALIFIERS (sauce, stock, oil, etc.) it is a
   *     condiment/pantry item and cannot qualify the recipe.
   *     e.g. "fish sauce" → disqualified; "chicken stock" → disqualified;
   *          "olive oil"  → no protein anyway, skipped earlier.
   *  3. Only ingredients with >=2 chars are considered.
   */
  _hasProteinMatch(recipe) {
    for (const deal of recipe.matchedDeals) {
      // ── Fast path: product intelligence category ─────────────────────────
      if (deal.productCategory === 'meat' || deal.productCategory === 'seafood') {
        console.log(`  [protein-filter] PASS "${deal.ingredient}" via PI category "${deal.productCategory}" (${deal.store || 'unknown store'})`);
        return true;
      }

      // ── Text-based path ──────────────────────────────────────────────────
      const ing = deal.ingredient.toLowerCase().trim();
      if (ing.length < 2) continue;

      const words = ing.split(/\s+/).map(w => this._singularise(w));

      const proteinWord = PROTEIN_KEYWORDS.find(p => words.includes(p));
      if (!proteinWord) continue;

      if (words.some(w => PROTEIN_COMPOUND_DISQUALIFIERS.has(w))) {
        console.log(`  [protein-filter] SKIP "${ing}" — "${proteinWord}" present but compound disqualifier found`);
        continue;
      }

      console.log(`  [protein-filter] PASS "${deal.ingredient}" via protein "${proteinWord}" (${deal.store || 'unknown store'})`);
      return true;
    }
    return false;
  }

  // ── Hero-anchored selection (Stage 0 / 3 / 4) ────────────────────────────────

  /**
   * Per-deal version of the protein test in _hasProteinMatch: true when this
   * matched deal's RECIPE INGREDIENT is a core protein. PI meat/seafood is the
   * fast path; the text path requires a protein keyword with no compound
   * disqualifier (so "fish sauce" / "chicken stock" never count).
   */
  _isProteinDeal(deal) {
    if (deal.productCategory === 'meat' || deal.productCategory === 'seafood') return true;
    const ing = (deal.ingredient || '').toLowerCase().trim();
    if (ing.length < 2) return false;
    const words = ing.split(/\s+/).map(w => this._singularise(w));
    if (!PROTEIN_KEYWORDS.some(p => words.includes(p))) return false;
    if (words.some(w => PROTEIN_COMPOUND_DISQUALIFIERS.has(w))) return false;
    return true;
  }

  /**
   * Non-protein categories that CAN anchor a meal on a strong special:
   * substantial vegetables (mushroom, pumpkin, broccoli…) and eggs.
   * Deliberately EXCLUDES dairy and fruit (ingredients, not meal heroes — a
   * cheese or apple special doesn't drive a dinner choice) and starchy
   * staples (potato/sweet potato are cheap sides, and processed forms like
   * fries/wedges slip through PI matching as "potato").
   */
  _isCentrepieceDeal(deal) {
    const c = deal.productCategory;
    if (c === 'eggs') return true;
    if (c !== 'vegetables') return false;
    const text = `${deal.ingredient || ''} ${deal.dealName || ''}`.toLowerCase();
    if (/\b(sweet\s+)?potato(es)?\b/.test(text)) return false; // starchy staple / fries / wedges
    return true;
  }

  /**
   * Reject catering / bulk pack sizes a normal household wouldn't buy for a
   * single meal (the "4 litres of olive oil" problem). Unknown/unparseable
   * sizes pass — we never penalise a deal just because we couldn't read its pack.
   */
  _isHouseholdPack(deal) {
    const size = parseDealSize(deal.dealName);
    if (!size) return true;
    const cat = deal.productCategory;
    if (size.unit === 'ml' && size.amount > 3000) return false;                       // > 3 L liquid
    if (size.unit === 'g') {
      if ((cat === 'meat' || cat === 'seafood') && size.amount > 3000) return false;  // > 3 kg meat
      if (size.amount > 5000) return false;                                           // > 5 kg anything
    }
    return true;
  }

  /**
   * A "driver" is a deal a shopper would actually change their dinner plan
   * for: a protein hero, or a non-protein centrepiece on a STRONG special, in
   * a realistic pack. Pantry items (oil, condiments, spices, grains) never
   * drive — they were the reason 67% of served recipes had no real centrepiece
   * on special and 77% of claimed savings came from oil/rice/butter/cheese.
   */
  _isDriverDeal(deal) {
    if (!this._isHouseholdPack(deal)) return false;
    const pct  = deal.discountPercentage ?? null;
    const save = deal.saving ?? null;
    if (this._isProteinDeal(deal)) {
      // The protein itself is the draw — accept on a modest discount, or when
      // discount data is unavailable (many deals carry no originalPrice).
      if (save == null && pct == null) return true;
      return (pct != null && pct >= 5) || (save != null && save >= 1);
    }
    if (this._isCentrepieceDeal(deal)) {
      // A non-protein centrepiece must be a strong special to drive a choice
      // (mushrooms or pumpkin at half price), otherwise it's just a side.
      return (pct != null && pct >= 25) || (save != null && save >= 3);
    }
    return false;
  }

  /**
   * Post-verification menu selection. Replaces _diversifyResults for the
   * hero-anchored pipeline:
   *   1. recompute match counts / savings on the VERIFIED deals
   *   2. keep only recipes that still hold a driver deal (Stage 3 gate) — this
   *      is what kills "kebabs because of olive oil"
   *   3. round-robin draft across hero groups so no single protein dominates
   *      (Stage 4) — directly answers "don't return 150 chicken dishes"
   */
  selectMenu(candidates, limit = 150) {
    const qualified = [];
    for (const r of candidates) {
      r.matchedDeals = r.matchedDeals || [];
      r.matchScore   = r.matchedDeals.length;
      r.totalSaving  = +r.matchedDeals.reduce((s, d) => s + (d.saving || 0), 0).toFixed(2);

      const drivers = r.matchedDeals.filter(d => this._isDriverDeal(d));
      if (drivers.length === 0) continue;

      let anchor = null, bestWeight = -1;
      for (const d of drivers) {
        const w = this._getIngredientWeight(d);
        if (w > bestWeight) { bestWeight = w; anchor = d; }
      }
      const proteinBucket = this._getProteinBucket(r);
      const heroGroup = proteinBucket !== 'other'
        ? proteinBucket
        : (this._cleanIngredientName(anchor?.ingredient || '') || 'other');

      r.weightedScore    = +this._calculateRecipeScore(r).toFixed(2);
      r.anchorIngredient = anchor ? anchor.ingredient : null;
      r.proteinBucket    = proteinBucket;
      r.heroGroup        = heroGroup;
      qualified.push(r);
    }

    qualified.sort((a, b) =>
      b.weightedScore - a.weightedScore
      || b.matchScore - a.matchScore
      || b.totalSaving - a.totalSaving
    );

    // Group by hero. Insertion order follows the score sort, so the strongest
    // group leads — the top of the menu is "best chicken, best beef, best
    // seafood, best lamb, …" rather than 40 chicken dishes.
    const groups = new Map();
    for (const r of qualified) {
      if (!groups.has(r.heroGroup)) groups.set(r.heroGroup, []);
      groups.get(r.heroGroup).push(r);
    }

    // Round-robin: take the Nth-best of each group per round. A hero with 100
    // matching dishes contributes only one per round, so the menu stays varied.
    const order  = [...groups.keys()];
    const result = [];
    for (let round = 0; result.length < limit; round++) {
      let placed = false;
      for (const g of order) {
        const q = groups.get(g);
        if (q.length > round) {
          result.push(q[round]);
          placed = true;
          if (result.length >= limit) break;
        }
      }
      if (!placed) break;
    }
    return result;
  }
}

module.exports = new RecipeMatcher();
