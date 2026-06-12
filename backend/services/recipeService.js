const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { enrichMatchedDealsWithSavings } = require('./savingsCalculator');
const recipeCostService = require('./recipeCostService');

// Primary path (works locally, read-only on Vercel but included in deploy)
const WEEKLY_RECIPES_PATH = path.join(__dirname, '..', 'data', 'weekly-recipes.json');
// Fallback writable path for serverless environments
const TMP_RECIPES_PATH = path.join('/tmp', 'weekly-recipes.json');

// Decode HTML entities that scrapers sometimes leave in text fields
function decodeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Soft-filter recipes by excluded ingredients.
 *
 * - Tags each recipe with `excludedWarnings` (array of matched excluded terms).
 * - Recipes with NO excluded ingredients come first (preserving their original order).
 * - Recipes WITH excluded ingredients are pushed to the bottom.
 * - No recipe is ever fully removed — the frontend shows a warning badge instead.
 *   This prevents the edge case where all 20 recipes contain the excluded ingredient
 *   and the user would see an empty list.
 */
function applyExcludedIngredientFilter(recipes, excludeIngredients) {
  if (!excludeIngredients || excludeIngredients.length === 0) return recipes;

  const excluded = excludeIngredients.map(e => e.toLowerCase().trim()).filter(Boolean);
  if (excluded.length === 0) return recipes;

  const tagged = recipes.map(r => {
    const allText = [
      ...(r.allIngredients || []),
      ...(r.ingredients || []),
    ].join(' ').toLowerCase();

    const warnings = excluded.filter(ex => allText.includes(ex));
    return { ...r, excludedWarnings: warnings };
  });

  // Stable sort: clean recipes first, flagged last
  return [
    ...tagged.filter(r => r.excludedWarnings.length === 0),
    ...tagged.filter(r => r.excludedWarnings.length > 0),
  ];
}

