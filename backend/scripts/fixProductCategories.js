/**
 * fixProductCategories.js
 * Fix satisfiesIngredients for existing PostgreSQL records that have over-broad matching.
 *
 * Run with:
 *   DATABASE_URL=<url> USE_POSTGRESQL=true node backend/scripts/fixProductCategories.js
 *
 * Fixes:
 *   1. Garlic bread / onion rings / compound baked goods — remove bare ingredient from satisfies
 *   2. Tomato paste, garlic paste, chicken stock etc. — remove bare ingredient from satisfies
 *   3. Lamb / beef specific cuts — ensure cut is in satisfies, remove bare protein if only cut present
 *   4. Named cheese varieties — remove bare "cheese" from satisfies
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
process.env.USE_POSTGRESQL = 'true';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let fixed = 0;
let unchanged = 0;

async function getAll(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function fixRecord(id, newSatisfies, reason) {
  await pool.query(
    'UPDATE products SET satisfies_ingredients = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [JSON.stringify(newSatisfies), id]
  );
  console.log(`  [FIXED #${id}] ${reason} → ${JSON.stringify(newSatisfies)}`);
  fixed++;
}

// ── Rule 1 & 2: Compound baked goods + condiments ─────────────────────────────
// Patterns: "<base> <modifier>" where modifier indicates the base is used in a
// prepared form — the bare base ingredient should be removed from satisfies.
const COMPOUND_MODIFIERS = [
  // Baked goods
  'bread', 'roll', 'bun', 'loaf', 'toast', 'cracker', 'crouton', 'ring', 'chip',
  'biscuit', 'cookie', 'muffin', 'scone', 'flatbread', 'wrap', 'naan', 'pita',
  // Condiments & pantry compounds
  'paste', 'powder', 'salt', 'sauce', 'stock', 'broth', 'oil', 'butter',
  'spread', 'jam', 'jelly', 'relish', 'chutney', 'dip', 'aioli',
  'seasoning', 'rub', 'marinade', 'glaze', 'syrup', 'extract', 'essence',
];

// Base ingredients that should be stripped when appearing bare in a compound product
const COMPOUND_BASE_INGREDIENTS = new Set([
  'garlic', 'onion', 'tomato', 'chilli', 'chili', 'ginger', 'lemon',
  'lime', 'herb', 'basil', 'oregano', 'rosemary', 'thyme', 'mint',
  'chicken', 'beef', 'lamb', 'pork', 'fish', 'prawn', 'vegetable',
  'mushroom', 'capsicum', 'spinach', 'pumpkin', 'sweet potato',
]);

async function fixCompoundProducts() {
  console.log('\n=== Rule 1+2: Compound baked goods + condiments ===');

  for (const mod of COMPOUND_MODIFIERS) {
    const rows = await getAll(
      `SELECT id, name, satisfies_ingredients FROM products
       WHERE name ILIKE $1 AND satisfies_ingredients != '[]'`,
      [`%${mod}%`]
    );

    for (const row of rows) {
      let satisfies;
      try {
        satisfies = typeof row.satisfies_ingredients === 'string'
          ? JSON.parse(row.satisfies_ingredients)
          : row.satisfies_ingredients;
      } catch { continue; }

      if (!Array.isArray(satisfies)) continue;

      const nameLower = row.name.toLowerCase();
      // Only process if the modifier is a meaningful compound (not just the base word)
      // e.g. "Garlic Bread" has "bread" and "garlic" — strip bare "garlic" from satisfies
      const newSatisfies = satisfies.filter(s => {
        const sl = s.toLowerCase().trim();
        // Keep if it's a multi-word phrase (compound already) or not a base ingredient
        if (sl.includes(' ')) return true;
        // Remove if it's a bare base ingredient AND the product name shows it's compound
        if (COMPOUND_BASE_INGREDIENTS.has(sl) && nameLower.includes(mod) && nameLower.includes(sl)) {
          return false; // Strip bare "garlic" from "Garlic Bread"
        }
        return true;
      });

      if (newSatisfies.length < satisfies.length) {
        await fixRecord(row.id, newSatisfies,
          `"${row.name}" — removed bare base from compound product`);
      } else {
        unchanged++;
      }
    }
  }
}

// ── Rule 3: Protein cuts ───────────────────────────────────────────────────────
// If a product name contains a specific protein cut, ensure satisfies reflects it.
// Remove the bare protein if the cut-specific version is already there.

const CUT_PATTERNS = [
  { cuts: ['shoulder'], protein: 'lamb' },
  { cuts: ['midloin', 'loin chop', 'chop'], protein: 'lamb' },
  { cuts: ['rack'], protein: 'lamb' },
  { cuts: ['shank'], protein: 'lamb' },
  { cuts: ['rump'], protein: 'beef' },
  { cuts: ['brisket'], protein: 'beef' },
  { cuts: ['chuck'], protein: 'beef' },
  { cuts: ['blade'], protein: 'beef' },
  { cuts: ['sirloin', 'striploin'], protein: 'beef' },
  { cuts: ['scotch fillet', 'scotch'], protein: 'beef' },
  { cuts: ['tenderloin'], protein: 'beef' },
  { cuts: ['eye fillet'], protein: 'beef' },
  { cuts: ['knuckle'], protein: 'beef' },
];

async function fixProteinCuts() {
  console.log('\n=== Rule 3: Protein cuts ===');

  for (const { cuts, protein } of CUT_PATTERNS) {
    for (const cut of cuts) {
      const rows = await getAll(
        `SELECT id, name, satisfies_ingredients FROM products
         WHERE name ILIKE $1 AND name ILIKE $2 AND satisfies_ingredients != '[]'`,
        [`%${protein}%`, `%${cut}%`]
      );

      for (const row of rows) {
        let satisfies;
        try {
          satisfies = typeof row.satisfies_ingredients === 'string'
            ? JSON.parse(row.satisfies_ingredients)
            : row.satisfies_ingredients;
        } catch { continue; }

        if (!Array.isArray(satisfies)) continue;

        const nameLower = row.name.toLowerCase();
        const hasSpecificCut = satisfies.some(s => {
          const sl = s.toLowerCase();
          return sl.includes(cut) || (cuts.some(c => sl.includes(c)));
        });

        if (!hasSpecificCut) {
          // Add cut-specific entry before the bare protein
          const cutEntry = `${protein} ${cut}`;
          const newSatisfies = [cutEntry, ...satisfies.filter(s => s.toLowerCase() !== cutEntry)];
          await fixRecord(row.id, newSatisfies,
            `"${row.name}" — added cut-specific "${cutEntry}"`);
        } else {
          unchanged++;
        }
      }
    }
  }
}

// ── Rule 4: Named cheese varieties ────────────────────────────────────────────
// Remove bare "cheese" from named cheese variety products (feta, brie, etc.)
// but keep "cheese" for generic products (cheddar, tasty, block cheese).

const SPECIFIC_CHEESES = [
  'feta', 'brie', 'camembert', 'mozzarella', 'parmesan', 'parmigiano',
  'ricotta', 'gouda', 'edam', 'gruyere', 'emmental', 'manchego',
  'haloumi', 'halloumi', 'pecorino', 'gorgonzola', 'stilton', 'roquefort',
  'burrata', 'raclette', 'provolone', 'jarlsberg',
];

async function fixNamedCheeses() {
  console.log('\n=== Rule 4: Named cheese varieties ===');

  for (const variety of SPECIFIC_CHEESES) {
    const rows = await getAll(
      `SELECT id, name, satisfies_ingredients FROM products
       WHERE name ILIKE $1 AND satisfies_ingredients LIKE '%"cheese"%'`,
      [`%${variety}%`]
    );

    for (const row of rows) {
      let satisfies;
      try {
        satisfies = typeof row.satisfies_ingredients === 'string'
          ? JSON.parse(row.satisfies_ingredients)
          : row.satisfies_ingredients;
      } catch { continue; }

      if (!Array.isArray(satisfies)) continue;

      // Remove bare "cheese" (but keep "feta cheese", "brie cheese", etc.)
      const hasBareCheeseEntry = satisfies.some(s => s.toLowerCase().trim() === 'cheese');
      if (!hasBareCheeseEntry) { unchanged++; continue; }

      const newSatisfies = satisfies.filter(s => s.toLowerCase().trim() !== 'cheese');
      await fixRecord(row.id, newSatisfies,
        `"${row.name}" — removed bare "cheese" from named ${variety} product`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fixing product satisfiesIngredients in PostgreSQL...\n');

  await fixCompoundProducts();
  await fixProteinCuts();
  await fixNamedCheeses();

  console.log(`\nDone. Fixed: ${fixed}, Unchanged: ${unchanged}`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
