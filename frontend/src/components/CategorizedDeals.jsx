import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { groupDealsByCategory } from '../utils/categoryMapper';
import DealCard from './DealCard';

// Emoji icon per category for a bit of visual warmth
const CATEGORY_ICONS = {
  'Proteins':       '🥩',
  'Fresh Produce':  '🥦',
  'Dairy & Eggs':   '🧀',
  'Pantry Staples': '🫙',
  'Bakery':         '🍞',
  'Frozen':         '❄️',
  'Other':          '🛒',
};

function CategorySection({ categoryName, deals, isExpanded, onToggle }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid var(--color-stone)',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)',
      }}
    >
      {/* Section header — always visible, acts as toggle */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4"
        style={{ background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '20px', lineHeight: 1 }}>
            {CATEGORY_ICONS[categoryName] || '🛒'}
          </span>
          <span
            style={{
              fontFamily: '"Fredoka One", sans-serif',
              color: 'var(--color-bark)',
              fontSize: '18px',
            }}
          >
            {categoryName}
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{
              background: 'var(--color-mist)',
              color: 'var(--color-text-green)',
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(125, 184, 122, 0.12)' }}
        >
          {isExpanded
            ? <ChevronUp  className="w-4 h-4" style={{ color: 'var(--color-text-green)' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-green)' }} />
          }
        </div>
      </button>

      {/* Deal grid */}
      {isExpanded && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-4 pb-4"
          style={{ borderTop: '1px solid var(--color-stone)' }}
        >
          {deals.map((deal, idx) => (
            <DealCard key={deal.id ?? idx} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategorizedDeals({ deals }) {
  const groupedDeals  = groupDealsByCategory(deals);
  const categoryNames = Object.keys(groupedDeals);

  // Proteins expanded by default; everything else collapsed
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    const init = {};
    categoryNames.forEach((cat) => {
      init[cat] = cat === 'Proteins';
    });
    setExpanded(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals.length]);

  const toggleCategory = (cat) => {
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const allExpanded = categoryNames.every((cat) => expanded[cat]);
  const toggleAll   = () => {
    const next = !allExpanded;
    const state = {};
    categoryNames.forEach((cat) => { state[cat] = next; });
    setExpanded(state);
  };

  if (categoryNames.length === 0) {
    return (
      <div
        className="text-center py-12"
        style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
      >
        No deals to display.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Expand / collapse all */}
      <div className="flex justify-end">
        <button
          onClick={toggleAll}
          className="text-xs font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {categoryNames.map((cat) => (
        <CategorySection
          key={cat}
          categoryName={cat}
          deals={groupedDeals[cat]}
          isExpanded={expanded[cat] ?? false}
          onToggle={() => toggleCategory(cat)}
        />
      ))}
    </div>
  );
}
