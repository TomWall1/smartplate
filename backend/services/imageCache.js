/**
 * imageCache.js
 *
 * Persistent on-disk cache for Woolworths product image/URL lookups.
 * Cache is keyed by normalised deal name (e.g. "chicken breast fillet").
 * Entries survive across server restarts and Render redeploys.
 *
 * Each entry:
 * {
 *   imageUrl:    string | null,
 *   productUrl:  string | null,
 *   stockcode:   string | null,
 *   lastSeen:    "YYYY-MM-DD"
 * }
 *
 * A null imageUrl/productUrl means the API returned no match for this keyword —
 * we store the null so we don't retry the API every week.
 */

const fs   = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'product-image-cache.json');

// In-memory copy — loaded once, kept in sync
let _cache = null;

// Stats for the most recent enrichment run
let _lastRunStats = { hits: 0, misses: 0, total: 0, hitRate: 0 };

// ── Internal helpers ──────────────────────────────────────────────────────────

function _load() {
  if (_cache !== null) return _cache;
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    _cache = JSON.parse(raw);
  } catch {
    _cache = {};
  }
  return _cache;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a cached entry by normalised keyword.
 * Returns the entry object, or undefined if not cached.
 */
function get(keyword) {
  return _load()[keyword];
}

/**
 * Store an entry for a normalised keyword.
 * Pass { imageUrl, productUrl, stockcode } — lastSeen is set automatically.
 */
function set(keyword, entry) {
  _load()[keyword] = {
    imageUrl:   entry.imageUrl   ?? null,
    productUrl: entry.productUrl ?? null,
    stockcode:  entry.stockcode  ?? null,
    lastSeen:   new Date().toISOString().slice(0, 10),
  };
}

/**
 * Write the in-memory cache to disk.
 * Call once after an enrichment run completes.
 */
function flush() {
  const data = _load();
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Delete the cache file and reset in-memory state.
 */
function clear() {
  _cache = {};
  try { fs.unlinkSync(CACHE_PATH); } catch {}
}

/** Number of entries currently in the cache. */
function size() {
  return Object.keys(_load()).length;
}

/** Set stats after an enrichment run for reporting via the health endpoint. */
function setLastRunStats(stats) {
  _lastRunStats = stats;
}

/** Get stats from the most recent enrichment run. */
function getLastRunStats() {
  return _lastRunStats;
}

module.exports = { get, set, flush, clear, size, setLastRunStats, getLastRunStats };
