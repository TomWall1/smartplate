import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Info } from 'lucide-react';

/**
 * SavingsBreakdown
 *
 * Props:
 *   totalMealSaving        {number}
 *   totalPerServingSaving  {number}
 *   servings               {number}
 *   matchedDeals           {Array}  — each deal has { ingredient, dealName, saving, savings: { … } }
 *   collapsed              {bool}   — start collapsed (default false on detail page, true on card)
 */
export default function SavingsBreakdown({
  totalMealSaving,
  totalPerServingSaving,
  servings = 4,
  matchedDeals = [],
  collapsed: defaultCollapsed = false,
}) {
  const [open, setOpen] = useState(!defaultCollapsed);

  // Only show deals that actually have a saving
  const deals = matchedDeals.filter((d) => (d.savings?.mealSaving || 0) > 0);
  if (!totalMealSaving || totalMealSaving <= 0 || deals.length === 0) return null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #f0f8ef 0%, #fdf9f0 100%)',
        border: '1.5px solid var(--color-sprout)',
        borderRadius: '20px',
        overflow: 'hidden',
      }}
    >
      {/* Header — always visible, acts as toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4"
        style={{ background: 'transparent', cursor: 'pointer' }}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-honey)' }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="text-left min-w-0">
            <p
              className="font-bold leading-tight"
              style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '16px' }}
            >
              Save ${totalMealSaving.toFixed(2)} on this meal
            </p>
            <p
              className="text-xs"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              ${totalPerServingSaving.toFixed(2)} per serving · {servings} servings
            </p>
          </div>
        </div>
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
          style={{ background: 'rgba(125, 184, 122, 0.15)' }}
        >
          {open
            ? <ChevronUp  className="w-4 h-4" style={{ color: 'var(--color-text-green)' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-green)' }} />
          }
        </div>
      </button>

      {/* Breakdown rows */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(125, 184, 122, 0.25)' }}>
          {/* Column headers */}
          <div
            className="flex items-center gap-3 px-5 py-2"
            style={{ background: 'rgba(125, 184, 122, 0.08)' }}
          >
            <span
              className="flex-1 text-xs font-bold uppercase tracking-wide"
              style={{ color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
            >
              Ingredient on special
            </span>
            <span
              className="text-xs font-bold uppercase tracking-wide w-16 text-right"
              style={{ color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
            >
              Saves
            </span>
          </div>

          {/* Deal rows */}
          {deals.map((deal, i) => {
            const s = deal.savings;
            const pct = s?.usagePercentage ?? null;
            const isFullPack = pct != null && pct >= 95;
            const isEstimate = s?.isEstimate ?? true;

            return (
              <div
                key={i}
                className="px-5 py-3"
                style={{
                  borderTop: i > 0 ? '1px solid rgba(92, 74, 53, 0.06)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.5)',
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Ingredient + deal name */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-bold leading-snug truncate"
                      style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
                    >
                      {deal.ingredient}
                    </p>
                    <p
                      className="text-xs leading-snug mt-0.5 truncate"
                      style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                    >
                      {deal.dealName}
                    </p>

                    {/* Breakdown detail */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {pct != null && (
                        <UsageBar pct={pct} isFullPack={isFullPack} />
                      )}
                      <span
                        className="text-xs"
                        style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                      >
                        {s?.breakdown || ''}
                      </span>
                      {isEstimate && (
                        <span
                          className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(244, 169, 78, 0.15)', color: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
                        >
                          <Info className="w-2.5 h-2.5" />
                          est.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Saving amount */}
                  <div className="text-right flex-shrink-0">
                    <p
                      className="text-sm font-bold"
                      style={{ color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
                    >
                      ${(s?.mealSaving || 0).toFixed(2)}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                    >
                      /meal
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Footer total */}
          <div
            className="flex items-center justify-between px-5 py-3 mt-0"
            style={{
              borderTop: '1.5px solid rgba(125, 184, 122, 0.3)',
              background: 'rgba(125, 184, 122, 0.08)',
            }}
          >
            <p
              className="text-sm font-bold"
              style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
            >
              Total per serving
            </p>
            <p
              className="text-base font-bold"
              style={{ color: 'var(--color-text-green)', fontFamily: '"Fredoka One", sans-serif' }}
            >
              ${totalPerServingSaving.toFixed(2)} saved
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small progress bar for usage percentage */
function UsageBar({ pct, isFullPack }) {
  const color = isFullPack ? 'var(--color-text-green)' : 'var(--color-honey)';
  return (
    <div
      className="flex items-center gap-1"
      title={`${pct.toFixed(0)}% of pack used`}
    >
      <div
        className="rounded-full overflow-hidden"
        style={{ width: 40, height: 5, background: 'rgba(92, 74, 53, 0.12)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <span
        className="text-xs font-bold"
        style={{ color, fontFamily: 'Nunito, sans-serif', fontSize: '10px' }}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