class RecipeService {
  constructor() {
    this.anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  // ── Weekly generation (library matching + Claude enrichment) ──────

  async generateWeeklyRecipes() {
    if (!this.anthropic) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const dealService = require('./dealService');
    const recipeMatcher = require('./recipeMatcher');

    let deals = await dealService.getCurrentDeals();

    // If cache is empty but a startup fetch is still running, wait for it
    // (up to 3 min) rather than immediately failing.
    if (deals.length === 0 && dealService.isLoading()) {
      console.log('RecipeService: Deals cache empty — waiting for startup fetch to complete...');
      await dealService.waitForDeals(180000);
      deals = await dealService.getCurrentDeals();
    }

    console.log(`RecipeService: Matching library recipes against ${deals.length} deals`);

    if (deals.length === 0) {
      throw new Error('No deals available — please refresh deals first');
    }

    // Step 1a: Enrich deals with product intelligence (DB lookup + Claude for unknowns).
    // Runs synchronously so the matcher can use product categorization.
    // After seeding this is mostly fast DB hits; first-run may be slower due to Claude calls.
    let enrichedDeals = deals;
    try {
      const { enrichDealsWithProducts } = require('./dealService');
      enrichedDeals = await enrichDealsWithProducts([...deals]);
    } catch (enrichErr) {
      console.warn('RecipeService: Deal enrichment unavailable — using text matching:', enrichErr.message);
    }

    // Step 1b: Find top 150 library recipes that match current deals (text + PI matching).
    // Free tier sees 50; premium users see all 150. Limit applied at the route level.
    const matched = await recipeMatcher.matchDeals(enrichedDeals, 150);
    console.log(`RecipeService: Found ${matched.length} matching library recipes`);

    // Hard rule: Claude NEVER invents recipes. Every recipe served must come
    // from the scraped library. Zero matches means something is broken
    // (library files missing from the deploy, corrupted data, or a matcher
    // bug) — fail loudly and keep serving the last good set from the DB
    // rather than silently fabricating 50 recipes.
    if (matched.length === 0) {
      throw new Error(
        'No library recipes matched current deals (library size: ' +
        `${recipeMatcher.loadLibrary().length}). Refusing to generate — ` +
        'last good recipe set remains in weekly_recipes_cache. ' +
        'Check recipe library files and the matcher before re-running.'
      );
    }

    // Step 1b-AI: validate every ingredient↔deal pairing against the
    // persisted edge store (match_edges). Verdicts already stored are free;
    // only never-seen pairs go to Claude, once, and are persisted forever.
    // This replaces the old per-recipe AI matching + verification passes,
    // which re-purchased the same judgments every week.
    try {
      const matchEdgeService = require('./matchEdgeService');
      await matchEdgeService.filterRecipesByEdges(matched);
    } catch (edgeErr) {
      console.warn('RecipeService: edge filtering unavailable — keeping text-matched deals:', edgeErr.message);
    }
    const aiRefined = matched.filter(r => (r.matchedDeals || []).length > 0);
    console.log(`RecipeService: ${aiRefined.length}/${matched.length} recipes have verified deal matches`);

    // Step 1c: Attach per-serving savings to each matched recipe's deals.
    const matchedWithSavings = aiRefined.map(r =>
      enrichMatchedDealsWithSavings(r, r.matchedDeals)
    );

    // Step 2: Deal-aware fields computed in code. The old Sonnet "enrichment"
    // call did sums (estimatedSaving), field copies (dealIngredients), and
    // string templates (dealHighlights) — code does those correctly and for
    // free. totalEstimatedCost is the one genuine judgment: it comes from the
    // durable one-time estimates in recipe_meta (recipeCostService).
    let costMap = new Map();
    try {
      costMap = await recipeCostService.getCosts(matchedWithSavings);
    } catch (costErr) {
      console.warn('RecipeService: cost estimates unavailable — price chips hidden this week:', costErr.message);
    }

    const embedMap = await this._buildEmbedMap(matchedWithSavings, { fresh: true });
    const normalised = matchedWithSavings.map((libRecipe, i) =>
      this._composeWeeklyRecipe(libRecipe, i, costMap, embedMap)
    );

    await this._saveWeeklyRecipes(normalised);
    console.log(`RecipeService: stored ${normalised.length} weekly recipes (deal fields computed in code — no weekly enrichment call)`);
    return normalised;
  }

  /**
   * Stable numeric identity for a library recipe (FNV-1a over source:title).
   * Positional ids (i + 1) made /recipes/:id resolve to a DIFFERENT recipe
   * depending on which list the id came from — the per-state artifacts each
   * number their own list, and every weekly regeneration reshuffled ids,
   * breaking deep links and favourites. A content-derived id is identical
   * across national/state artifacts and across weeks.
   */
  _stableRecipeId(libRecipe) {
    const key = recipeCostService.recipeKey(libRecipe);
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0; // 32-bit unsigned int
  }

  /**
   * Probe (or reuse this run's) per-publisher iframe capability so the
   * frontend knows whether the in-app viewer can show the original page.
   */
  async _buildEmbedMap(recipes, { fresh = false } = {}) {
    try {
      const { getEmbedMap, resetEmbedCache } = require('./publisherEmbedService');
      if (fresh) resetEmbedCache(); // re-probe once per weekly run; state runs reuse
      const samples = new Map();
      for (const r of recipes) {
        const src = (r.source || '').toLowerCase();
        if (src && r.url && !samples.has(src)) samples.set(src, r.url);
      }
      return await getEmbedMap(samples);
    } catch (err) {
      console.warn('RecipeService: embed-capability probe failed — defaulting to new-tab:', err.message);
      return null;
    }
  }

  /**
   * Clean ingredient NAME (no quantities, no publisher phrasing) for display
   * and exclusion matching. The parsed `name` is preferred; when the scraper
   * couldn't parse one, strip leading quantities/units from the raw line.
   */
  _ingredientName(ing) {
    if (typeof ing === 'string') return ing;
    if (ing.name) return ing.name;
    return (ing.raw || '')
      .replace(/^[\d\s/.,x×–-]+/, '')              // leading quantities
      .replace(/^(g|kg|ml|l|litre|cup|cups|tbsp|tsp|oz|lb|bunch|cloves?|pieces?|slices?)\b\s*/i, '')
      .replace(/\(.*?\)/g, '')                      // parenthetical notes
      .trim()
      .toLowerCase();
  }

  /**
   * Compose the serving shape for one matched library recipe.
   *
   * CONTENT BOUNDARY (IP / lead-gen design): the card carries only OUR
   * intelligence — savings, matched deals, costs, times, ingredient NAMES —
   * plus attribution. The publisher's expression (method steps, quantified
   * ingredient lines, descriptions) is NOT republished; users get it on the
   * original site via the in-app viewer / outbound link, where the
   * publisher's ads serve. Full recipe text stays server-side purely as the
   * matching index.
   */
  _composeWeeklyRecipe(libRecipe, i, costMap, embedMap = null) {
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    // Best deal per unique ingredient (deduped), then top 5 by saving.
    // Without dedup, "rice" can match 4+ rice products and the savings
    // double-count, making estimatedSaving exceed the meal's cost.
    const seenIngredients = new Set();
    const topDeals = [...(libRecipe.matchedDeals || [])]
      .sort((a, b) => (b.saving || 0) - (a.saving || 0))
      .filter(md => {
        if (!md.ingredient || seenIngredients.has(md.ingredient)) return false;
        seenIngredients.add(md.ingredient);
        return true;
      })
      .slice(0, 5);

    const estimatedSaving = +topDeals.reduce((sum, d) => sum + (d.saving || 0), 0).toFixed(2);
    const dealIngredients = topDeals.map(d => d.dealName);
    // Format matches the old Claude output ("Ingredient $X.XX at Store (save $Y.YY)");
    // _filterRecipesByStore relies on the store name appearing in the string.
    const dealHighlights = topDeals.map(d => {
      const price = d.price != null ? ` $${d.price.toFixed(2)}` : '';
      const store = d.store ? ` at ${cap(d.store)}` : '';
      const save  = d.saving ? ` (save $${d.saving.toFixed(2)})` : '';
      return `${cap(d.ingredient)}${price}${store}${save}`;
    });

    const libIngredients = (libRecipe.ingredients || []).filter(ing => !ing?.isSubheading);
    // Ingredient NAMES only — facts the matcher derived, used for the card's
    // key-ingredients list and the exclusion-warning logic.
    const allIngredients = [...new Set(
      libIngredients.map(ing => this._ingredientName(ing)).filter(Boolean)
    )];
    const source = (libRecipe.source || 'recipetineats').toLowerCase();
    return {
      id: this._stableRecipeId(libRecipe),
      title: decodeHtml(libRecipe.title) || `Recipe ${i + 1}`,
      description: '',
      dealIngredients,
      allIngredients,
      estimatedSaving,
      totalEstimatedCost: costMap.get(recipeCostService.recipeKey(libRecipe)) ?? 0,
      prepTime: libRecipe.totalTime || libRecipe.prepTime || 30,
      servings: libRecipe.servings || 4,
      steps: [],
      tags: libRecipe.tags || [],
      dealHighlights,
      matchedDeals:          libRecipe.matchedDeals         || [],
      weightedScore:         libRecipe.weightedScore         ?? null,
      totalMealSaving:       libRecipe.totalMealSaving       ?? null,
      totalPerServingSaving: libRecipe.totalPerServingSaving ?? null,
      // Backwards compat fields for existing frontend
      image: libRecipe.image || `https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400`,
      cookTime: libRecipe.cookTime || libRecipe.totalTime || 30,
      rating: 4.5,
      ingredients: allIngredients,
      instructions: '',
      source,
      sourceUrl: libRecipe.url || '#',
      embedAllowed: embedMap?.get(source) ?? false,
      nutrition: libRecipe.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 },
    };
  }

