/**
 * services/productLookup.js
 * Multi-tier product lookup against the knowledge base.
 *
 * Tiers (fastest → slowest):
 *   1. Exact name match
 *   2. Alias lookup
 *   3. Normalized name match
 *   4. Fuzzy match (Levenshtein similarity ≥ 0.85)
 *   5. Barcode extraction from name
 */

const db = require('../database/db');

// ── Name normalization ────────────────────────────────────────────────────────
// Shared with recipeMatcher — see lib/normalize.js. DB keys
// (products.normalized_name, product_aliases.normalized) are derived from it.
const { normalizeName } = require('../lib/normalize');

// ── Levenshtein distance ──────────────────────────────────────────────────────

function levenshteinDistance(a, b) {
  if (a === b)   return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const curr = a[i - 1] === b[j - 1]
        ? dp[j - 1]
        : 1 + Math.min(dp[j], prev, dp[j - 1]);
      dp[j - 1] = prev;
      prev = curr;
    }
    dp[b.length] = prev;
  }

  return dp[b.length];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ── Barcode extraction ────────────────────────────────────────────────────────

function extractBarcode(name) {
  // Some deal names embed EAN/UPC codes
  const m = name.match(/\b(\d{8,14})\b/);
  return m ? m[1] : null;
}

// ── Core lookup ───────────────────────────────────────────────────────────────

/**
 * Find a product in the knowledge base by deal name.
 * Returns { product, matchType } or null.
 */
async function findProduct(dealName) {
  if (!dealName) return null;

  const normalized = normalizeName(dealName);

  // Tier 1: Exact name match (case-insensitive, stored as lowercase)
  {
    const product = await db.getProductByNormalizedName(normalized);
    if (product) return { product, matchType: 'exact' };
  }

  // Tier 2: Alias lookup
  {
    const product = await db.getAlias(normalized);
    if (product) return { product, matchType: 'alias' };
  }

  // Tier 3: Normalized name contains match (substring)
  {
    if (normalized.length >= 4) {
      const candidates = await db.getProductsByNormalizedNameLike(normalized);
      if (candidates.length > 0) {
        // Pick closest
        const scored = candidates.map((p) => ({
          product: p,
          score:   similarity(normalized, p.normalized_name),
        }));
        scored.sort((a, b) => b.score - a.score);
        if (scored[0].score >= 0.75) {
          return { product: scored[0].product, matchType: 'normalized' };
        }
      }
    }
  }

  // Tier 4: Fuzzy match — check candidates from substring search with looser threshold
  {
    // Use first significant word as search key
    const firstWord = normalized.split(' ').find((w) => w.length >= 4);
    if (firstWord) {
      const candidates = await db.getProductsByNormalizedNameLike(firstWord);
      if (candidates.length > 0) {
        const scored = candidates.map((p) => ({
          product: p,
          score:   similarity(normalized, p.normalized_name),
        }));
        scored.sort((a, b) => b.score - a.score);
        if (scored[0].score >= 0.85) {
          return { product: scored[0].product, matchType: 'fuzzy' };
        }
      }
    }
  }

  // Tier 5: Barcode extraction
  {
    const barcode = extractBarcode(dealName);
    if (barcode) {
      const product = await db.getProductByBarcode(barcode);
      if (product) return { product, matchType: 'barcode' };
    }
  }

  return null;
}

// ── Batch lookup (tiers 1-2 only) ─────────────────────────────────────────────

/**
 * Resolve the cheap tiers (exact + alias) for many deal names in two bulk
 * queries instead of two queries per deal. Returns a Map keyed by normalized
 * name → { product, matchType }. Names that miss both tiers are absent from
 * the Map — callers fall through to findProduct() for the expensive tiers (3-5).
 */
async function findProductsBatch(dealNames) {
  const resolved = new Map();
  const normalized = [...new Set(dealNames.map(normalizeName).filter(Boolean))];
  if (normalized.length === 0) return resolved;

  // Tier 1: exact name matches
  const exact = await db.getProductsByNormalizedNames(normalized);
  for (const product of exact) {
    if (!resolved.has(product.normalized_name)) {
      resolved.set(product.normalized_name, { product, matchType: 'exact' });
    }
  }

  // Tier 2: alias lookups for the rest
  const missing = normalized.filter((n) => !resolved.has(n));
  if (missing.length > 0) {
    const aliasRows = await db.getAliasesByNormalizedNames(missing);
    for (const row of aliasRows) {
      if (!resolved.has(row.alias_normalized)) {
        resolved.set(row.alias_normalized, { product: row, matchType: 'alias' });
      }
    }
  }

  return resolved;
}

// ── Record match + auto-alias ─────────────────────────────────────────────────

/**
 * Record a match in history. If it was a fuzzy/normalized match, also create
 * an alias so the next lookup for this deal name is instant.
 */
function recordMatch(dealName, productId, matchType, store = null) {
  // Fire-and-forget: don't block the caller on DB writes
  db.recordMatch(dealName, productId, matchType, store);

  if (productId && (matchType === 'fuzzy' || matchType === 'normalized')) {
    const normalized = normalizeName(dealName);
    db.insertAlias(productId, dealName, normalized, `${matchType}_match`);
  }
}

// ── Lookup + record ───────────────────────────────────────────────────────────

/**
 * Full lookup: find product, record the match, return result.
 */
async function lookupAndRecord(dealName, store = null) {
  const result = await findProduct(dealName);

  if (result) {
    recordMatch(dealName, result.product.id, result.matchType, store);
  } else {
    recordMatch(dealName, null, 'none', store);
  }

  return result;
}

module.exports = {
  normalizeName,
  levenshteinDistance,
  similarity,
  extractBarcode,
  findProduct,
  findProductsBatch,
  recordMatch,
  lookupAndRecord,
};
