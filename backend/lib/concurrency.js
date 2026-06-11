/**
 * lib/concurrency.js
 * Bounded-concurrency helpers for batch pipelines (deal enrichment, AI matching).
 */

/**
 * Map over items with at most `limit` calls in flight.
 * Results preserve input order. A failed item resolves to null (after the
 * optional onError callback), matching the pipeline convention of
 * "skip and continue" rather than failing the whole batch.
 */
async function mapWithConcurrency(items, limit, fn, { onError } = {}) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = null;
        if (onError) onError(err, items[i], i);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker())
  );
  return results;
}

/**
 * Retry an async call with exponential backoff and jitter.
 * Honours a Retry-After header when the error carries one (e.g. Anthropic 429s).
 */
async function withRetry(fn, { retries = 3, baseDelayMs = 1000, shouldRetry = () => true } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) throw err;
      const retryAfterMs = Number(err?.headers?.['retry-after']) * 1000;
      const delay = retryAfterMs || baseDelayMs * 2 ** attempt * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

module.exports = { mapWithConcurrency, withRetry };
