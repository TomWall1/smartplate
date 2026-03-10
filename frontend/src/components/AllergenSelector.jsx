import React, { useState } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';

const ALLERGEN_OPTIONS = [
  // Major allergens (14 declared EU/AU allergens subset)
  { value: 'dairy',      label: 'Dairy',               category: 'major' },
  { value: 'eggs',       label: 'Eggs',                category: 'major' },
  { value: 'fish',       label: 'Fish',                category: 'major' },
  { value: 'shellfish',  label: 'Shellfish',           category: 'major' },
  { value: 'tree nuts',  label: 'Tree Nuts',           category: 'major' },
  { value: 'peanuts',    label: 'Peanuts',             category: 'major' },
  { value: 'wheat',      label: 'Wheat / Gluten',      category: 'major' },
  { value: 'soy',        label: 'Soy',                 category: 'major' },
  { value: 'sesame',     label: 'Sesame',              category: 'major' },
  // Common dislikes
  { value: 'garlic',     label: 'Garlic',              category: 'dislike' },
  { value: 'onion',      label: 'Onion',               category: 'dislike' },
  { value: 'tomato',     label: 'Tomato',              category: 'dislike' },
  { value: 'mushroom',   label: 'Mushrooms',           category: 'dislike' },
  { value: 'capsicum',   label: 'Capsicum / Peppers',  category: 'dislike' },
  { value: 'coconut',    label: 'Coconut',             category: 'dislike' },
  { value: 'coriander',  label: 'Coriander / Cilantro', category: 'dislike' },
  { value: 'chilli',     label: 'Chilli',              category: 'dislike' },
  { value: 'celery',     label: 'Celery',              category: 'dislike' },
  { value: 'pork',       label: 'Pork',                category: 'dislike' },
  { value: 'beef',       label: 'Beef',                category: 'dislike' },
  { value: 'lamb',       label: 'Lamb',                category: 'dislike' },
];

const MAX_TOTAL = 20;
const WARN_AT   = 10;

/**
 * AllergenSelector
 *
 * Props:
 *   selected   {string[]}  — array of ingredient/allergen strings
 *   onChange   {fn}        — called with new string[] when selection changes
 */
export default function AllergenSelector({ selected = [], onChange }) {
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState('');

  const predefined = ALLERGEN_OPTIONS.map((o) => o.value);
  const customEntries = selected.filter((s) => !predefined.includes(s));

  const toggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      if (selected.length >= MAX_TOTAL) return;
      onChange([...selected, value]);
    }
  };

  const addCustom = () => {
    const val = customText.trim().toLowerCase();
    setCustomError('');

    if (!val) return;
    if (val.length < 3) {
      setCustomError('Must be at least 3 characters.');
      return;
    }
    if (!/^[a-z0-9 ]+$/i.test(val)) {
      setCustomError('Letters, numbers and spaces only.');
      return;
    }
    if (selected.includes(val)) {
      setCustomError('Already added.');
      return;
    }
    if (selected.length >= MAX_TOTAL) {
      setCustomError(`Maximum ${MAX_TOTAL} exclusions.`);
      return;
    }

    onChange([...selected, val]);
    setCustomText('');
  };

  const remove = (val) => onChange(selected.filter((s) => s !== val));

  const major   = ALLERGEN_OPTIONS.filter((o) => o.category === 'major');
  const dislikes = ALLERGEN_OPTIONS.filter((o) => o.category === 'dislike');

  const overWarning = selected.length >= WARN_AT;

  return (
    <div style={{ fontFamily: 'Nunito, sans-serif' }}>

      {/* ── Over-selection warning ───────────────────────────────────────── */}
      {overWarning && (
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-sm"
          style={{ background: 'rgba(244, 169, 78, 0.12)', border: '1px solid var(--color-honey)', color: 'var(--color-bark)' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-honey)' }} />
          <span>{selected.length} exclusions selected — recipe matches may be limited.</span>
        </div>
      )}

      {/* ── Major allergens ──────────────────────────────────────────────── */}
      <GroupLabel label="Major Allergens" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        {major.map((opt) => (
          <OptionChip
            key={opt.value}
            label={opt.label}
            checked={selected.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
            isMajor
          />
        ))}
      </div>

      {/* ── Common dislikes ──────────────────────────────────────────────── */}
      <GroupLabel label="Common Dislikes" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        {dislikes.map((opt) => (
          <OptionChip
            key={opt.value}
            label={opt.label}
            checked={selected.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
          />
        ))}
      </div>

      {/* ── Custom entries ───────────────────────────────────────────────── */}
      <GroupLabel label="Other (add your own)" />
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={customText}
          onChange={(e) => { setCustomText(e.target.value); setCustomError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          placeholder="e.g. anchovies, olives…"
          maxLength={40}
          style={{
            flex: 1,
            background: '#ffffff',
            border: `1.5px solid ${customError ? 'var(--color-berry)' : 'var(--color-stone)'}`,
            borderRadius: '12px',
            padding: '9px 12px',
            fontSize: '14px',
            color: 'var(--color-bark)',
            outline: 'none',
          }}
          onFocus={(e) => {
            if (!customError) e.target.style.borderColor = 'var(--color-leaf)';
            e.target.style.boxShadow = '0 0 0 3px rgba(125, 184, 122, 0.15)';
          }}
          onBlur={(e) => {
            if (!customError) e.target.style.borderColor = 'var(--color-stone)';
            e.target.style.boxShadow = 'none';
          }}
        />
        <button
          onClick={addCustom}
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:opacity-90"
          style={{ background: 'var(--color-leaf)', minWidth: 40 }}
          aria-label="Add custom exclusion"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {customError && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-berry)' }}>
          {customError}
        </p>
      )}

      {/* Custom tags */}
      {customEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {customEntries.map((entry) => (
            <span
              key={entry}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-semibold"
              style={{ background: 'var(--color-peach)', color: 'var(--color-bark)', border: '1px solid var(--color-honey)' }}
            >
              {entry}
              <button
                onClick={() => remove(entry)}
                className="hover:opacity-60 transition-opacity"
                aria-label={`Remove ${entry}`}
              >
                <X className="w-3.5 h-3.5" style={{ color: 'var(--color-bark)' }} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Count */}
      <p
        className="text-xs mt-3"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {selected.length} / {MAX_TOTAL} exclusions selected
      </p>
    </div>
  );
}

function GroupLabel({ label }) {
  return (
    <p
      className="text-xs font-bold uppercase tracking-wide mb-2"
      style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
    >
      {label}
    </p>
  );
}

function OptionChip({ label, checked, onToggle, isMajor }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all w-full"
      style={{
        background: checked ? 'var(--color-mist)' : '#ffffff',
        border: `1.5px solid ${checked ? 'var(--color-leaf)' : 'var(--color-stone)'}`,
        cursor: 'pointer',
        minHeight: 44,
      }}
      role="checkbox"
      aria-checked={checked}
    >
      {/* Custom checkbox */}
      <div
        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          border: `2px solid ${checked ? 'var(--color-leaf)' : 'var(--color-stone)'}`,
          background: checked ? 'var(--color-leaf)' : 'transparent',
        }}
      >
        {checked && (
          <svg viewBox="0 0 10 8" width="10" height="8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span
        style={{
          fontSize: isMajor ? '13px' : '13px',
          fontWeight: isMajor ? 700 : 600,
          color: checked ? 'var(--color-text-green)' : 'var(--color-bark)',
          fontFamily: 'Nunito, sans-serif',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </button>
  );
}
