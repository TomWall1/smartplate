import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../services/api';

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten-free', label: 'Gluten-free' },
  { id: 'dairy-free', label: 'Dairy-free' },
];

const PREP_TIME_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
];

export default function PreferencesPanel({ isOpen, onClose, onApply }) {
  const { preferences, setPreferences } = useApp();
  const { user } = useAuth();

  // Local copy of preferences for editing
  const [local, setLocal] = useState({ ...preferences });
  const [pantryInput, setPantryInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');

  // Sync from context whenever panel opens
  useEffect(() => {
    if (isOpen) {
      setLocal({ ...preferences });
      setPantryInput('');
      setExcludeInput('');
    }
  }, [isOpen, preferences]);

  // ── Dietary checkboxes ────────────────────────────────────────────────────
  const toggleDietary = (id) => {
    setLocal((prev) => ({
      ...prev,
      dietary: prev.dietary?.includes(id)
        ? prev.dietary.filter((d) => d !== id)
        : [...(prev.dietary ?? []), id],
    }));
  };

  // ── Pantry items ──────────────────────────────────────────────────────────
  const addPantryItem = () => {
    const val = pantryInput.trim();
    if (!val) return;
    setLocal((prev) => ({
      ...prev,
      pantryItems: [...(prev.pantryItems ?? []), val],
    }));
    setPantryInput('');
  };

  const removePantryItem = (idx) => {
    setLocal((prev) => ({
      ...prev,
      pantryItems: (prev.pantryItems ?? []).filter((_, i) => i !== idx),
    }));
  };

  // ── Exclude ingredients ───────────────────────────────────────────────────
  const addExclude = () => {
    const val = excludeInput.trim();
    if (!val) return;
    setLocal((prev) => ({
      ...prev,
      excludeIngredients: [...(prev.excludeIngredients ?? []), val],
    }));
    setExcludeInput('');
  };

  const removeExclude = (idx) => {
    setLocal((prev) => ({
      ...prev,
      excludeIngredients: (prev.excludeIngredients ?? []).filter((_, i) => i !== idx),
    }));
  };

  // ── Clear / Apply ─────────────────────────────────────────────────────────
  const handleClear = () => {
    const cleared = {
      dietary: [],
      dislikes: [],
      pantryItems: [],
      mealTypes: [],
      maxPrepTime: '',
      excludeIngredients: [],
    };
    setLocal(cleared);
  };

  const handleApply = () => {
    setPreferences(local);
    // Persist dietary + excluded ingredients to Supabase when logged in (fire-and-forget)
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-stone-800">Personalise Recipes</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* ── Dietary ─────────────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold text-stone-700 mb-2">Dietary</p>
            <div className="grid grid-cols-2 gap-2">
              {DIETARY_OPTIONS.map(({ id, label }) => {
                const checked = (local.dietary ?? []).includes(id);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 cursor-pointer text-sm text-stone-700"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDietary(id)}
                      className="rounded border-stone-300 text-amber-500 focus:ring-amber-400"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── Max prep time ────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Max prep time
            </label>
            <select
              value={local.maxPrepTime ?? ''}
              onChange={(e) =>
                setLocal((prev) => ({ ...prev, maxPrepTime: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm text-stone-700 focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
            >
              {PREP_TIME_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* ── Pantry items ─────────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold text-stone-700 mb-2">
              Ingredients I have at home
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={pantryInput}
                onChange={(e) => setPantryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
                placeholder="e.g. rice, eggs..."
                className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <button
                onClick={addPantryItem}
                className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                aria-label="Add pantry item"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(local.pantryItems ?? []).map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 text-xs px-2.5 py-1 rounded-full"
                >
                  {item}
                  <button
                    onClick={() => removePantryItem(i)}
                    className="text-stone-400 hover:text-stone-700"
                    aria-label={`Remove ${item}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* ── Exclude ingredients ──────────────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold text-stone-700 mb-2">
              Ingredients to avoid
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExclude()}
                placeholder="e.g. mushrooms, nuts..."
                className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <button
                onClick={addExclude}
                className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                aria-label="Add excluded ingredient"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(local.excludeIngredients ?? []).map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2.5 py-1 rounded-full"
                >
                  {item}
                  <button
                    onClick={() => removeExclude(i)}
                    className="text-red-400 hover:text-red-700"
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
        <div className="flex gap-3 px-5 py-4 border-t border-stone-200 flex-shrink-0">
          <button
            onClick={handleClear}
            className="flex-1 px-4 py-2.5 rounded-xl border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
