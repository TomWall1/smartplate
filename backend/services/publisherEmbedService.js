/**
 * services/publisherEmbedService.js
 *
 * Per-publisher iframe capability: can the original recipe page be shown in
 * an in-app viewer (X-Frame-Options / CSP frame-ancestors permitting)?
 * Probed once per weekly generation from a sample URL per source and stamped
 * onto each recipe as `embedAllowed`, so the frontend can choose between the
 * in-app viewer and a new-tab open — and flips automatically if a publisher
 * changes policy.
 */

const axios = require('axios');

const PROBE_TIMEOUT = 15000;
let _cache = null; // source → boolean, per process run

async function _probeUrl(url) {
  try {
    const res = await axios.get(url, {
      timeout: PROBE_TIMEOUT,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36' },
    });
    if (res.status >= 400) return false; // can't verify — assume not embeddable
    const xfo = (res.headers['x-frame-options'] || '').toUpperCase();
    if (xfo.includes('DENY') || xfo.includes('SAMEORIGIN')) return false;
    const csp = res.headers['content-security-policy'] || '';
    const fa = csp.match(/frame-ancestors([^;]*)/i);
    if (fa && !/\*/.test(fa[1])) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Build (or return the cached) source→embedAllowed map from one sample
 * recipe URL per source.
 * @param {Map<string, string>} sampleUrls - source → a recipe URL
 */
async function getEmbedMap(sampleUrls) {
  if (_cache) return _cache;
  const map = new Map();
  for (const [source, url] of sampleUrls) {
    if (!url || url === '#') { map.set(source, false); continue; }
    map.set(source, await _probeUrl(url));
  }
  _cache = map;
  console.log('[publisherEmbed] iframe capability:',
    [...map.entries()].map(([s, ok]) => `${s}=${ok ? 'yes' : 'no'}`).join(', '));
  return map;
}

/** Reset the per-run cache (called at the start of each weekly generation). */
function resetEmbedCache() {
  _cache = null;
}

module.exports = { getEmbedMap, resetEmbedCache };
