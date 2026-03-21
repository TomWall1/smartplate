/**
 * services/quantityParser.js
 * Extracts quantities from deal names and recipe ingredients,
 * and scores how relevant a deal's pack size is for a recipe.
 */

// ── Unit normalisation (everything → grams or ml) ──────────────────────────

const UNIT_TO_GRAMS = {
  g:     1,
  gm:    1,
  gram:  1,
  grams: 1,
  kg:    1000,
  ml:    1,
  l:     1000,
  litre: 1000,
  liter: 1000,
};

// Match patterns like "500g", "1.5kg", "2 L", "750 ml"
const QTY_REGEX = /\b(\d+(?:\.\d+)?)\s*(g|gm|gram|grams|kg|ml|l|litre|liter)\b/gi;

/**
 * Extract the first quantity from a text string.
 * Returns { value, unit, normalised } or null.
 * `normalised` is the quantity converted to grams (or ml for liquids).
 */
function parseQuantity(text) {
  if (!text) return null;
  QTY_REGEX.lastIndex = 0;
  const match = QTY_REGEX.exec(text);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit  = match[2].toLowerCase();
  const multiplier = UNIT_TO_GRAMS[unit] ?? 1;

  return {
    value,
    unit,
    normalised: value * multiplier,
  };
}

/**
 * Score how well a deal's pack size fits a recipe ingredient's quantity.
 *
 * Returns a multiplier (0.5 – 1.2):
 *   1.2  — deal is a very close fit (within 50% of recipe need)
 *   1.0  — no quantity data available (neutral)
 *   0.7  — deal is wildly oversized (>5× recipe need)
 *   0.5  — deal is undersized (< recipe need)
 *
 * @param {string} dealText       - Deal name (e.g. "Chicken Breast 1kg")
 * @param {string} ingredientText - Recipe ingredient (e.g. "500g chicken breast")
 */
function quantityRelevanceScore(dealText, ingredientText) {
  const dealQty = parseQuantity(dealText);
  const ingQty  = parseQuantity(ingredientText);

  // No quantity info → neutral score
  if (!dealQty || !ingQty) return 1.0;

  const ratio = dealQty.normalised / ingQty.normalised;

  if (ratio < 0.5)  return 0.5;  // deal too small
  if (ratio <= 2.0)  return 1.2;  // good fit
  if (ratio <= 5.0)  return 1.0;  // acceptable
  return 0.7;                     // wildly oversized
}

module.exports = { parseQuantity, quantityRelevanceScore };
