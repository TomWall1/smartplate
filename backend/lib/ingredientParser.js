/**
 * lib/ingredientParser.js
 * Shared parsing for scraped recipe text — ingredient strings and ISO 8601
 * durations.
 *
 * This logic used to be copy-pasted into all five scrapers, which is how two
 * bugs survived so long: the "/ alternative" strip ran before the leading
 * quantity was taken (blanking the name of anything starting with a fraction),
 * and quantity ranges were never consumed at all. Fixing one copy left the
 * other four to reintroduce both on their next run. There is now one copy.
 *
 * Consumed by scripts/scrape*.js and scripts/reparseIngredients.js.
 */


// Units recognised at the start of the text remaining after the quantity.
const UNIT_PATTERN = /^(tbsp|tablespoons?|tsp|teaspoons?|cups?|g|kg|ml|l|litres?|liters?|oz|lb|lbs?|bunch|bunches|cloves?|pieces?|slices?|sprigs?|stalks?|heads?|cans?|tins?|packets?|pinch|handful|rashers?|fillets?|strips?)\b/i;

function parseDuration(iso) {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  return hours * 60 + minutes;
}

function parseIngredient(raw) {
  let text = raw.trim();

  // Remove parenthetical notes, innermost first so nested notes like
  // "((2 large lemons))" don't leave a stray bracket behind
  let previous;
  do {
    previous = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  } while (text !== previous);
  text = text.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

  // Extract leading quantity (handles fractions like 1/2, 1 1/2, unicode ½)
  let quantity = null;
  const qtyMatch = text.match(/^([\d]+\s+[\d]+\/[\d]+|[\d]+\/[\d]+|[\d]+\.?\d*)\s*/);
  if (qtyMatch) {
    quantity = qtyMatch[1].trim();
    text = text.slice(qtyMatch[0].length).trim();
  }

  // Handle unicode fractions
  const unicodeFractions = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4' };
  for (const [uf, replacement] of Object.entries(unicodeFractions)) {
    if (text.startsWith(uf)) {
      quantity = quantity ? `${quantity} ${replacement}` : replacement;
      text = text.slice(1).trim();
    }
  }

  // Quantity ranges and multipliers left over after the leading number:
  //   "3 - 3.5 lb whole chicken", "1 to 2 tsp salt", "2 x 10oz sirloin"
  text = text.replace(/^(?:[-–—]|to)\s*\d[\d.\/]*\s*/, '').trim();
  text = text.replace(/^x\s*\d[\d.\/]*\s*/i, '').trim();

  // Extract unit
  let unit = null;
  const unitMatch = text.match(UNIT_PATTERN);
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    text = text.slice(unitMatch[0].length).trim();
  }

  // Drop the imperial/metric restatement that follows the primary measure,
  // e.g. "280g / 9 oz pitted dates" → "pitted dates". This has to run AFTER
  // the quantity is taken, or a leading fraction ("1/4 tsp salt") looks like
  // an alternative measure and swallows the whole ingredient name.
  text = text.replace(/^\/\s*\d[\d\s\/.–—-]*\s*[a-zA-Z]+\.?\s+/, '').trim();

  // Clean up ingredient name
  let name = text
    .replace(/^[,\s-]+/, '')  // leading punctuation
    .replace(/[,\s-]+$/, '')  // trailing punctuation
    .replace(/\s+/g, ' ')     // collapse whitespace
    .toLowerCase()
    .trim();

  // Remove leading "of " (e.g. "of olive oil" → "olive oil")
  name = name.replace(/^of\s+/, '');

  return { name, quantity, unit, raw };
}

module.exports = { UNIT_PATTERN, parseIngredient, parseDuration };
