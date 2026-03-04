import React, { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useApp } from '../App';
import { recipesApi } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import PreferencesPanel from '../components/PreferencesPanel';

// ── Tag filter options ────────────────────────────────────────────────────────
const TAG_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'quick',     label: 'Quick' },
  { id: 'vegetarian',label: 'Vegetarian' },
  { id: 'vegan',     label: 'Vegan' },
  { id: 'meal prep', label: 'Meal prep' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch',     label: 'Lunch' },
  { id: 'dinner',    label: 'Dinner' },
];

// ── Skeleton recipe cards ─────────────────────────────────────────────────────
function RecipeSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
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

// ── Main component ────────────────────────────────────────────────────────────
export default function Recipes() {
  const { weeklyRecipes, deals, preferences } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState('all');
  const [panelOpen, setPanelOpen] = useState(false);

  // Personalised recipes: separate local state, not mutating global weeklyRecipes
  const [personalisedRecipes, setPersonalisedRecipes] = useState(null);
  const [personalisedLoading, setPersonalisedLoading] = useState(false);
  const [personalisedError, setPersonalisedError] = useState(null);
  const [isPersonalised, setIsPersonalised] = useState(false);

  // The active recipe list to display
  const baseRecipes = isPersonalised && personalisedRecipes !== null
    ? personalisedRecipes
    : weeklyRecipes;

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredRecipes = useMemo(() => {
    let list = baseRecipes;

    // Tag filter
    if (activeTag !== 'all') {
      list = list.filter((r) =>
        (r.tags ?? []).some((t) => t.toLowerCase().includes(activeTag.toLowerCase()))
      );
    }

    // Search filter
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

  // ── Personalise handler ───────────────────────────────────────────────────
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

  const loading = personalisedLoading || (weeklyRecipes.length === 0 && !personalisedLoading);
  const showLoading = personalisedLoading || (weeklyRecipes.length === 0 && !isPersonalised);

  return (
    <div className="min-h-screen" style={{ background: '#fef9f0' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-800">
            This Week's Recipes
          </h1>
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors shadow-sm"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Personalise
          </button>
        </div>

        {/* ── Search bar ───────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            placeholder="Search recipes, ingredients or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-stone-200 bg-white text-stone-700 placeholder-stone-400 text-sm shadow-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
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
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              Personalised for you &middot;{' '}
              <strong>{personalisedRecipes.length}</strong> recipe
              {personalisedRecipes.length !== 1 ? 's' : ''} matched
            </span>
            <button
              onClick={handleResetPersonalised}
              className="text-amber-700 underline underline-offset-2 whitespace-nowrap hover:text-amber-900 transition-colors"
            >
              Show all
            </button>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {personalisedError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
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
            {/* ── Recipe grid ────────────────────────────────────────────── */}
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
              /* ── Empty state ───────────────────────────────────────────── */
              <div className="text-center py-16 text-stone-500">
                <p className="text-2xl mb-2">🍽️</p>
                <p className="text-lg font-medium text-stone-700 mb-1">No recipes found</p>
                {searchQuery ? (
                  <>
                    <p className="text-sm mb-4">
                      No results for &ldquo;{searchQuery}&rdquo;
                    </p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-sm text-amber-600 underline hover:text-amber-800"
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
                      className="text-sm text-amber-600 underline hover:text-amber-800"
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

      {/* ── Preferences slide panel ───────────────────────────────────────── */}
      <PreferencesPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        onApply={handleApplyPreferences}
      />
    </div>
  );
}
