/**
 * lib/normalize.js
 * Single source of truth for deal/product name normalization.
 *
 * Used for product DB keys, alias lookups, image-cache keys and recipe text
 * matching. This used to live as two divergent implementations
 * (productLookup.normalizeName and recipeMatcher.normalizeDealName) whose
 * strip-lists had drifted apart, so enrichment and matching could normalize
 * the same deal name differently. The strip-list below is the union of both.
 *
 * NOTE: products.normalized_name and product_aliases.normalized in the
 * database are derived from this function. If the strip-lists change,
 * re-run scripts/migrations/renormalizeNames.js so stored keys stay
 * consistent with runtime lookups.
 */

// Regex fragments (not literals — some terms need flexible separators).
// Longer phrases must come before their single-word prefixes because regex
// alternation is leftmost-first ("macro wholefoods" before "macro").
const STRIP_TERMS = [
  // Store brands and sub-brands
  'woolworths\\s*essentials', 'woolworths\\s*gold', 'woolworths', 'woolies',
  'coles\\s*essentials', 'coles\\s*bakery', 'coles\\s*finest', 'coles\\s*simply', 'coles',
  'macro\\s*wholefoods', 'macro', 'community\\s*co', "nature'?s\\s*finest",
  'love\\s*life', 'be\\s*natural', 'farmland', 'homebrand', 'essentials', 'simply',
  'iga', 'aldi',
  // Certifications / provenance
  'rspca\\s*approved?', 'rspca', 'certified\\s*organic', 'organic',
  'free[\\s-]*range', 'grass[\\s-]*fed', 'grain[\\s-]*fed', 'grain[\\s-]*free',
  'cage[\\s-]*free', 'hormone\\s*free', 'antibiotic\\s*free', 'no\\s*added\\s*hormones?',
  'australian\\s*grown', 'product\\s*of\\s*australia', 'australian',
  // Quality tiers / marketing
  'fresh', 'premium', 'quality', 'value', 'gold', 'finest', 'select', 'choice',
  // Deal descriptors
  'selected\\s*varieties', 'any\\s*variety', 'selected', 'varieties',
  'half\\s*price', 'special', 'bonus', 'save',
  // Quantity qualifiers
  'approximately', 'approx\\.?', 'minimum', 'min\\.?',
];

// Compiled once at module load — normalizeDealName used to rebuild ~45
// RegExp objects per call.
const STRIP_PATTERN = new RegExp(`\\b(?:${STRIP_TERMS.join('|')})\\b`, 'gi');

// "200-300g" style ranges must be stripped before plain sizes, otherwise the
// SIZES pattern only eats the trailing half. Dash class covers the unicode
// hyphens/dashes that appear in scraped catalogue names.
const SIZE_RANGES = /\b\d+(\.\d+)?\s*[-‐-―−]\s*\d+(\.\d+)?\s*(g|gm|kg|ml|l)\b/gi;
const SIZES       = /\b\d+(\.\d+)?\s*(gm|g|kg|ml|litre|liter|l|fl\.?\s*oz|oz|lb|mm|cm)\b/gi;
const PACKS       = /\b\d+\s*(pack|pk|x\s*\d+|pieces?|pcs?|serves|portions?|ea|each|per)\b/gi;
const EXTRA_WHITESPACE = /\s{2,}/g;

/**
 * Normalize a deal/product name to its core ingredient words.
 * e.g. "Woolworths RSPCA Chicken Thighs 1kg" → "chicken thighs"
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(SIZE_RANGES,   '')
    .replace(SIZES,         '')
    .replace(PACKS,         '')
    .replace(STRIP_PATTERN, '')
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(EXTRA_WHITESPACE, ' ')
    .trim();
}

module.exports = { normalizeName };
