/**
 * lib/unitPrice.js
 *
 * Parse the advertised unit price the catalogue scraper already captures
 * ("$21 per kg", "68¢ per 100g", "$4.13 per each") into a normalised rate.
 *
 * WHY THIS MATTERS. A unit price is the only price signal that survives
 * comparison: it is already normalised across pack sizes and brands, which is
 * the hard half of "what does this ingredient cost". Every week
 * services/catalogueList.js scrapes ~470 of them and nothing has ever read
 * one. This module is the first consumer.
 *
 * Everything is normalised to one of three bases so rates for the same
 * ingredient can be pooled:
 *   'kg'   — dollars per kilogram   (from kg, g, 100g)
 *   'l'    — dollars per litre      (from l, ml, 100ml)
 *   'each' — dollars per item
 *
 * Returns null rather than a guess whenever the text does not clearly say a
 * rate. A wrong rate is far worse than a missing one: rates feed cost
 * estimates, cost estimates feed ranking, and ranking amplifies whichever
 * estimate is most wrongly cheap.
 */

// "$21 per kg" | "68¢ per 100g" | "$4.13 / each" | "$2.50 per 100 ml"
const UNIT_PRICE_RE =
  /(?:\$\s*([\d.]+)|([\d.]+)\s*¢)\s*(?:per|\/)\s*([\d.]*)\s*(kg|kilogram|g|gram|grams|l|litre|liter|ml|each|ea|unit|pack)\b/i;

/** Multiplier that converts a rate quoted per `amount unit` into a base rate. */
const TO_BASE = {
  kg:        { base: 'kg',   perUnit: 1 },
  kilogram:  { base: 'kg',   perUnit: 1 },
  g:         { base: 'kg',   perUnit: 1000 },   // $/g × 1000 = $/kg
  gram:      { base: 'kg',   perUnit: 1000 },
  grams:     { base: 'kg',   perUnit: 1000 },
  l:         { base: 'l',    perUnit: 1 },
  litre:     { base: 'l',    perUnit: 1 },
  liter:     { base: 'l',    perUnit: 1 },
  ml:        { base: 'l',    perUnit: 1000 },
  each:      { base: 'each', perUnit: 1 },
  ea:        { base: 'each', perUnit: 1 },
  unit:      { base: 'each', perUnit: 1 },
  pack:      { base: 'each', perUnit: 1 },
};

// A rate outside this range is a parse failure, not a bargain. Australian
// grocery unit prices sit well inside it; anything else means the regex caught
// a pack size, a percentage, or a multi-buy blurb.
const MIN_RATE = 0.05;
const MAX_RATE = 500;

/**
 * @param {string|null} text - the scraped unitPrice string
 * @returns {{value: number, basis: 'kg'|'l'|'each'} | null}
 */
function parseUnitPrice(text) {
  if (!text) return null;

  const m = UNIT_PRICE_RE.exec(String(text));
  if (!m) return null;

  const [, dollars, cents, quantityStr, unitRaw] = m;

  // "68¢ per 100g" — cents, not dollars.
  const amount = dollars != null ? parseFloat(dollars) : parseFloat(cents) / 100;
  if (!isFinite(amount) || amount <= 0) return null;

  const conv = TO_BASE[unitRaw.toLowerCase()];
  if (!conv) return null;

  // "per 100g" → quantity 100; "per kg" → quantity 1.
  const quantity = quantityStr ? parseFloat(quantityStr) : 1;
  if (!isFinite(quantity) || quantity <= 0) return null;

  const value = (amount / quantity) * conv.perUnit;
  if (!isFinite(value) || value < MIN_RATE || value > MAX_RATE) return null;

  return { value: +value.toFixed(4), basis: conv.base };
}

// Own-brand lines. Pricing every recipe at one consistent tier matters more
// than the tier itself: a ranking survives being uniformly 20% low, but not
// recipe A priced at Essentials chicken against recipe B at organic.
const OWN_BRAND = [
  'woolworths', 'macro', 'essentials', 'homebrand', 'select',
  'coles', 'coles finest', 'community co', 'black & gold', 'black and gold',
  'ig a', 'signature', 'farmland', 'no frills',
];

// Words that make a product a different price tier, not a different brand of
// the same thing. These must never pool into one rate — see normalize.js,
// which keeps form words for the same reason.
const PREMIUM_MARKERS = [
  'organic', 'free range', 'free-range', 'grass fed', 'grass-fed',
  'wagyu', 'angus', 'artisan', 'gourmet', 'premium', 'finest',
  'biodynamic', 'sustainably', 'heritage', 'award winning',
];

/** @returns {'own'|'premium'|'branded'} the price tier a product sits in. */
function priceTier(name, brand) {
  const haystack = `${brand ?? ''} ${name ?? ''}`.toLowerCase();
  if (PREMIUM_MARKERS.some(w => haystack.includes(w))) return 'premium';
  if (OWN_BRAND.some(b => haystack.includes(b))) return 'own';
  return 'branded';
}

module.exports = { parseUnitPrice, priceTier, OWN_BRAND, PREMIUM_MARKERS };
