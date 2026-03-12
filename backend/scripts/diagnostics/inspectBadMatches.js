/**
 * Inspect specific bad matches to understand why they're happening
 * Run with: DATABASE_URL=xxx node backend/scripts/diagnostics/inspectBadMatches.js
 */

const db = require('../../database/db');

async function inspectProduct(searchTerm) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`SEARCHING: "${searchTerm}"`);
  console.log('='.repeat(80));
  
  const products = await db.all(
    `SELECT id, name, product_type, base_ingredient, category, 
            processing_level, is_hero_ingredient, satisfies_ingredients,
            source, confidence
     FROM products 
     WHERE name ILIKE $1
     LIMIT 5`,
    [`%${searchTerm}%`]
  );
  
  if (products.length === 0) {
    console.log('❌ NOT FOUND in database\n');
    return;
  }
  
  products.forEach((p, i) => {
    console.log(`\n--- Product ${i + 1} ---`);
    console.log(`Name: ${p.name}`);
    console.log(`Product Type: ${p.product_type}`);
    console.log(`Base Ingredient: ${p.base_ingredient}`);
    console.log(`Category: ${p.category}`);
    console.log(`Processing Level: ${p.processing_level}`);
    console.log(`Hero Ingredient: ${p.is_hero_ingredient}`);
    console.log(`Source: ${p.source} (confidence: ${p.confidence})`);
    
    const satisfies = typeof p.satisfies_ingredients === 'string' 
      ? JSON.parse(p.satisfies_ingredients)
      : p.satisfies_ingredients;
    console.log(`Satisfies Ingredients: ${JSON.stringify(satisfies, null, 2)}`);
    
    // Check if this would match the problematic ingredient
    const problematicIngredients = {
      'marinated chicken kebabs': 'chicken thighs',
      'coconut water': 'coconut milk',
      'bacon': 'beef mince',
      'banana prawns': 'frozen peas'
    };
    
    const searchLower = searchTerm.toLowerCase();
    for (const [product, ingredient] of Object.entries(problematicIngredients)) {
      if (searchLower.includes(product.toLowerCase())) {
        const ingredientLower = ingredient.toLowerCase();
        const wouldMatch = satisfies.some(s => 
          s.toLowerCase().includes(ingredientLower) || 
          ingredientLower.includes(s.toLowerCase())
        );
        
        console.log(`\n🔍 WOULD MATCH "${ingredient}"? ${wouldMatch ? '❌ YES (BAD!)' : '✅ NO (Good)'}`);
        if (wouldMatch) {
          const matchedTerms = satisfies.filter(s => 
            s.toLowerCase().includes(ingredientLower) || 
            ingredientLower.includes(s.toLowerCase())
          );
          console.log(`   Matched via: ${matchedTerms.join(', ')}`);
        }
      }
    }
  });
}

async function main() {
  console.log('\n🔍 INSPECTING PROBLEMATIC PRODUCT MATCHES\n');
  
  // Inspect each problem product
  await inspectProduct('marinated chicken kebabs');
  await inspectProduct('chicken kebab');
  await inspectProduct('coconut water');
  await inspectProduct('bacon');
  await inspectProduct('bacon rashers');
  await inspectProduct('banana prawns');
  await inspectProduct('prawn');
  
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`
This diagnostic shows:
1. What's actually stored in the database for these products
2. Whether the satisfiesIngredients array is too broad
3. Whether processing_level is being set correctly
4. Whether the source is Claude or something else

Look for:
- ❌ Too many generic terms in satisfiesIngredients (e.g., "chicken" matching everything)
- ❌ processing_level = "unprocessed" for clearly processed items
- ❌ base_ingredient set to the wrong thing
- ❌ source = "manual" or "old_data" instead of "claude"
`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
