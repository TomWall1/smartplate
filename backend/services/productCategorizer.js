/**
 * services/productCategorizer.js
 * Claude-powered product categorization for unknown supermarket products.
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

// ── Synonym expansion ────────────────────────────────────────────────────────
// Loaded once; used to expand satisfiesIngredients with AU/UK/US variants.
let _synonymMap = null;
let _reverseSynonymMap = null;

function getSynonymMap() {
  if (_synonymMap) return _synonymMap;
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'ingredient-synonyms.json'), 'utf8');
    _synonymMap = JSON.parse(raw);
    // Build reverse map: synonym → canonical + all siblings
    _reverseSynonymMap = {};
    for (const [canonical, synonyms] of Object.entries(_synonymMap)) {
      if (canonical.startsWith('_')) continue;
      const allNames = [canonical, ...synonyms];
      for (const name of allNames) {
        const lower = name.toLowerCase();
        if (!_reverseSynonymMap[lower]) _reverseSynonymMap[lower] = new Set();
        for (const n of allNames) _reverseSynonymMap[lower].add(n.toLowerCase());
      }
    }
  } catch {
    _synonymMap = {};
    _reverseSynonymMap = {};
  }
  return _synonymMap;
}

/**
 * Expand a satisfiesIngredients array with known synonyms.
 * E.g. ["capsicum"] → ["capsicum", "bell pepper", "pepper", ...]
 * Respects the max-8 limit from the categorizer prompt.
 */
function expandWithSynonyms(satisfies) {
  if (!satisfies || satisfies.length === 0) return satisfies;
  getSynonymMap(); // ensure loaded
  if (!_reverseSynonymMap) return satisfies;

  const expanded = new Set(satisfies.map(s => s.toLowerCase()));
  for (const entry of satisfies) {
    const lower = entry.toLowerCase();
    const related = _reverseSynonymMap[lower];
    if (related) {
      for (const r of related) expanded.add(r);
    }
  }
  // Cap at 12 to keep storage reasonable while allowing synonym expansion
  return [...expanded].slice(0, 12);
}

let _client = null;

