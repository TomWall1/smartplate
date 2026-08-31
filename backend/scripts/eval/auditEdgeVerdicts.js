/**
 * Read-only audit of the match_edges verdict store, per protein family.
 *
 * Traced 2026-08-28: Woolworths served 41 pork recipes of 50 while its scored
 * pool was chicken 432 / pork 241 / beef 172 / seafood 147. Selection was
 * cleared (the two-level draft gives an even split on that pool), so the
 * collapse happens in edge verification. Two causes need different fixes:
 * awkward deal FORMS the library genuinely has no recipe for, or bad/stale
 * verdicts sitting in the store and never revisited.
 *
 * This distinguishes them without spending a token or writing a row: for every
 * protein deal on special, show what the cached verdicts actually say.
 *
 *   USE_POSTGRESQL=true node scripts/eval/auditEdgeVerdicts.js [state] [store]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const { normalizeName } = require('../../lib/normalize');
const { HERO_FAMILIES } = require('../../config/matching');

const STATE = process.argv[2] || 'nsw';
const STORE = process.argv[3] || null;   // omit to audit every store

const familyOf = (s) => {
  const t = (s || '').toLowerCase();
  for (const [family, re] of HERO_FAMILIES) if (re.test(t)) return family;
  return null;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const res = await pool.query('SELECT data, fetched_at FROM state_deals_cache WHERE state = $1', [STATE]);
  if (!res.rows[0]) throw new Error(`no deals for state ${STATE}`);
  const raw = res.rows[0].data;
  const deals = (typeof raw === 'string' ? JSON.parse(raw) : raw).deals || [];
  console.log(`Deals: ${STATE.toUpperCase()} fetched ${res.rows[0].fetched_at.toISOString()}\n`);

  // Protein deals only, grouped by the normalised name the edge store keys on.
  const byNorm = new Map();
  for (const d of deals) {
    if (STORE && d.store !== STORE) continue;
    const fam = familyOf(d.name);
    if (!fam) continue;
    const norm = normalizeName(d.name);
    if (!byNorm.has(norm)) byNorm.set(norm, { norm, fam, store: d.store, names: new Set() });
    byNorm.get(norm).names.add(d.name);
  }
  const norms = [...byNorm.keys()];
  console.log(`Protein deals on special: ${norms.length} distinct normalised names${STORE ? ` at ${STORE}` : ''}\n`);

  const edges = await pool.query(
    `SELECT deal_norm, ingredient_norm, verdict, reason, model, decided_at
       FROM match_edges WHERE deal_norm = ANY($1)`,
    [norms]
  );
  for (const row of edges.rows) {
    const e = byNorm.get(row.deal_norm);
    (e.edges ||= []).push(row);
  }

  // Family roll-up first: where does verification actually bite?
  const famTotals = {};
  for (const e of byNorm.values()) {
    const t = (famTotals[e.fam] ||= { deals: 0, edges: 0, valid: 0, unseen: 0 });
    t.deals++;
    t.edges += (e.edges || []).length;
    t.valid += (e.edges || []).filter(r => r.verdict).length;
    if (!e.edges) t.unseen++;
  }
  console.log('FAMILY ROLL-UP  (edges = cached verdicts, valid = kept by verification)');
  for (const [fam, t] of Object.entries(famTotals).sort((a, b) => b[1].edges - a[1].edges)) {
    const pct = t.edges ? ((t.valid / t.edges) * 100).toFixed(0) : '--';
    console.log(`  ${fam.padEnd(8)} deals ${String(t.deals).padStart(3)}  edges ${String(t.edges).padStart(5)}  valid ${String(t.valid).padStart(5)} (${pct}%)  never-judged deals ${t.unseen}`);
  }

  // Then per deal, worst first: a big lane judged near-100% invalid is the tell.
  console.log('\nPER DEAL  (sorted by edges, worst pass rate first within a family)');
  const rows = [...byNorm.values()].sort((a, b) =>
    a.fam.localeCompare(b.fam) || (b.edges?.length || 0) - (a.edges?.length || 0));
  for (const e of rows) {
    const n = (e.edges || []).length;
    const valid = (e.edges || []).filter(r => r.verdict).length;
    const pct = n ? ((valid / n) * 100).toFixed(0) : '--';
    const flag = n >= 20 && valid < n * 0.1 ? '  <<< WIPED OUT' : '';
    console.log(`\n[${e.fam}] ${[...e.names][0]}`);
    console.log(`  norm: "${e.norm}"  store: ${e.store}`);
    console.log(`  edges ${n}, valid ${valid} (${pct}%)${flag}`);
    if (!n) { console.log('  (no cached verdict — never judged)'); continue; }
    const models = [...new Set(e.edges.map(r => r.model || 'null'))];
    const dates = e.edges.map(r => r.decided_at).sort();
    console.log(`  judged by ${models.join(', ')} between ${dates[0].toISOString().slice(0, 10)} and ${dates[dates.length - 1].toISOString().slice(0, 10)}`);
    const rejected = e.edges.filter(r => !r.verdict).slice(0, 6);
    for (const r of rejected) console.log(`    REJECT  "${r.ingredient_norm}"  — ${r.reason || '(no reason)'}`);
    const kept = e.edges.filter(r => r.verdict).slice(0, 3);
    for (const r of kept) console.log(`    keep    "${r.ingredient_norm}"`);
  }

  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
