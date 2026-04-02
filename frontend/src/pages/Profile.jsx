import React, { useState, useEffect, useRef } from 'react';
import { Save, Check, User, RefreshCw, AlertCircle, MapPin, Loader2 } from 'lucide-react';
import { useApp } from '../App';
import { recipesApi, usersApi } from '../services/api';
import AllergenSelector from '../components/AllergenSelector';
import { useAuth } from '../context/AuthContext';

const DIETARY_OPTIONS = [
  { id: 'vegetarian',  label: 'Vegetarian' },
  { id: 'vegan',       label: 'Vegan' },
  { id: 'gluten-free', label: 'Gluten Free' },
  { id: 'dairy-free',  label: 'Dairy Free' },
  { id: 'low-carb',    label: 'Low Carb' },
  { id: 'keto',        label: 'Keto' },
];

const MEAL_TYPE_OPTIONS = [
  { id: 'quick',           label: 'Quick (under 30 min)' },
  { id: 'family-friendly', label: 'Family Friendly' },
  { id: 'batch-cook',      label: 'Good for Batch Cooking' },
  { id: 'one-pot',         label: 'One Pot Meals' },
  { id: 'healthy',         label: 'Healthy' },
  { id: 'comfort',         label: 'Comfort Food' },
];

const AU_STATES = [
  { id: 'nsw', label: 'NSW', full: 'New South Wales' },
  { id: 'vic', label: 'VIC', full: 'Victoria' },
  { id: 'qld', label: 'QLD', full: 'Queensland' },
  { id: 'wa',  label: 'WA',  full: 'Western Australia' },
  { id: 'sa',  label: 'SA',  full: 'South Australia' },
  { id: 'tas', label: 'TAS', full: 'Tasmania' },
  { id: 'act', label: 'ACT', full: 'Australian Capital Territory' },
  { id: 'nt',  label: 'NT',  full: 'Northern Territory' },
];

const cardStyle = {
  background: '#ffffff',
  border: '1.5px solid var(--color-stone)',
  borderRadius: '20px',
  boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)',
  padding: '24px',
};


