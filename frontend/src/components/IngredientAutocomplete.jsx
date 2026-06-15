import React, { useState, useRef, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import VOCAB from '../constants/ingredientVocab.json';

/**
 * Ingredient input backed by the recipe-database vocabulary. As the user types,
 * a dropdown suggests matching canonical ingredient names (prefix matches
 * first, then contains). Picking a suggestion — or pressing Enter — calls
 * onAdd(name). Free text is still allowed as a fallback so nothing is blocked.
 *
 * Used by the pantry matcher and the "ingredients to avoid" preference.
 */
export default function IngredientAutocomplete({
  onAdd,
  existing = [],
  placeholder = 'Type an ingredient…',
  allowFreeText = true,
  accent = 'var(--color-leaf)',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef(null);

  const existingSet = useMemo(
    () => new Set(existing.map((e) => String(e).toLowerCase())),
    [existing]
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const name of VOCAB) {
      if (existingSet.has(name)) continue;
      const idx = name.indexOf(q);
      if (idx === 0) starts.push(name);
      else if (idx > 0) contains.push(name);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [query, existingSet]);

  const choose = (name) => {
    const val = (name ?? query).trim().toLowerCase();
    if (!val) return;
    if (existingSet.has(val)) { setQuery(''); setOpen(false); return; }
    if (!allowFreeText && !VOCAB.includes(val)) return;
    onAdd(val);
    setQuery('');
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(suggestions[active] ?? (allowFreeText ? query : undefined));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid var(--color-stone)', borderRadius: 10, padding: '8px 12px',
            background: 'white',
          }}
        >
          <Search style={{ width: 15, height: 15, color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
            placeholder={placeholder}
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: 'var(--color-bark)', fontFamily: 'var(--font-ui)', width: '100%',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => choose(suggestions[active] ?? query)}
          disabled={!query.trim()}
          style={{
            background: accent, color: 'white', border: 'none', borderRadius: 10,
            padding: '8px 14px', cursor: query.trim() ? 'pointer' : 'not-allowed',
            opacity: query.trim() ? 1 : 0.4, flexShrink: 0,
          }}
          aria-label="Add ingredient"
        >
          <Plus style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {showList && (
        <ul
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
            margin: 0, padding: 4, listStyle: 'none',
            background: 'white', border: '1px solid var(--color-stone)', borderRadius: 10,
            boxShadow: '0 6px 20px rgba(42,36,31,0.12)', maxHeight: 280, overflowY: 'auto',
          }}
          // keep focus on input while clicking a suggestion
          onMouseDown={(e) => { e.preventDefault(); clearTimeout(blurTimer.current); }}
        >
          {suggestions.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => choose(name)}
                onMouseEnter={() => setActive(i)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: i === active ? 'var(--color-parchment)' : 'transparent',
                  color: 'var(--color-bark)', fontFamily: 'var(--font-ui)', fontSize: 14,
                  padding: '8px 10px', borderRadius: 8,
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
