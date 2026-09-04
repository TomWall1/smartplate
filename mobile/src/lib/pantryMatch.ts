/**
 * "Do I already have this?" for a single recipe line.
 *
 * Two different things answer that question, and they come from two different
 * places in the account:
 *
 *   - the saved pantry (`user_pantries.ingredients`) — a list the person typed
 *     on the Pantry screen, so it names specific items;
 *   - pantry staples (`user_pantries.has_pantry_staples`) — one switch that
 *     stands in for salt, oil, flour and the rest without naming them.
 *
 * The staples list mirrors backend/services/pantryMatcher.js. It is duplicated
 * rather than fetched because it is a fixed list, not user data, and a round
 * trip to grey out "salt" would be absurd. Keep the two in step.
 */

const PANTRY_STAPLES = new Set([
  'salt', 'pepper', 'black pepper', 'white pepper', 'cracked pepper',
  'olive oil', 'vegetable oil', 'cooking oil', 'canola oil', 'oil',
  'sugar', 'brown sugar', 'white sugar', 'caster sugar',
  'flour', 'plain flour', 'all purpose flour', 'all-purpose flour', 'self raising flour',
  'butter', 'water', 'baking powder', 'baking soda', 'bicarbonate of soda',
  'vinegar', 'soy sauce',
]);

/** Lower-cased, punctuation-free, and cut at the first comma — recipe lines
 *  carry preparation after it ("garlic, finely sliced") which is not the name. */
function normalise(value: string): string {
  return (value || '')
    .toLowerCase()
    .split(',')[0]
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Naive singular, enough to let "tomatoes" meet "tomato". */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function key(value: string): string {
  return normalise(value).split(' ').map(singular).join(' ').trim();
}

/** A staple the app assumes everyone has, when the account says so. */
export function isPantryStaple(name: string): boolean {
  const norm = normalise(name);
  if (PANTRY_STAPLES.has(norm)) return true;
  // Two words or fewer, so "olive oil" counts but "oil-cured olive" does not.
  const words = norm.split(' ');
  return words.length <= 2 && words.some((w) => PANTRY_STAPLES.has(w));
}

/**
 * Whether the saved pantry covers this ingredient. Matches on the normalised
 * name either way round, so a pantry entry of "tomato" covers the recipe's
 * "crushed tomatoes" and a pantry entry of "chicken thigh fillet" is covered
 * by a recipe asking for "chicken thigh".
 */
export function pantryCovers(pantryItems: string[], name: string): boolean {
  const target = key(name);
  if (!target) return false;
  return pantryItems.some((item) => {
    const have = key(item);
    if (!have) return false;
    return have === target || target.includes(have) || have.includes(target);
  });
}