  /**
   * Generate and persist per-state weekly recipe artifacts from the
   * per-state deal artifacts. Runs after the national generation; the edge
   * store makes the matching essentially free (verdicts are shared across
   * states — only state-unique IGA pairings are ever judged fresh).
   */
  async generateAllStateRecipes() {
    const recipeMatcher    = require('./recipeMatcher');
    const matchEdgeService = require('./matchEdgeService');
    const db = require('../database/db');
    const STATES = ['vic', 'qld', 'wa', 'sa', 'tas', 'nt'];

    for (const state of STATES) {
      try {
        const row = await db.getStateDeals(state);
        const deals = row?.data?.deals;
        if (!deals?.length) {
          console.warn(`RecipeService: no ${state.toUpperCase()} deal artifact — skipping state recipes`);
          continue;
        }

        const matched = await recipeMatcher.matchDeals(deals, 150);
        if (!matched.length) {
          console.warn(`RecipeService: ${state.toUpperCase()} matched 0 recipes — skipping`);
          continue;
        }

        await matchEdgeService.filterRecipesByEdges(matched);
        const withDeals = matched.filter(r => (r.matchedDeals || []).length > 0);
        const withSavings = withDeals.map(r => enrichMatchedDealsWithSavings(r, r.matchedDeals));

        let costMap = new Map();
        try {
          costMap = await recipeCostService.getCosts(withSavings);
        } catch (costErr) {
          console.warn(`RecipeService: ${state.toUpperCase()} cost estimates unavailable: ${costErr.message}`);
        }

        const embedMap = await this._buildEmbedMap(withSavings);
        const recipes = withSavings.map((r, i) => this._composeWeeklyRecipe(r, i, costMap, embedMap));
        await db.saveStateRecipes(state, recipes, deals.length);
        console.log(`RecipeService: ${state.toUpperCase()} recipe artifact stored — ${recipes.length} recipes against ${deals.length} deals`);
      } catch (err) {
        console.error(`RecipeService: ${state.toUpperCase()} recipe generation failed: ${err.message}`);
      }
    }

    this._stateRecipeCache.clear();
  }

