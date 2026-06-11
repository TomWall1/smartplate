import { useState, useEffect, useRef, useCallback } from 'react';

// The backend (Render free tier) returns 503 while it wakes up and loads the
// deal cache. Retry policy: up to 4 automatic retries, 15s apart, with a
// visible countdown. This logic was previously duplicated in App.jsx and
// StorePage.jsx.
const MAX_RETRIES = 4;
const RETRY_SECONDS = 15;

/**
 * Run an async fetcher with automatic 503-warmup retries and a normalized
 * error shape.
 *
 * Returns { run, loading, error, countdown }:
 *   - run(retryCount = 0): starts the fetch; the returned promise settles
 *     after the current attempt (scheduled retries continue in background).
 *   - error: null
 *       | { type: 'warming' }  — 503, automatic retry scheduled
 *       | { type: 'server' }   — 5xx after retries exhausted
 *       | { type: 'request' }  — any other failure
 *   - countdown: seconds until the next automatic retry (0 when idle).
 *
 * The fetcher owns its own data state; pass a useCallback-stable function.
 */
export function useWarmupFetch(fetcher, { initialLoading = false } = {}) {
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const retryTimer = useRef(null);

  // Cancel any scheduled retry on unmount
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  // Tick the countdown once per second while a retry is pending
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const run = useCallback((retryCount = 0) => {
    if (retryCount === 0) {
      setLoading(true);
      setError(null);
    }
    return fetcher()
      .then(() => {
        setError(null);
        setLoading(false);
        setCountdown(0);
      })
      .catch((err) => {
        if (err.response?.status === 503 && retryCount < MAX_RETRIES) {
          setError({ type: 'warming' });
          setCountdown(RETRY_SECONDS);
          retryTimer.current = setTimeout(() => run(retryCount + 1), RETRY_SECONDS * 1000);
          return;
        }
        console.warn('Fetch failed:', err.message);
        setLoading(false);
        setCountdown(0);
        setError({ type: err.response?.status >= 500 ? 'server' : 'request' });
      });
  }, [fetcher]);

  return { run, loading, error, countdown };
}
