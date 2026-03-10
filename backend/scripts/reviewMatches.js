/**
 * scripts/reviewMatches.js
 *
 * Review recent match_history entries, flag suspicious matches,
 * and suggest missing products for the database.
 *
 * Usage: node backend/scripts/reviewMatches.js [--hours=24] [--limit=50]
 */

const db = require('../database/db');

// Parse CLI args
const args    = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const HOURS   = parseInt(args.hours  ?? '24',  10);
const LIMIT   = parseInt(args.limit  ?? '100', 10);

// Suspicious patterns: deal names that matched but probably shouldn't have
const SUSPICIOUS_PATTERNS = [
  /moistur/i, /shampoo/i, /conditioner/i, /sunscreen/i, /nappy/i,
  /baby wipe/i, /deodorant/i, /toothpaste/i, /laundry/i,
  /cleaning/i, /dishwash/i, /supplement/i, /vitamin/i,
  /dog food/i, /cat food/i, /pet food/i, /bird seed/i,
];

function isSuspicious(dealName) {
  return SUSPICIOUS_PATTERNS.some(p => p.test(dealName));
}

function main() {
  const raw = db.getDb();

  console.log(`\n[ReviewMatches] Last ${HOURS}h match history (limit ${LIMIT})\n`);

  // ── Recent matches ────────────────────────────────────────────────────────
  const recent = raw.prepare(`
    SELECT mh.deal_name, mh.match_type, mh.store, mh.matched_at,
           p.name AS product_name, p.category, p.base_ingredient
    FROM match_history mh
    LEFT JOIN products p ON p.id = mh.product_id
    WHERE mh.matched_at > datetime('now', '-' || ? || ' hours')
    ORDER BY mh.matched_at DESC
    LIMIT ?
  `).all(HOURS, LIMIT);

  if (recent.length === 0) {
    console.log('  No match events in this period.');
    console.log('  Run testEndToEnd.js or testProductLookup.js to generate data.\n');
    db.closeDb();
    return;
  }

  // ── Flagged: suspicious matches ───────────────────────────────────────────
  const flagged = recent.filter(r => r.match_type !== 'none' && isSuspicious(r.deal_name));
  if (flagged.length > 0) {
    console.log(`  ⚠  SUSPICIOUS MATCHES (${flagged.length}) — non-food products that matched:`);
    for (const r of flagged.slice(0, 10)) {
      console.log(`     ✗ "${r.deal_name.substring(0, 50)}" → "${(r.product_name || '?').substring(0, 40)}" [${r.match_type}]`);
    }
    console.log('');
  }

  // ── No-match events ───────────────────────────────────────────────────────
  const noMatches = recent.filter(r => r.match_type === 'none');
  if (noMatches.length > 0) {
    // Group by deal_name to find frequently missed products
    const missCounts = {};
    for (const r of noMatches) {
      missCounts[r.deal_name] = (missCounts[r.deal_name] || 0) + 1;
    }
    const topMissed = Object.entries(missCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    console.log(`  NO-MATCH events (${noMatches.length} total):`);
    console.log('  Most frequently missed deals — add these to seed search terms:\n');
    for (const [name, count] of topMissed) {
      console.log(`     ${String(count).padStart(3)}x  ${name.substring(0, 65)}`);
    }
    console.log('');
  }

  // ── Hit breakdown ─────────────────────────────────────────────────────────
  const typeCounts = {};
  for (const r of recent) {
    typeCounts[r.match_type] = (typeCounts[r.match_type] || 0) + 1;
  }
  const hitTypes = ['exact', 'alias', 'normalized', 'fuzzy', 'barcode', 'claude'];
  const totalHits = hitTypes.reduce((s, t) => s + (typeCounts[t] || 0), 0);
  const totalAll  = recent.length;

  console.log(`  Hit rate: ${totalHits}/${totalAll} (${totalAll > 0 ? ((totalHits / totalAll) * 100).toFixed(1) : 0}%)`);
  console.log('  Breakdown:');
  for (const [type, n] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.min(25, Math.round((n / totalAll) * 25)));
    console.log(`    ${type.padEnd(12)} ${String(n).padStart(5)}  ${bar}`);
  }

  // ── Claude-categorised: review for correctness ────────────────────────────
  const claudeMatches = recent.filter(r => r.match_type === 'claude');
  if (claudeMatches.length > 0) {
    console.log(`\n  CLAUDE CATEGORIZATIONS (${claudeMatches.length}) — review for accuracy:`);
    for (const r of claudeMatches.slice(0, 10)) {
      console.log(`     "${r.deal_name.substring(0, 48).padEnd(48)}" → cat: ${r.category ?? '?'}  base: ${r.base_ingredient ?? '?'}`);
    }
  }

  // ── Fuzzy matches: candidate aliases ─────────────────────────────────────
  const fuzzyMatches = recent.filter(r => r.match_type === 'fuzzy');
  if (fuzzyMatches.length > 0) {
    console.log(`\n  FUZZY MATCHES (${fuzzyMatches.length}) — aliases auto-created for these:`);
    for (const r of fuzzyMatches.slice(0, 8)) {
      console.log(`     "${r.deal_name.substring(0, 48)}" → "${(r.product_name || '?').substring(0, 35)}"`);
    }
    console.log('  (Aliases mean next lookup will be instant)');
  }

  // ── Suggested search terms for seeding ───────────────────────────────────
  if (noMatches.length > 5) {
    const suggestions = noMatches
      .map(r => r.deal_name)
      .filter((n, i, a) => a.indexOf(n) === i) // unique
      .slice(0, 20)
      .map(name => {
        // Extract the core ingredient (strip brand/weight)
        return name
          .toLowerCase()
          .replace(/\b(woolworths|coles|iga|aldi|macro)\b/gi, '')
          .replace(/\d+\s*(g|kg|ml|l|pk|pack)\b/gi, '')
          .replace(/\b(rspca|free range|organic|premium)\b/gi, '')
          .replace(/[^a-z\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ').slice(0, 3).join(' ');
      })
      .filter(s => s.length > 3)
      .filter((s, i, a) => a.indexOf(s) === i);

    console.log('\n  SUGGESTED SEARCH TERMS to add to seedWoolworths/seedColes:');
    for (const s of suggestions) {
      console.log(`     "${s}"`);
    }
  }

  console.log('\n' + '─'.repeat(60) + '\n');
  db.closeDb();
}

main();
