import React, { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, Sparkles, X, Crown, RefreshCw, ShoppingCart, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../App';
import { recipesApi } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import PreferencesPanel from '../components/PreferencesPanel';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';

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

const PROTEIN_FILTERS = [
  { id: 'chicken', label: 'Chicken', keywords: ['chicken'] },
  { id: 'beef',    label: 'Beef',    keywords: ['beef', 'steak', 'brisket', 'sirloin', 'rump', 'scotch fillet', 'eye fillet', 'porterhouse', 'rib'] },
  { id: 'lamb',    label: 'Lamb',    keywords: ['lamb'] },
  { id: 'pork',    label: 'Pork',    keywords: ['pork'] },
  { id: 'mince',   label: 'Mince',   keywords: ['mince', 'minced'] },
  { id: 'salmon',  label: 'Salmon',  keywords: ['salmon'] },
  { id: 'fish',    label: 'Fish',    keywords: ['fish', 'barramundi', 'snapper', 'bream', 'whiting', 'flathead', 'cod', 'tuna', 'tilapia', 'trout'] },
  { id: 'seafood', label: 'Seafood', keywords: ['prawn', 'shrimp', 'scallop', 'calamari', 'squid', 'mussel', 'crab', 'lobster', 'octopus'] },
  { id: 'turkey',  label: 'Turkey',  keywords: ['turkey'] },
  { id: 'duck',    label: 'Duck',    keywords: ['duck'] },
  { id: 'veal',    label: 'Veal',    keywords: ['veal'] },
];

// Indicators that the deal is canned/processed, not fresh or frozen
const PROCESSED_INDICATORS = ['canned', 'tinned', 'stock', 'broth', 'soup', 'paste'];

function hasProteinDeal(recipe, proteinId) {
  if (!proteinId) return true;
  const protein = PROTEIN_FILTERS.find((p) => p.id === proteinId);
  if (!protein) return true;
  return (recipe.matchedDeals ?? []).some((deal) => {
    const name = ((deal.dealName || '') + ' ' + (deal.ingredient || '')).toLowerCase();
    if (PROCESSED_INDICATORS.some((ind) => name.includes(ind))) return false;
    return protein.keywords.some((kw) => name.includes(kw));
  });
}

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
  const { weeklyRecipes, deals, preferences, loading, dealsLoading, warmingUp, retryCountdown, apiError, retryFetch } = useApp();
  const { isPremium } = usePremium();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState('all');
  const [activeProtein, setActiveProtein] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showPremiumNudge, setShowPremiumNudge] = useState(false);

  const [personalisedRecipes, setPersonalisedRecipes] = useState(null);
  const [personalisedLoading, setPersonalisedLoading] = useState(false);
  const [personalisedError, setPersonalisedError] = useState(null);
  const [isPersonalised, setIsPersonalised] = useState(false);

  const RECIPES_PER_PAGE = 6;
  const [displayCount, setDisplayCount] = useState(RECIPES_PER_PAGE);

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

    // ── Client-side preference filters (cover the default non-personalised path) ──

    // 1. mealTypes — soft sort: recipes matching a preferred meal type come first.
    //    The personalised path does this server-side via Claude; we do it here for
    //    the default weekly view so preferences are always respected.
    const mealTypes = (preferences.mealTypes ?? []).map((m) => m.toLowerCase());
    if (mealTypes.length > 0 && !isPersonalised) {
      list = [
        ...list.filter((r) =>
          (r.tags ?? []).some((t) => mealTypes.includes(t.toLowerCase()))
        ),
        ...list.filter((r) =>
          !(r.tags ?? []).some((t) => mealTypes.includes(t.toLowerCase()))
        ),
      ];
    }

    // 2. excludeIngredients — soft sort + warning tag.
    //    Server already does this for the personalised path; we apply it here for both
    //    paths so the warning badges always appear.
    const excluded = (preferences.excludeIngredients ?? [])
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);

    if (excluded.length > 0) {
      list = list.map((r) => {
        if (r.excludedWarnings !== undefined) return r; // already tagged server-side
        const allText = [
          ...(r.allIngredients ?? []),
          ...(r.ingredients ?? []),
        ].join(' ').toLowerCase();
        const warnings = excluded.filter((ex) => allText.includes(ex));
        return { ...r, excludedWarnings: warnings };
      });
      list = [
        ...list.filter((r) => r.excludedWarnings.length === 0),
        ...list.filter((r) => r.excludedWarnings.length > 0),
      ];
    }

    // 3. Protein filter — premium only, must have a fresh/frozen matched deal for the protein
    if (activeProtein && isPremium) {
      list = list.filter((r) => hasProteinDeal(r, activeProtein));
    }

    return list;
  }, [baseRecipes, activeTag, activeProtein, searchQuery, preferences.mealTypes, preferences.excludeIngredients, isPersonalised, isPremium]);

  const handleApplyPreferences = async (prefs) => {
    setPersonalisedLoading(true);
    setPersonalisedError(null);
    try {
      const ingredients = deals.map((d) => d.name);
      const data = await recipesApi.getRecipeSuggestions(
        ingredients,
        {
          dietary:            prefs.dietary ?? [],
          mealTypes:          prefs.mealTypes ?? [],
          maxPrepTime:        prefs.maxPrepTime ? parseInt(prefs.maxPrepTime) : undefined,
          excludeIngredients: prefs.excludeIngredients ?? [],
        },
        [] // pantryItems removed
      );
      const list = Array.isArray(data) ? data : (data?.recipes ?? []);
      setPersonalisedRecipes(list);
      setIsPersonalised(true);
    } catch (err) {
      console.error('Personalisation failed:', err);
      const status = err?.response?.status;
      if (status === 403) {
        setPersonalisedError('Personalised recommendations require a Premium account. Upgrade to unlock this feature.');
        setShowPremiumNudge(true);
      } else {
        setPersonalisedError('Could not personalise recipes. Showing all results.');
      }
    } finally {
      setPersonalisedLoading(false);
    }
  };

  const handleResetPersonalised = () => {
    setIsPersonalised(false);
    setPersonalisedRecipes(null);
    setPersonalisedError(null);
    setDisplayCount(RECIPES_PER_PAGE);
  };

  // Reset pagination whenever the visible list changes
  const prevFilterKey = React.useRef('');
  const filterKey = `${activeTag}|${searchQuery}|${isPersonalised}`;
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    if (displayCount !== RECIPES_PER_PAGE) setDisplayCount(RECIPES_PER_PAGE);
  }

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
            onClick={() => {
              if (!isPremium) { setShowPremiumNudge(true); return; }
              setPanelOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
            style={{ background: isPremium ? 'var(--color-leaf)' : 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
          >
            {isPremium
              ? <SlidersHorizontal className="w-4 h-4" />
              : <Crown className="w-4 h-4" />}
            Personalise
          </button>
        </div>

        {/* ── Premium nudge (shown when non-premium clicks Personalise) ────── */}
        {showPremiumNudge && !isPremium && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm border"
            style={{ background: '#fffbf0', borderColor: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
          >
            <span className="flex items-center gap-2" style={{ color: 'var(--color-bark)' }}>
              <Crown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-honey)' }} />
              Personalised recommendations are a <strong>Premium</strong> feature ($9.99/month).
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                to="/premium"
                className="text-xs font-bold underline underline-offset-2"
                style={{ color: 'var(--color-honey)' }}
              >
                Upgrade
              </Link>
              <button
                onClick={() => setShowPremiumNudge(false)}
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

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
            className="w-full pl-10 pr-10 py-3 rounded-xl shadow-sm outline-none"
            style={{
              background: '#ffffff',
              border: '1.5px solid var(--color-stone)',
              color: 'var(--color-bark)',
              fontFamily: 'Nunito, sans-serif',
              fontSize: '16px',
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-opacity hover:opacity-70"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Clear search"
            >
              <X className="w-5 h-5" />
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

        {/* ── Protein filter row (premium only) ────────────────────────────── */}
        {isPremium && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-700" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>
                🥩 Filter by protein on special
              </span>
              {activeProtein && (
                <button
                  onClick={() => setActiveProtein(null)}
                  className="text-xs font-bold underline underline-offset-2"
                  style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 sm:mx-0 px-4 sm:px-0">
              {PROTEIN_FILTERS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveProtein(activeProtein === id ? null : id)}
                  className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
                  style={{
                    borderWidth: '1.5px',
                    borderColor: activeProtein === id ? 'var(--color-honey)' : 'var(--color-stone)',
                    background: activeProtein === id ? 'var(--color-honey)' : '#ffffff',
                    color: activeProtein === id ? '#ffffff' : 'var(--color-text-muted)',
                    fontFamily: 'Nunito, sans-serif',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

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

        {/* ── Loading: skeleton cards ─────────────────────────────────────── */}
        {personalisedLoading || (loading && weeklyRecipes.length === 0) ? (
          <div>
            <div className="text-center mb-6">
              <UtensilsCrossed
                className="w-8 h-8 mx-auto mb-2 animate-spin"
                style={{ color: 'var(--color-leaf)', animationDuration: '3s' }}
              />
              <p className="text-sm font-bold" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                Finding this week's best deals...
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <RecipeSkeleton key={i} />
              ))}
            </div>
          </div>

        ) : warmingUp && weeklyRecipes.length === 0 ? (
          /* ── Backend warming up: friendly message + countdown ────────── */
          <div
            className="rounded-[20px] border p-8 text-center"
            style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)', fontFamily: 'Nunito, sans-serif' }}
          >
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 animate-spin" style={{ color: 'var(--color-honey)', animationDuration: '3s' }} />
            <h3 className="text-lg mb-2" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
              Getting this week's specials ready
            </h3>
            <p className="text-sm mb-4 max-w-sm mx-auto" style={{ color: 'var(--color-text-muted)' }}>
              Usually takes about 30 seconds on first load — hang tight!
            </p>
            {retryCountdown > 0 && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Trying again in {retryCountdown} second{retryCountdown !== 1 ? 's' : ''}...
              </p>
            )}
          </div>

        ) : apiError && weeklyRecipes.length === 0 ? (
          /* ── API error: retry button ────────────────────────────────── */
          <div
            className="rounded-[20px] border p-8 text-center"
            style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)', fontFamily: 'Nunito, sans-serif' }}
          >
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-honey)' }} />
            <h3 className="text-lg mb-2" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
              Something went wrong on our end
            </h3>
            <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--color-text-muted)' }}>
              The deals are still there — try refreshing!
            </p>
            <button
              onClick={retryFetch}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-px"
              style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>

        ) : !loading && weeklyRecipes.length === 0 && !personalisedError ? (
          /* ── No recipes matched ─────────────────────────────────────── */
          <div
            className="rounded-[20px] border p-8 text-center"
            style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)', fontFamily: 'Nunito, sans-serif' }}
          >
            <p className="text-3xl mb-3">🍽️</p>
            <h3 className="text-lg mb-2" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
              No strong matches this week
            </h3>
            <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: 'var(--color-text-muted)' }}>
              Try selecting a different store, or check back Wednesday when deals refresh.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-px"
              style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
            >
              <ShoppingCart className="w-4 h-4" />
              Pick a store
            </Link>
          </div>

        ) : (
          <>
            {filteredRecipes.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filteredRecipes.slice(0, displayCount).map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      showMatchReason={isPersonalised}
                    />
                  ))}
                </div>

                {/* Pagination controls */}
                {displayCount < filteredRecipes.length ? (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <button
                      onClick={() => setDisplayCount((n) => Math.min(n + RECIPES_PER_PAGE, filteredRecipes.length))}
                      className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
                      style={{ background: 'var(--color-leaf)', color: '#ffffff', fontFamily: 'Nunito, sans-serif' }}
                    >
                      Show more recipes ({filteredRecipes.length - displayCount} remaining)
                    </button>
                  </div>
                ) : filteredRecipes.length > RECIPES_PER_PAGE ? (
                  <p
                    className="text-center text-sm pt-2"
                    style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    Showing all {filteredRecipes.length} recipes
                  </p>
                ) : null}

                {/* Upsell banner for free-tier users at end of results */}
                {!isPremium && filteredRecipes.length > 0 && displayCount >= filteredRecipes.length && (
                  <div
                    className="rounded-[20px] border p-5 text-center"
                    style={{ background: '#fffbf0', borderColor: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    <Crown className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--color-honey)' }} />
                    <p className="font-bold text-sm mb-1" style={{ color: 'var(--color-bark)' }}>
                      You're seeing {filteredRecipes.length} recipes — upgrade to see 100 more
                    </p>
                    <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                      Premium members get 150 AI-matched recipes weekly, plus the pantry matcher and meal planning.
                    </p>
                    <Link
                      to="/premium"
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                      style={{ background: 'var(--color-honey)' }}
                    >
                      <Crown className="w-4 h-4" />
                      Upgrade to Premium — $9.99/month
                    </Link>
                  </div>
                )}
              </>
            ) : (
              /* ── Filtered to zero (search/tag produced no results) ───── */
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
