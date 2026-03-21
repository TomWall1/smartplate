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

const STORE_NAMES       = /\b(woolworths|coles|iga|aldi|macro\s*wholefoods|macro|community\s*co|coles\s*finest|nature'?s\s*finest|woolworths\s*gold|coles\s*simply|simply|love\s*life|farmland|be\s*natural|coles\s*bakery|woolworths\s*essentials|coles\s*essentials|select|homebrand|woolies|gold|finest|choice)\b/gi;
const CERTIFICATIONS    = /\b(rspca\s*approved?|free[\s-]*range|organic|certified\s*organic|grass[\s-]*fed|grain[\s-]*fed|cage[\s-]*free|hormone\s*free|antibiotic\s*free|no\s*added\s*hormones?|australian\s*grown|product\s*of\s*australia|australian)\b/gi;
const SIZES             = /\b\d+(\.\d+)?\s*(g|gm|kg|ml|l|litre|liter|oz|lb|fl\.?\s*oz)\b/gi;
const PACK_COUNTS       = /\b\d+\s*(pack|pk|x\s*\d+|piece|pc|pcs|serves|portions?)\b/gi;
const EXTRA_WHITESPACE  = /\s{2,}/g;

function normalizeName(dealName) {
  if (!dealName) return '';
  return dealName
    .toLowerCase()
    .replace(STORE_NAMES,    '')
    .replace(CERTIFICATIONS, '')
    .replace(SIZES,          '')
    .replace(PACK_COUNTS,    '')
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(EXTRA_WHITESPACE,  ' ')
    .trim();
}

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
  recordMatch,
  lookupAndRecord,
};
