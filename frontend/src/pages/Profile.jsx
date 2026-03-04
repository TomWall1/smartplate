import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, X, Check, User, RefreshCw, AlertCircle } from 'lucide-react';
import { useApp } from '../App';
import { recipesApi } from '../services/api';

const DIETARY_OPTIONS = [
  { id: 'vegetarian',  label: 'Vegetarian' },
  { id: 'vegan',       label: 'Vegan' },
  { id: 'gluten-free', label: 'Gluten Free' },
  { id: 'dairy-free',  label: 'Dairy Free' },
  { id: 'low-carb',    label: 'Low Carb' },
  { id: 'keto',        label: 'Keto' },
];

const MEAL_TYPE_OPTIONS = [
  { id: 'quick',          label: 'Quick (under 30 min)' },
  { id: 'family-friendly',label: 'Family Friendly' },
  { id: 'batch-cook',     label: 'Good for Batch Cooking' },
  { id: 'one-pot',        label: 'One Pot Meals' },
  { id: 'healthy',        label: 'Healthy' },
  { id: 'comfort',        label: 'Comfort Food' },
];

export default function Profile() {
  const { preferences, setPreferences } = useApp();

  const [local, setLocal] = useState({ ...preferences });
  const [newPantryItem, setNewPantryItem] = useState('');
  const [newDislike, setNewDislike] = useState('');
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef(null);

  const [regenStatus, setRegenStatus] = useState('idle'); // idle | loading | success | error
  const [regenResult, setRegenResult] = useState(null);

  // Sync local state if context preferences change externally
  useEffect(() => {
    setLocal({ ...preferences });
  }, [preferences]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleDietary = (id) => {
    setLocal((prev) => ({
      ...prev,
      dietary: (prev.dietary ?? []).includes(id)
        ? (prev.dietary ?? []).filter((d) => d !== id)
        : [...(prev.dietary ?? []), id],
    }));
  };

  const toggleMealType = (id) => {
    setLocal((prev) => ({
      ...prev,
      mealTypes: (prev.mealTypes ?? []).includes(id)
        ? (prev.mealTypes ?? []).filter((m) => m !== id)
        : [...(prev.mealTypes ?? []), id],
    }));
  };

  const addPantryItem = () => {
    const val = newPantryItem.trim();
    if (!val) return;
    setLocal((prev) => ({
      ...prev,
      pantryItems: [...(prev.pantryItems ?? []), val],
    }));
    setNewPantryItem('');
  };

  const removePantryItem = (item) => {
    setLocal((prev) => ({
      ...prev,
      pantryItems: (prev.pantryItems ?? []).filter((i) => i !== item),
    }));
  };

  const addDislike = () => {
    const val = newDislike.trim();
    if (!val) return;
    setLocal((prev) => ({
      ...prev,
      dislikes: [...(prev.dislikes ?? []), val],
    }));
    setNewDislike('');
  };

  const removeDislike = (item) => {
    setLocal((prev) => ({
      ...prev,
      dislikes: (prev.dislikes ?? []).filter((i) => i !== item),
    }));
  };

  const handleRegenerate = async () => {
    setRegenStatus('loading');
    setRegenResult(null);
    try {
      const data = await recipesApi.generateWeekly();
      setRegenResult({ recipeCount: data.recipeCount });
      setRegenStatus('success');
    } catch (err) {
      setRegenResult({ error: err.message || 'Generation failed' });
      setRegenStatus('error');
    }
  };

  const handleSave = () => {
    setPreferences(local);

    // Show success message, fade after 3 seconds
    setSaved(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="min-h-screen" style={{ background: '#ffffff' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-sm">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">Your Preferences</h1>
            <p className="text-sm text-stone-500">Customise your recipe recommendations</p>
          </div>
        </div>

        {/* ── Saved confirmation ────────────────────────────────────────────── */}
        <div
          className={`flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 transition-all duration-300 ${
            saved ? 'opacity-100 max-h-12' : 'opacity-0 max-h-0 overflow-hidden border-0 p-0'
          }`}
          aria-live="polite"
        >
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>Preferences saved!</span>
        </div>

        {/* ── Card: Dietary ─────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-base font-bold text-stone-800 mb-4">Dietary Restrictions</h2>
          <div className="grid grid-cols-2 gap-3">
            {DIETARY_OPTIONS.map(({ id, label }) => {
              const checked = (local.dietary ?? []).includes(id);
              return (
                <label key={id} className="flex items-center gap-2.5 cursor-pointer group">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      checked
                        ? 'bg-amber-500 border-amber-500'
                        : 'border-stone-300 group-hover:border-amber-400'
                    }`}
                    onClick={() => toggleDietary(id)}
                  >
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDietary(id)}
                    className="sr-only"
                  />
                  <span className="text-sm text-stone-700 select-none">{label}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* ── Card: Meal types ──────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-base font-bold text-stone-800 mb-4">Preferred Meal Types</h2>
          <div className="grid grid-cols-2 gap-3">
            {MEAL_TYPE_OPTIONS.map(({ id, label }) => {
              const checked = (local.mealTypes ?? []).includes(id);
              return (
                <label key={id} className="flex items-center gap-2.5 cursor-pointer group">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      checked
                        ? 'bg-amber-500 border-amber-500'
                        : 'border-stone-300 group-hover:border-amber-400'
                    }`}
                    onClick={() => toggleMealType(id)}
                  >
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMealType(id)}
                    className="sr-only"
                  />
                  <span className="text-sm text-stone-700 select-none">{label}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* ── Card: Pantry items ────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-base font-bold text-stone-800 mb-4">Pantry Items I Have</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newPantryItem}
              onChange={(e) => setNewPantryItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
              placeholder="Add pantry item..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder-stone-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
            <button
              onClick={addPantryItem}
              className="p-2.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              aria-label="Add pantry item"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(local.pantryItems ?? []).map((item, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 text-sm px-3 py-1 rounded-full border border-amber-200"
              >
                {item}
                <button
                  onClick={() => removePantryItem(item)}
                  className="text-amber-500 hover:text-amber-800 transition-colors"
                  aria-label={`Remove ${item}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            {(local.pantryItems ?? []).length === 0 && (
              <p className="text-sm text-stone-400 italic">No pantry items added yet.</p>
            )}
          </div>
        </section>

        {/* ── Card: Dislikes ────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-base font-bold text-stone-800 mb-4">Ingredients I Don't Like</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newDislike}
              onChange={(e) => setNewDislike(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDislike()}
              placeholder="Add disliked ingredient..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder-stone-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
            <button
              onClick={addDislike}
              className="p-2.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              aria-label="Add disliked ingredient"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(local.dislikes ?? []).map((item, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 bg-red-50 text-red-800 text-sm px-3 py-1 rounded-full border border-red-100"
              >
                {item}
                <button
                  onClick={() => removeDislike(item)}
                  className="text-red-400 hover:text-red-700 transition-colors"
                  aria-label={`Remove ${item}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            {(local.dislikes ?? []).length === 0 && (
              <p className="text-sm text-stone-400 italic">No dislikes added yet.</p>
            )}
          </div>
        </section>

        {/* ── Card: Admin — Regenerate Recipes ─────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-base font-bold text-stone-800 mb-1">Recipe Library</h2>
          <p className="text-sm text-stone-500 mb-4">
            Fetch the latest supermarket specials and regenerate this week's matched recipes.
            This takes 2–3 minutes.
          </p>

          {regenStatus === 'success' && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Done! {regenResult?.recipeCount ?? '?'} recipes generated.</span>
            </div>
          )}

          {regenStatus === 'error' && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{regenResult?.error || 'Generation failed. Check the server logs.'}</span>
            </div>
          )}

          <button
            onClick={handleRegenerate}
            disabled={regenStatus === 'loading'}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-800 text-white rounded-xl font-semibold text-sm hover:bg-stone-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${regenStatus === 'loading' ? 'animate-spin' : ''}`} />
            {regenStatus === 'loading' ? 'Generating… (2–3 min)' : 'Regenerate Recipes'}
          </button>
        </section>

        {/* ── Save button ───────────────────────────────────────────────────── */}
        <div className="flex justify-end pb-4">
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm hover:bg-amber-600 transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