export default function Profile() {
  const { preferences, setPreferences, userState, setUserState } = useApp();
  const { user } = useAuth();

  const [local, setLocal] = useState({ ...preferences });
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef(null);

  const [regenStatus, setRegenStatus] = useState('idle');
  const [regenResult, setRegenResult] = useState(null);

  // State selector
  const [stateStatus, setStateStatus] = useState('idle'); // idle | saving | saved | error
  const stateTimerRef = useRef(null);

  useEffect(() => {
    setLocal({ ...preferences });
  }, [preferences]);

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

  const handleDislikesChange = (newDislikes) => {
    setLocal((prev) => ({ ...prev, dislikes: newDislikes }));
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
    setSaved(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 3000);
  };

  const handleStateChange = async (stateId) => {
    if (stateId === userState) return;
    setStateStatus('saving');
    try {
      if (user) {
        await usersApi.updateState(stateId);
      }
      setUserState(stateId);
      setStateStatus('saved');
      clearTimeout(stateTimerRef.current);
      stateTimerRef.current = setTimeout(() => setStateStatus('idle'), 2500);
    } catch {
      setStateStatus('error');
      clearTimeout(stateTimerRef.current);
      stateTimerRef.current = setTimeout(() => setStateStatus('idle'), 3000);
    }
  };

  const CheckboxRow = ({ id, label, checked, onToggle }) => (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        className="w-5 h-5 rounded flex items-center justify-center transition-colors flex-shrink-0"
        style={{
          border: `2px solid ${checked ? 'var(--color-leaf)' : 'var(--color-stone)'}`,
          background: checked ? 'var(--color-leaf)' : 'transparent',
        }}
        onClick={() => onToggle(id)}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <input type="checkbox" checked={checked} onChange={() => onToggle(id)} className="sr-only" />
      <span className="text-sm" style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
        {label}
      </span>
    </label>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-[20px] flex items-center justify-center"
            style={{ background: 'var(--color-honey)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.1)' }}
          >
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '24px' }}>
              Your Preferences
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
              Customise your recipe recommendations
            </p>
          </div>
        </div>

        {/* ── Saved confirmation ─────────────────────────────────────────────── */}
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm border transition-all duration-300 ${
            saved ? 'opacity-100 max-h-12' : 'opacity-0 max-h-0 overflow-hidden border-0 p-0'
          }`}
          style={{ background: 'var(--color-mist)', borderColor: 'var(--color-leaf)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
          aria-live="polite"
        >
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>Preferences saved!</span>
        </div>

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2
                style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '18px' }}
              >
                Your Location
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                We'll show you deals from supermarkets in your state.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              {stateStatus === 'saving' && (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
              )}
              {stateStatus === 'saved' && (
                <span
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)' }}
                >
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
              {stateStatus === 'error' && (
                <span
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: '#FEE2E2', color: '#DC2626' }}
                >
                  <AlertCircle className="w-3 h-3" /> Failed
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {AU_STATES.map(({ id, label, full }) => {
              const isSelected = userState === id;
              return (
                <button
                  key={id}
                  onClick={() => handleStateChange(id)}
                  disabled={stateStatus === 'saving'}
                  title={full}
                  className="flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border-2 transition-all font-semibold disabled:opacity-50"
                  style={{
                    borderColor:  isSelected ? 'var(--color-leaf)' : 'var(--color-stone)',
                    background:   isSelected ? 'var(--color-leaf)' : '#ffffff',
                    color:        isSelected ? '#ffffff' : 'var(--color-bark)',
                    fontFamily:   'Nunito, sans-serif',
                    boxShadow:    isSelected ? '0 2px 8px rgba(125, 184, 122, 0.35)' : 'none',
                    transform:    isSelected ? 'translateY(-1px)' : 'none',
                  }}
                >
                  <span className="text-base font-extrabold leading-none">{label}</span>
                </button>
              );
            })}
          </div>

          {!user && (
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
              <MapPin className="w-3 h-3 inline mr-0.5 -mt-0.5" />
              Sign in to save your location between sessions.
            </p>
          )}
        </section>

        {/* ── Dietary ──────────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <h2
            className="mb-4"
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '18px' }}
          >
            Dietary Restrictions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {DIETARY_OPTIONS.map(({ id, label }) => (
              <CheckboxRow
                key={id}
                id={id}
                label={label}
                checked={(local.dietary ?? []).includes(id)}
                onToggle={toggleDietary}
              />
            ))}
          </div>
        </section>

        {/* ── Meal types ───────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <h2
            className="mb-4"
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '18px' }}
          >
            Preferred Meal Types
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {MEAL_TYPE_OPTIONS.map(({ id, label }) => (
              <CheckboxRow
                key={id}
                id={id}
                label={label}
                checked={(local.mealTypes ?? []).includes(id)}
                onToggle={toggleMealType}
              />
            ))}
          </div>
        </section>

        {/* ── Allergens & Exclusions ───────────────────────────────────────── */}
        <section style={cardStyle}>
          <h2
            className="mb-1"
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '18px' }}
          >
            Allergens &amp; Exclusions
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
            Select allergens or ingredients you want to avoid. Recipes containing these will be flagged or filtered out.
          </p>
          <AllergenSelector
            selected={local.dislikes ?? []}
            onChange={handleDislikesChange}
          />
        </section>

        {/* ── Admin: Regenerate Recipes ─────────────────────────────────────── */}
        <section style={cardStyle}>
          <h2
            className="mb-1"
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '18px' }}
          >
            Recipe Library
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
            Fetch the latest supermarket specials and regenerate this week's matched recipes.
            This takes 2–3 minutes.
          </p>

          {regenStatus === 'success' && (
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4 border"
              style={{ background: 'var(--color-mist)', borderColor: 'var(--color-leaf)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
            >
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Done! {regenResult?.recipeCount ?? '?'} recipes generated.</span>
            </div>
          )}

          {regenStatus === 'error' && (
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4 border"
              style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{regenResult?.error || 'Generation failed. Check the server logs.'}</span>
            </div>
          )}

          <button
            onClick={handleRegenerate}
            disabled={regenStatus === 'loading'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 hover:-translate-y-px shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-bark)', color: '#ffffff', fontFamily: 'Nunito, sans-serif' }}
          >
            <RefreshCw className={`w-4 h-4 ${regenStatus === 'loading' ? 'animate-spin' : ''}`} />
            {regenStatus === 'loading' ? 'Generating… (2–3 min)' : 'Regenerate Recipes'}
          </button>
        </section>

        {/* ── Save button ───────────────────────────────────────────────────── */}
        <div className="flex justify-end pb-4">
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
            style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
          >
            <Save className="w-4 h-4" />
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
