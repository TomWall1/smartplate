/** Verify the stable recipe id has no collisions across the whole library. */
const recipeMatcher = require('../../services/recipeMatcher');
const recipeService = require('../../services/recipeService');

const library = recipeMatcher.loadLibrary();
const seen = new Map();
let collisions = 0;
for (const r of library) {
  const id = recipeService._stableRecipeId(r);
  if (seen.has(id) && seen.get(id) !== `${r.source}:${r.title}`.toLowerCase()) {
    console.log(`COLLISION ${id}: "${seen.get(id)}" vs "${r.source}:${r.title}"`);
    collisions++;
  }
  seen.set(id, `${r.source}:${r.title}`.toLowerCase());
}
console.log(`${library.length} recipes, ${seen.size} unique ids, ${collisions} collisions`);
process.exit(collisions ? 1 : 0);