function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function categorizationPrompt(productName, category = '', price = null) {
  return `You are a food product expert. Categorize this Australian supermarket product for a recipe matching system.

Product: "${productName}"
${category ? `Store category: "${category}"` : ''}
${price ? `Price: $${price}` : ''}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "productType": "string — specific product type, e.g. 'chicken breast', 'pasta sauce', 'cheddar cheese'",
  "baseIngredient": "string — the primary ingredient, e.g. 'chicken', 'tomato', 'cheese'",
  "category": "string — one of: meat, seafood, dairy, eggs, vegetables, fruit, grains, legumes, nuts_seeds, oils_fats, condiments, sauces, herbs_spices, baked_goods, snacks, beverages, frozen, canned_preserved, deli, other",
  "subCategory": "string — more specific, e.g. 'poultry', 'pasta', 'hard cheese'",
  "processingLevel": "string — one of: unprocessed, minimally_processed, processed, ultra_processed",
  "isHeroIngredient": true/false — true if this is a main recipe ingredient (e.g. chicken breast=true, chicken stock=false, spice blend=false)",
  "typicalUseCase": "string — how it's used, e.g. 'grilled or roasted as main protein', 'base for pasta dishes'",
  "purchaseReasonability": "string — why someone would buy this on special, e.g. 'bulk cook and freeze', 'weekly staple'",
  "satisfiesIngredients": ["array", "of", "recipe", "ingredient", "names", "this", "product", "can", "fulfil"]
}

Rules for satisfiesIngredients:
- Include the exact product type and base ingredient
- Include common recipe shorthand names (e.g. "chicken breast" also satisfies "chicken", "poultry")
- Include plural/singular variants
- Maximum 8 items, most specific first
- Only include names that would appear in recipe ingredient lists

CRITICAL RULES — these override all other rules:

1. COMPOUND BAKED GOODS: If the product is a baked/prepared item containing a food ingredient
   (e.g. garlic bread, onion rings, corn chips), do NOT include the raw ingredient alone.
   - "Garlic Bread" → ["garlic bread"] NOT ["garlic bread", "garlic"]
   - "Onion Rings" → ["onion rings"] NOT ["onion rings", "onion"]

2. COMPOUND CONDIMENTS/PANTRY: If the product is a sauce, paste, powder, stock, oil, or spread,
   do NOT include the raw base ingredient alone.
   - "Tomato Paste" → ["tomato paste"] NOT ["tomato paste", "tomato"]
   - "Chicken Stock" → ["chicken stock"] NOT ["chicken stock", "chicken"]
   - "Garlic Paste" → ["garlic paste"] NOT ["garlic paste", "garlic"]

3. SPECIFIC PROTEIN CUTS: Always include the specific cut. Do NOT include just the bare protein
   when a specific cut is named — different cuts are not interchangeable in recipes.
   - "Lamb Shoulder" → ["lamb shoulder", "shoulder of lamb"] NOT just ["lamb"]
   - "Lamb Midloin Chops" → ["lamb chops", "lamb midloin chops"] NOT just ["lamb"]
   - "Beef Rump Steak" → ["beef rump", "rump steak"] — "beef" alone OK since cuts are less specific
   - "Chicken Thigh Fillet" → ["chicken thigh", "chicken thigh fillet", "chicken"] (thigh is generic enough)

4. SPECIFIC CHEESE VARIETIES: Named cheese varieties do NOT satisfy a generic "cheese" requirement.
   Do NOT include bare "cheese" for named varieties.
   - "Devondale Feta Cheese" → ["feta cheese", "feta"] NOT ["feta cheese", "feta", "cheese"]
   - "Bega Brie" → ["brie", "brie cheese"] NOT ["brie", "cheese"]
   - "Mainland Tasty Cheddar" → ["cheddar cheese", "cheddar", "tasty cheese", "cheese"] ← "cheese" OK for generic varieties

Examples of satisfiesIngredients:
- "Free Range Chicken Breast 500g" → ["chicken breast", "chicken", "poultry"]
- "San Remo Fettuccine 500g" → ["fettuccine", "pasta", "fettuccini"]
- "Mainland Tasty Cheddar 500g" → ["cheddar cheese", "cheddar", "tasty cheese", "cheese"]
- "Woolworths RSPCA Approved Beef Mince 500g" → ["beef mince", "ground beef", "mince", "beef"]
- "Coles Garlic Bread 400g" → ["garlic bread"]
- "Lamb Shoulder Roast 1kg" → ["lamb shoulder", "shoulder of lamb", "lamb roast"]
- "Devondale Feta Cheese 200g" → ["feta cheese", "feta"]`;
}

// ── Categorize ─────────────────────────────────────────────────────────────────

async function claudeCategorize(productName, category = '', price = null) {
  const client = getClient();
  const prompt = categorizationPrompt(productName, category, price);

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.text?.trim() ?? '';

    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed  = JSON.parse(cleaned);

    // Expand satisfiesIngredients with AU/UK/US synonyms
    if (parsed.satisfiesIngredients) {
      parsed.satisfiesIngredients = expandWithSynonyms(parsed.satisfiesIngredients);
    }

    console.log(`[Categorizer] "${productName}" → ${parsed.baseIngredient} (${parsed.category})`);
    return parsed;
  } catch (err) {
    console.error(`[Categorizer] Failed for "${productName}":`, err.message);

    // Graceful fallback — basic categorization from store category
    return basicFallback(productName, category);
  }
}

// ── Batch categorize ──────────────────────────────────────────────────────────

/**
 * Categorize multiple products using a single Claude call (more efficient).
 * Returns array in same order as input.
 */
