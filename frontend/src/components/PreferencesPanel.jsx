import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../services/api';

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan',      label: 'Vegan' },
  { id: 'gluten-free',label: 'Gluten-free' },
  { id: 'dairy-free', label: 'Dairy-free' },
];

const PREP_TIME_OPTIONS = [
  { value: '',   label: 'Any' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
];

const inputStyle = {
  background: '#ffffff',
  border: '1.5px solid var(--color-stone)',
  borderRadius: '12px',
  padding: '8px 12px',
  fontFamily: 'Nunito, sans-serif',
  fontSize: '14px',
  color: 'var(--color-bark)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const handleInputFocus = (e) => {
  e.target.style.borderColor = 'var(--color-leaf)';
  e.target.style.boxShadow = '0 0 0 3px rgba(125, 184, 122, 0.15)';
};
const handleInputBlur = (e) => {
  e.target.style.borderColor = 'var(--color-stone)';
  e.target.style.boxShadow = 'none';
};

export default function PreferencesPanel({ isOpen, onClose, onApply }) {
  const { preferences, setPreferences } = useApp();
  const { user } = useAuth();

  const [local, setLocal] = useState({ ...preferences });
  const [pantryInput, setPantryInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLocal({ ...preferences });
      setPantryInput('');
      setExcludeInput('');
    }
  }, [isOpen, preferences]);

  const toggleDietary = (id) => {
    setLocal((prev) => ({
      ...prev,
      dietary: prev.dietary?.includes(id)
        ? prev.dietary.filter((d) => d !== id)
        : [...(prev.dietary ?? []), id],
    }));
  };

  const addPantryItem = () => {
    const val = pantryInput.trim();
    if (!val) return;
    setLocal((prev) => ({ ...prev, pantryItems: [...(prev.pantryItems ?? []), val] }));
    setPantryInput('');
  };

  const removePantryItem = (idx) => {
    setLocal((prev) => ({ ...prev, pantryItems: (prev.pantryItems ?? []).filter((_, i) => i !== idx) }));
  };

  const addExclude = () => {
    const val = excludeInput.trim();
    if (!val) return;
    setLocal((prev) => ({ ...prev, excludeIngredients: [...(prev.excludeIngredients ?? []), val] }));
    setExcludeInput('');
  };

  const removeExclude = (idx) => {
    setLocal((prev) => ({ ...prev, excludeIngredients: (prev.excludeIngredients ?? []).filter((_, i) => i !== idx) }));
  };

  const handleClear = () => {
    setLocal({ dietary: [], dislikes: [], pantryItems: [], mealTypes: [], maxPrepTime: '', excludeIngredients: [] });
  };

  const handleApply = () => {
    setPreferences(local);
    if (user) {
      usersApi.updatePreferences({
        dietary_restrictions: local.dietary ?? [],
        excluded_ingredients: local.excludeIngredients ?? [],
      }).catch(() => {});
    }
    onApply?.(local);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`panel-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        className={`slide-panel ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Personalise Recipes"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--color-stone)' }}
        >
          <h2
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '20px' }}
          >
            Personalise Recipes
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl transition-colors hover:opacity-70"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Dietary */}
          <div>
            <p
              className="text-sm font-bold mb-2"
              style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
            >
              Dietary
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DIETARY_OPTIONS.map(({ id, label }) => {
                const checked = (local.dietary ?? []).includes(id);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                    style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDietary(id)}
                      className="rounded"
                      style={{ accentColor: 'var(--color-leaf)' }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Max prep time */}
          <div>
            <label
              className="block text-sm font-bold mb-2"
              style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
            >
              Max prep time
            </label>
            <select
              value={local.maxPrepTime ?? ''}
              onChange={(e) => setLocal((prev) => ({ ...prev, maxPrepTime: e.target.value }))}
              style={{ ...inputStyle, padding: '8px 12px' }}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            >
              {PREP_TIME_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Pantry items */}
          <div>
            <p
              className="text-sm font-bold mb-2"
              style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
            >
              Ingredients I have at home
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={pantryInput}
                onChange={(e) => setPantryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
                placeholder="e.g. rice, eggs..."
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <button
                onClick={addPantryItem}
                className="p-2 rounded-xl text-white transition-all hover:opacity-90 flex-shrink-0"
                style={{ background: 'var(--color-leaf)' }}
                aria-label="Add pantry item"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(local.pantryItems ?? []).map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
                >
                  {item}
                  <button
                    onClick={() => removePantryItem(i)}
                    className="transition-opacity hover:opacity-60"
                    style={{ color: 'var(--color-text-green)' }}
                    aria-label={`Remove ${item}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Exclude ingredients */}
          <div>
            <p
              className="text-sm font-bold mb-2"
              style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
            >
              Ingredients to avoid
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExclude()}
                placeholder="e.g. mushrooms, nuts..."
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <button
                onClick={addExclude}
                className="p-2 rounded-xl text-white transition-all hover:opacity-90 flex-shrink-0"
                style={{ background: 'var(--color-leaf)' }}
                aria-label="Add excluded ingredient"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(local.excludeIngredients ?? []).map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--color-peach)', color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
                >
                  {item}
                  <button
                    onClick={() => removeExclude(i)}
                    className="transition-opacity hover:opacity-60"
                    style={{ color: 'var(--color-bark)' }}
                    aria-label={`Remove ${item}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex gap-3 px-5 py-4 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--color-stone)' }}
        >
          <button
            onClick={handleClear}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-80"
            style={{ border: '1.5px solid var(--color-stone)', color: 'var(--color-bark)', background: 'transparent', fontFamily: 'Nunito, sans-serif' }}
          >
            Clear All
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-px"
            style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
