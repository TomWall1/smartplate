import React, { useEffect, useRef, useState } from 'react';

/**
 * The weekly savings moment — the brand's signature element (STYLE_GUIDE §8).
 * One number in clay, one plain sentence, nothing else. The count-up is the
 * app's single orchestrated animation; it respects prefers-reduced-motion.
 */
export default function SavingsHero({ amount, storeName, recipeCount }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!amount || amount <= 0) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) {
      setDisplay(amount);
      return undefined;
    }
    const start = performance.now();
    const DURATION = 600;
    const tick = (now) => {
      const t = Math.min((now - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      setDisplay(amount * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [amount]);

  if (!amount || amount <= 0) return null;

  return (
    <section
      className="savings-hero"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
      }}
    >
      <p
        className="mb-1"
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '13px',
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: 'var(--color-brand-text)',
        }}
      >
        This week
      </p>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 6vw, 48px)',
          fontWeight: 500,
          lineHeight: 1,
          color: 'var(--color-accent)',
        }}
      >
        ${display.toFixed(0)}
      </p>
      <p
        className="mt-2"
        style={{ fontFamily: 'var(--font-ui)', fontSize: '16px', color: 'var(--color-ink)' }}
      >
        in savings across {recipeCount} dinners — built from what's on special at {storeName} this week.
      </p>
    </section>
  );
}
