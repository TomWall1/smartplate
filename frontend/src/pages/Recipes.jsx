import React, { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useApp } from '../App';
import { recipesApi } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import PreferencesPanel from '../components/PreferencesPanel';

const TAG_FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'quick',      label: 'Quick' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan',      label: 'Vegan' },
  { id: 'meal prep',  label: 'Meal prep' },
  { id: 'breakfast',  label: 'Breakfast' },
  { id: 'lunch',      label: 'Lunch' },
  { id: 'dinner',     label: 'Dinner' },
];

function RecipeSkeleton() {
  return (
    <div className="rounded-[20px] overflow-hidden border" style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)' }}>
      <div className="skeleton aspect-video w-full" />
      <div className="p-4 space-y-2">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-3 w-3/5" />
        <div className="flex gap-2 mt-3">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

export default function Recipes() {
  const { weeklyRecipes, deals, preferences } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState('all');
  const [panelOpen, setPanelOpen] = useState(false);

  const [personalisedRecipes, setPersonalisedRecipes] = useState(null);
  const [personalisedLoading, setPersonalisedLoading] = useState(false);
  const [personalisedError, setPersonalisedError] = useState(null);
  const [isPersonalised, setIsPersonalised] = useState(false);

  const baseRecipes = isPersonalised && personalisedRecipes !== null
    ? personalisedRecipes
    : weeklyRecipes;

  const filteredRecipes = useMemo(() => {
    let list = baseRecipes;
    if (activeTag !== 'all') {
      list = list.filter((r) =>
        (r.tags ?? []).some((t) => t.toLowerCase().includes(activeTag.toLowerCase()))
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.title?.toLowerCase().includes(q) ||
          (r.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          (r.dealIngredients ?? []).some((i) => i.toLowerCase().includes(q))
      );
    }
    return list;
  }, [baseRecipes, activeTag, searchQuery]);

  const handleApplyPreferences = async (prefs) => {
    setPersonalisedLoading(true);
    setPersonalisedError(null);
    try {
      const ingredients = deals.map((d) => d.name);
      const data = await recipesApi.getRecipeSuggestions(
        ingredients,
        {
          dietary: prefs.dietary ?? [],
          maxPrepTime: prefs.maxPrepTime ? parseInt(prefs.maxPrepTime) : undefined,
          excludeIngredients: prefs.excludeIngredients ?? [],
        },
        prefs.pantryItems ?? []
      );
      const list = Array.isArray(data) ? data : (data?.recipes ?? []);
      setPersonalisedRecipes(list);
      setIsPersonalised(true);
    } catch (err) {
      console.error('Personalisation failed:', err);
      setPersonalisedError('Could not personalise recipes. Showing all results.');
    } finally {
      setPersonalisedLoading(false);
    }
  };

  const handleResetPersonalised = () => {
    setIsPersonalised(false);
    setPersonalisedRecipes(null);
    setPersonalisedError(null);
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1
            className="text-2xl sm:text-3xl"
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
          >
            This Week's Recipes
          </h1>
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
            style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Personalise
          </button>
        </div>

        {/* ── Search bar ───────────────────────────────────────────────────── */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            placeholder="Search recipes, ingredients or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl text-sm shadow-sm outline-none"
            style={{
              background: '#ffffff',
              border: '1.5px solid var(--color-stone)',
              color: 'var(--color-bark)',
              fontFamily: 'Nunito, sans-serif',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--color-leaf)';
              e.target.style.boxShadow = '0 0 0 3px rgba(125, 184, 122, 0.15)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--color-stone)';
              e.target.style.boxShadow = 'none';
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Tag filter row ────────────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 sm:mx-0 px-4 sm:px-0">
          {TAG_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTag(id)}
              className={`tag-chip flex-shrink-0 ${activeTag === id ? 'active' : 'inactive'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Personalised banner ───────────────────────────────────────────── */}
        {isPersonalised && personalisedRecipes !== null && !personalisedLoading && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm border"
            style={{ background: 'var(--color-blush)', borderColor: 'var(--color-honey)', color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-honey)' }} />
              Personalised for you · <strong>{personalisedRecipes.length}</strong> recipe
              {personalisedRecipes.length !== 1 ? 's' : ''} matched
            </span>
            <button
              onClick={handleResetPersonalised}
              className="underline underline-offset-2 whitespace-nowrap transition-opacity hover:opacity-70 font-bold"
              style={{ color: 'var(--color-text-green)' }}
            >
              Show all
            </button>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {personalisedError && (
          <div
            className="rounded-xl px-4 py-3 text-sm border"
            style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
          >
            {personalisedError}
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────────────── */}
        {(personalisedLoading || weeklyRecipes.length === 0) && !personalisedError ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <RecipeSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {filteredRecipes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredRecipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    showMatchReason={isPersonalised}
                  />
                ))}
              </div>
            ) : (
              <div
                className="text-center py-16"
                style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
              >
                <p className="text-2xl mb-2">🍽️</p>
                <p
                  className="text-lg font-bold mb-1"
                  style={{ color: 'var(--color-bark)' }}
                >
                  No recipes found
                </p>
                {searchQuery ? (
                  <>
                    <p className="text-sm mb-4">
                      No results for &ldquo;{searchQuery}&rdquo;
                    </p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-sm underline font-bold transition-opacity hover:opacity-70"
                      style={{ color: 'var(--color-leaf)' }}
                    >
                      Clear search
                    </button>
                  </>
                ) : activeTag !== 'all' ? (
                  <>
                    <p className="text-sm mb-4">
                      No recipes tagged &ldquo;{activeTag}&rdquo; this week.
                    </p>
                    <button
                      onClick={() => setActiveTag('all')}
                      className="text-sm underline font-bold transition-opacity hover:opacity-70"
                      style={{ color: 'var(--color-leaf)' }}
                    >
                      Show all recipes
                    </button>
                  </>
                ) : (
                  <p className="text-sm">
                    Recipes will appear here once deals are loaded.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <PreferencesPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        onApply={handleApplyPreferences}
      />
    </div>
  );
}