  // ── Personalised filtering (local, no API call) ────────────────────

  async getPersonalisedRecipes(userPreferences) {
    const weeklyRecipes = this.getWeeklyRecipes();
    return this._filterLocally(weeklyRecipes, userPreferences);
  }

  // ── Read stored weekly recipes ────────────────────────────────────

  _readRecipesFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {}
    return null;
  }

  getWeeklyRecipes(store = null) {
    // Synchronous path — return cached in-memory or filesystem data.
    // DB reads happen in the async startup loader (loadWeeklyRecipesFromDb).
    const tmpData = this._readRecipesFile(TMP_RECIPES_PATH);
    const allRecipes = (tmpData?.recipes?.length > 0)
      ? tmpData.recipes
      : (this._readRecipesFile(WEEKLY_RECIPES_PATH)?.recipes ?? []);

    if (!store) return allRecipes;
    return this._filterRecipesByStore(allRecipes, store);
  }

  /**
   * Load persisted recipes from the database into the local /tmp cache.
   * Called once at startup so getWeeklyRecipes() can remain synchronous.
   */
  async loadWeeklyRecipesFromDb() {
    try {
      const db = require('../database/db');
      const cached = await db.getWeeklyRecipes();
      if (!cached?.recipes?.length) return false;

      // Populate /tmp so the synchronous getWeeklyRecipes() can read it
      const data = {
        generatedAt: cached.generatedAt instanceof Date
          ? cached.generatedAt.toISOString()
          : cached.generatedAt,
        dealCount: cached.dealCount || 0,
        recipes: cached.recipes,
      };
      fs.writeFileSync(TMP_RECIPES_PATH, JSON.stringify(data, null, 2), 'utf8');
      console.log(`RecipeService: Loaded ${cached.recipes.length} recipes from DB (generated ${data.generatedAt})`);
      return true;
    } catch (err) {
      console.warn('RecipeService: Could not load recipes from DB:', err.message);
      return false;
    }
  }

  getWeeklyRecipesMeta() {
    const data = this._readRecipesFile(TMP_RECIPES_PATH) || this._readRecipesFile(WEEKLY_RECIPES_PATH);
    if (data) {
      return {
        generatedAt: data.generatedAt,
        recipeCount: data.recipes?.length || 0,
        dealCount: data.dealCount || 0,
      };
    }
    return null;
  }

  async _saveWeeklyRecipes(recipes) {
    // Invalidate per-state recipe caches so next request rebuilds with fresh data
    this._stateRecipeCache.clear();

    let dealCount = 0;
    try {
      const dealService = require('./dealService');
      const deals = await dealService.getCurrentDeals();
      dealCount = deals.length || 0;
    } catch {}

    // ── Primary: persist to database (survives deploys) ──────────────
    try {
      const db = require('../database/db');
      await db.saveWeeklyRecipes(recipes, dealCount);
      console.log(`RecipeService: Saved ${recipes.length} recipes to database`);
    } catch (dbErr) {
      console.warn('RecipeService: DB save failed, falling back to filesystem:', dbErr.message);
    }

    // ── Fallback / local: write to filesystem ─────────────────────────
    const data = {
      generatedAt: new Date().toISOString(),
      dealCount,
      recipes,
    };
    const json = JSON.stringify(data, null, 2);
    try {
      fs.mkdirSync(path.dirname(WEEKLY_RECIPES_PATH), { recursive: true });
      fs.writeFileSync(WEEKLY_RECIPES_PATH, json, 'utf8');
    } catch {
      // Read-only filesystem (production) — /tmp is always writable
    }
    try {
      fs.writeFileSync(TMP_RECIPES_PATH, json, 'utf8');
    } catch (err) {
      console.warn('RecipeService: Could not write /tmp recipes file:', err.message);
    }
  }

  // ── Local filtering fallback (no API call) ────────────────────────

  _filterLocally(recipes, preferences) {
    let filtered = [...recipes];

    // 1. Dietary — hard filter
    if (preferences.dietary && preferences.dietary.length > 0) {
      const diets = preferences.dietary.map(d => d.toLowerCase());
      if (diets.includes('vegetarian')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => ['vegetarian', 'vegan'].includes(t.toLowerCase())) ||
          !this._hasNonVegIngredient(r)
        );
      }
      if (diets.includes('vegan')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => t.toLowerCase() === 'vegan')
        );
      }
      if (diets.includes('gluten-free')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => t.toLowerCase() === 'gluten-free')
        );
      }
      if (diets.includes('dairy-free')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => t.toLowerCase() === 'dairy-free')
        );
      }
    }

    // 2. maxPrepTime — hard filter
    if (preferences.maxPrepTime) {
      filtered = filtered.filter(r =>
        (r.prepTime || 30) <= parseInt(preferences.maxPrepTime, 10)
      );
    }

    // 3. excludeIngredients — soft sort (pushes flagged recipes to bottom, never removes)
    filtered = applyExcludedIngredientFilter(filtered, preferences.excludeIngredients);

    // 4. mealTypes — soft sort: recipes matching a preferred type come first
    if (preferences.mealTypes && preferences.mealTypes.length > 0) {
      const types = preferences.mealTypes.map(t => t.toLowerCase());
      const matches = filtered.filter(r =>
        (r.tags ?? []).some(tag => types.includes(tag.toLowerCase()))
      );
      const rest = filtered.filter(r =>
        !(r.tags ?? []).some(tag => types.includes(tag.toLowerCase()))
      );
      filtered = [...matches, ...rest];
    }

    // Personalisation is premium-only — return up to the premium recipe limit
    // (150, matching routes/recipes.js) rather than truncating to a top-10.
    return filtered.slice(0, 150);
  }

  _hasNonVegIngredient(recipe) {
    const meats = ['chicken', 'beef', 'pork', 'lamb', 'salmon', 'fish', 'prawn', 'bacon', 'mince', 'sausage'];
    const all = (recipe.allIngredients || recipe.ingredients || []).join(' ').toLowerCase();
    return meats.some(m => all.includes(m));
  }

  // ── Legacy methods (kept for backwards compat) ────────────────────

  async findRecipesByIngredients(ingredients, preferences = {}) {
    // If preferences have dietary/budget/etc, use personalised path
    const hasPreferences = preferences.dietary?.length > 0 ||
      preferences.maxPrepTime ||
      preferences.excludeIngredients?.length > 0;

    if (hasPreferences) {
      return this.getPersonalisedRecipes(preferences);
    }

    // Otherwise return stored weekly recipes
    return this.getWeeklyRecipes();
  }

  /**
   * Apply store isolation to a list of recipes.
   * - Keeps only recipes with at least one matchedDeal from the requested store
   * - Strips cross-store matchedDeals, dealHighlights, and dealIngredients
   * - Recalculates estimatedSaving from remaining deals
   */
  _filterRecipesByStore(recipes, store) {
    const s = store.toLowerCase();
    return recipes
      .map(r => {
        const storeDeals = (r.matchedDeals || []).filter(
          d => (d.store || '').toLowerCase() === s
        );
        if (storeDeals.length === 0) return null;

        const storeSaving = +storeDeals.reduce((sum, d) => sum + (d.saving || 0), 0).toFixed(2);

        // dealHighlights are Claude strings like "Chicken $5 at Woolworths (save $2)"
        // Filter to only highlights that mention this store.
        const storeHighlights = (r.dealHighlights || []).filter(h =>
          h.toLowerCase().includes(s)
        );

        // Reconstruct dealIngredients from the filtered matched deals.
        const storeDealIngredients = storeDeals.map(d => d.dealName);

        return {
          ...r,
          matchedDeals: storeDeals,
          estimatedSaving: storeSaving,
          dealHighlights: storeHighlights,
          dealIngredients: storeDealIngredients,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.matchedDeals.length - a.matchedDeals.length);
  }

  // ── State-aware recipe delivery ──────────────────────────────────────────────

  // Process-local read cache over the per-state recipe artifacts in the DB.
  // Invalidated on weekly generation.
  _stateRecipeCache = new Map(); // state → { recipes, builtAt }
  static STATE_RECIPE_TTL = 6 * 60 * 60 * 1000; // re-read DB row after 6h

  /**
   * Returns the weekly recipes generated against the user's state's own
   * deals (per-state artifact built by the weekly pipeline). NSW/ACT use
   * the national set. Falls back to the national set — loudly — only when
   * no artifact exists yet.
   *
   * This replaced the old keyword re-scoring approach, which shuffled the
   * ORDER of NSW recipes but still showed NSW deals and prices to every
   * state.
   */
  async getRecipesByState(state, store = null) {
    const s = (state || 'nsw').toLowerCase();
    if (s === 'nsw' || s === 'act') return this.getWeeklyRecipes(store);

    const cached = this._stateRecipeCache.get(s);
    if (cached && Date.now() - cached.builtAt < RecipeService.STATE_RECIPE_TTL) {
      return store ? this._filterRecipesByStore(cached.recipes, store) : cached.recipes;
    }

    try {
      const db = require('../database/db');
      const row = await db.getStateRecipes(s);
      if (row?.recipes?.length) {
        this._stateRecipeCache.set(s, { recipes: row.recipes, builtAt: Date.now() });
        return store ? this._filterRecipesByStore(row.recipes, store) : row.recipes;
      }
    } catch (err) {
      console.warn(`RecipeService: ${s.toUpperCase()} recipe artifact read failed: ${err.message}`);
    }

    console.warn(`RecipeService: no ${s.toUpperCase()} recipe artifact yet — serving national set (run the weekly pipeline)`);
    return this.getWeeklyRecipes(store);
  }

  /**
   * Look up a recipe by its stable id. The user's state artifact is checked
   * first (it carries that state's own deals and prices); the national set
   * is the fallback. Ids are content-derived, so the same recipe resolves
   * everywhere — the list a card came from no longer matters.
   */
  async getRecipeDetails(recipeId, store = null, state = null) {
    let recipe = null;
    if (state) {
      const stateRecipes = await this.getRecipesByState(state, null);
      recipe = stateRecipes.find(r => r.id == recipeId) || null;
    }
    if (!recipe) {
      recipe = this.getWeeklyRecipes().find(r => r.id == recipeId) || null;
    }
    if (!recipe || !store) return recipe;
    // Apply store isolation so detail page never shows cross-store deal data
    const filtered = this._filterRecipesByStore([recipe], store);
    return filtered[0] || recipe;
  }

  async searchRecipes(query) {
    const recipes = this.getWeeklyRecipes();
    const q = query.toLowerCase();
    return recipes.filter(r =>
      r.title?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.tags?.some(t => t.includes(q))
    );
  }

}

module.exports = new RecipeService();