async function claudeCategorizeBatch(products) {
  if (products.length === 0) return [];
  if (products.length === 1) {
    const r = await claudeCategorize(products[0].name, products[0].category, products[0].price);
    return [r];
  }

  const client = getClient();

  const listStr = products
    .map((p, i) => `${i + 1}. "${p.name}"${p.category ? ` (category: ${p.category})` : ''}`)
    .join('\n');

  const prompt = `You are a food product expert. Categorize these ${products.length} Australian supermarket products for a recipe matching system.

${listStr}

Return ONLY a JSON array (no markdown) with ${products.length} objects in the same order, each with:
{
  "productType": "specific product type",
  "baseIngredient": "primary ingredient",
  "category": "one of: meat, seafood, dairy, eggs, vegetables, fruit, grains, legumes, nuts_seeds, oils_fats, condiments, sauces, herbs_spices, baked_goods, snacks, beverages, frozen, canned_preserved, deli, other",
  "subCategory": "more specific sub-type",
  "processingLevel": "one of: unprocessed, minimally_processed, processed, ultra_processed",
  "isHeroIngredient": true or false,
  "typicalUseCase": "how it is used in cooking",
  "purchaseReasonability": "why buy on special",
  "satisfiesIngredients": ["array of ingredient names this satisfies in recipes, max 8"]
}

CRITICAL RULES for satisfiesIngredients — these override all other logic:
1. COMPOUND BAKED GOODS: Do NOT include the raw ingredient. "Garlic Bread" → ["garlic bread"] NOT ["garlic bread","garlic"]
2. COMPOUND CONDIMENTS: Do NOT include bare base ingredient. "Tomato Paste" → ["tomato paste"] NOT ["tomato paste","tomato"]
3. PROTEIN CUTS: Always include the specific cut. "Lamb Shoulder" → ["lamb shoulder","shoulder of lamb"] NOT just ["lamb"]
4. NAMED CHEESE VARIETIES: Do NOT include bare "cheese". "Feta Cheese" → ["feta cheese","feta"] NOT ["feta","cheese"]`;

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256 * products.length,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text    = message.content[0]?.text?.trim() ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length !== products.length) {
      throw new Error(`Expected array of ${products.length}, got ${parsed?.length}`);
    }

    // Expand synonyms for all batch results
    for (const p of parsed) {
      if (p.satisfiesIngredients) {
        p.satisfiesIngredients = expandWithSynonyms(p.satisfiesIngredients);
      }
    }

    return parsed;
  } catch (err) {
    console.error('[Categorizer] Batch failed, falling back to individual:', err.message);
    // Fall back to individual categorization
    const results = [];
    for (const p of products) {
      results.push(await claudeCategorize(p.name, p.category, p.price));
    }
    return results;
  }
}

// ── Fallback ──────────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  meat:             ['beef', 'chicken', 'pork', 'lamb', 'turkey', 'duck', 'veal', 'mince', 'sausage', 'bacon', 'ham'],
  seafood:          ['fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'oyster', 'squid'],
  dairy:            ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'sour cream', 'ricotta', 'brie'],
  eggs:             ['egg'],
  vegetables:       ['vegetable', 'broccoli', 'carrot', 'spinach', 'onion', 'potato', 'tomato', 'capsicum', 'zucchini'],
  fruit:            ['apple', 'banana', 'orange', 'berry', 'berries', 'mango', 'grape', 'strawberry'],
  grains:           ['pasta', 'rice', 'bread', 'flour', 'oat', 'cereal', 'noodle'],
  condiments:       ['sauce', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'dressing', 'vinegar', 'soy'],
  herbs_spices:     ['herb', 'spice', 'pepper', 'salt', 'paprika', 'cumin', 'basil', 'oregano'],
  canned_preserved: ['canned', 'tinned', 'preserved', 'pickled'],
};

function basicFallback(productName, storeCategory = '') {
  const lower = productName.toLowerCase();
  let detectedCategory = 'other';

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      detectedCategory = cat;
      break;
    }
  }

  // Extract a rough base ingredient from the name (first real word after brand noise)
  const words = lower
    .replace(/\d+\s*(g|kg|ml|l|pack|pk|x)\b/g, '')
    .replace(/woolworths|coles|iga|macro|select|homebrand/g, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const baseIngredient = words[0] ?? 'unknown';

  return {
    productType:           productName,
    baseIngredient,
    category:              detectedCategory,
    subCategory:           storeCategory || null,
    processingLevel:       'processed',
    isHeroIngredient:      false,
    typicalUseCase:        null,
    purchaseReasonability: null,
    satisfiesIngredients:  [baseIngredient],
  };
}

module.exports = {
  claudeCategorize,
  claudeCategorizeBatch,
  categorizationPrompt,
  basicFallback,
  expandWithSynonyms,
};
