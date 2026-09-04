/**
 * Build a canonical ingredient vocabulary from the recipe library for the
 * autocomplete dropdowns (pantry + exclude-ingredients). Cleans the messy
 * per-ingredient names, dedupes, frequency-ranks, and keeps common ones.
 *
 * Run with --write to emit ingredientVocab.json for BOTH clients (web and
 * mobile). The pantry picker is vocabulary-restricted, so a name missing
 * from this file is a name the user cannot enter,
 * otherwise prints stats for inspection.
 *   node scripts/eval/buildIngredientVocab.js          (inspect)
 *   node scripts/eval/buildIngredientVocab.js --write   (write JSON)
 */
const fs = require('fs');
const path = require('path');
const recipeMatcher = require('../../services/recipeMatcher');

// Descriptors / units / prep words to strip so "boneless skinless chicken
// breast fillets, diced" → "chicken breast".
const STRIP = new Set([
  'fresh','dried','frozen','chopped','diced','sliced','minced','crushed','grated','ground','shredded',
  'cooked','raw','large','small','medium','extra','finely','roughly','thinly','thickly','peeled','trimmed',
  'boneless','skinless','skin','on','off','lean','free','range','organic','baby','ripe','firm','soft',
  'cup','cups','tbsp','tbs','tsp','teaspoon','tablespoon','g','kg','ml','l','oz','lb','clove','cloves','can','cans',
  'tin','tins','piece','pieces','whole','halved','quartered','of','the','for','to','from','leftover','about',
  'good','quality','plus','more','optional','taste','your','favourite','such','as','or','and','a','an','some',
  'packet','pack','jar','bunch','sprig','sprigs','stick','sticks','knob','splash','drizzle','handful','pinch',
  'room','temperature','warm','cold','hot','approx','approximately','about','roughly','heaped','level','rounded',
]);

// Junk markers — if a cleaned name still contains these it's a recipe-reference
// or instruction fragment, not a buyable ingredient.
const JUNK = ['leftover', ' from ', ' of ', 'recipe', 'see note', 'serve', 'garnish'];

const MIN_COUNT = 3;   // appears in ≥3 recipes
const MAX_WORDS = 3;
const MAX_LEN   = 26;

function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';   // berries → berry
  if (w.endsWith('ves')) return w.slice(0, -3) + 'f';   // leaves → leaf
  if (w.endsWith('oes')) return w.slice(0, -2);          // tomatoes → tomato
  if (/(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2); // dishes → dish
  if (w.endsWith('es')) return w.slice(0, -1);           // flakes → flake, whites → white
  if (w.endsWith('ss')) return w;                        // glass stays
  if (w.endsWith('s')) return w.slice(0, -1);            // peas → pea
  return w;
}

function clean(raw) {
  let s = (raw || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')   // parentheticals
    .split(',')[0]                // drop everything after first comma
    .replace(/\d+([./]\d+)?/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let words = s.split(' ').filter(w => w && !STRIP.has(w));
  words = words.map(singular).filter(Boolean);
  // collapse consecutive duplicate words ("egg egg" → "egg")
  words = words.filter((w, i) => i === 0 || w !== words[i - 1]);
  // The character class in clean() keeps '-' (for 'all-rounder potato'),
  // which also let list-bullet hyphens through as '- salt'. Trim the edges.
  return words.join(' ').replace(/^[-s]+|[-s]+$/g, '').trim();
}

(function main() {
  const lib = recipeMatcher.loadLibrary();
  const counts = new Map();
  const catFor = new Map(); // name -> most common category (for grouping later)

  for (const r of lib) {
    const seen = new Set();
    for (const ing of (r.ingredients || [])) {
      if (typeof ing === 'string') continue;
      if (ing.isSubheading) continue;
      const base = clean(ing.name || ing.raw || '');
      if (!base) continue;
      if (JUNK.some(j => base.includes(j.trim()))) continue;
      const words = base.split(' ');
      if (words.length === 0 || words.length > MAX_WORDS) continue;
      if (base.length > MAX_LEN || base.length < 3) continue;
      if (seen.has(base)) continue; // count once per recipe
      seen.add(base);
      counts.set(base, (counts.get(base) || 0) + 1);
      const cat = ing.ingredientTags?.category;
      if (cat) catFor.set(base, cat);
    }
  }

  let vocab = [...counts.entries()]
    .filter(([, n]) => n >= MIN_COUNT)
    .map(([name, n]) => ({ name, n, category: catFor.get(name) || null }))
    .sort((a, b) => b.n - a.n);

  console.log(`Distinct cleaned names: ${counts.size} | kept (≥${MIN_COUNT}): ${vocab.length}`);
  console.log('\nTop 60 by frequency:');
  vocab.slice(0, 60).forEach(v => console.log(`  ${String(v.n).padStart(4)}  ${v.name}  [${v.category || '?'}]`));
  console.log('\nSample of names starting with "eg":', vocab.filter(v => v.name.startsWith('eg')).map(v => v.name));
  console.log('Sample starting with "ch":', vocab.filter(v => v.name.startsWith('ch')).slice(0, 20).map(v => v.name));

  if (process.argv.includes('--write')) {
    const root = path.join(__dirname, '..', '..', '..');
    // Both clients read the same list; the mobile pantry picker rejects
    // anything not in it, so they must not drift apart.
    const outs = [
      path.join(root, 'frontend', 'src', 'constants', 'ingredientVocab.json'),
      path.join(root, 'mobile', 'src', 'constants', 'ingredientVocab.json'),
    ];
    // Ship just the names (alphabetical), frequency-ranked dropdown handled client-side.
    const payload = [...new Set(vocab.map(v => v.name))].sort();
    for (const out of outs) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(payload));
      console.log(`\nWrote ${payload.length} ingredients → ${out}`);
    }
  }
})();
