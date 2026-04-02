import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChefHat, SlidersHorizontal, Crown, RefreshCw, AlertTriangle, ShoppingCart } from 'lucide-react';
import { useApp } from '../App';
import { dealsApi, recipesApi } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import CategorizedDeals from '../components/CategorizedDeals';
import PreferencesPanel from '../components/PreferencesPanel';
import { usePremium } from '../context/PremiumContext';

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

const STORE_COLORS = {
  woolworths: { bg: '#007833', light: '#e8f5e9', text: '#ffffff' },
  coles:      { bg: '#e31837', light: '#ffeaed', text: '#ffffff' },
  iga:        { bg: '#003da5', light: '#e8eeff', text: '#ffffff' },
};

const STORE_LOGOS = {
  woolworths: 'https://www.woolworths.com.au/favicon.ico',
  coles:      'https://www.coles.com.au/favicon.ico',
  iga:        'https://www.iga.com.au/favicon.ico',
};

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function DealSkeleton() {
  return (
    <div
      className="rounded-[20px] p-3 border"
      style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)' }}
    >
      <div className="skeleton h-4 w-3/4 mb-2" />
      <div className="skeleton h-3 w-1/2 mb-3" />
      <div className="skeleton h-5 w-1/4 ml-auto" />
    </div>
  );
}

function RecipeSkeleton() {
  return (
    <div
      className="rounded-[20px] overflow-hidden border"
      style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)' }}
    >
      <div className="skeleton aspect-video w-full" />
      <div className="p-4 space-y-2">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-3 w-3/5" />
        <div className="skeleton h-3 w-2/5" />
      </div>
    </div>
  );
}

export default function StorePage() {
  const { store } = useParams();
  const navigate = useNavigate();
  const { setSelectedStore } = useApp();
  const { isPremium } = usePremium();

  const [storeDeals, setStoreDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState(null); // null | 'warming' | 'network' | string
  const [dealsRetryCountdown, setDealsRetryCountdown] = useState(0);

  const [storeRecipes, setStoreRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [recipesError, setRecipesError] = useState(null);
  const [displayCount, setDisplayCount] = useState(6);
  const RECIPES_PER_PAGE = 6;

  const [activeTag, setActiveTag] = useState('all');
  const [activeProtein, setActiveProtein] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showPremiumNudge, setShowPremiumNudge] = useState(false);

  const colors = STORE_COLORS[store] || { bg: '#78716c', light: 'var(--color-blush)', text: '#ffffff' };
  const storeName = capitalize(store);

  // Countdown timer for deal retry
  useEffect(() => {
    if (dealsRetryCountdown <= 0) return;
    const t = setTimeout(() => setDealsRetryCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [dealsRetryCountdown]);

  const fetchStoreDeals = React.useCallback((retryCount = 0) => {
    if (!store) return;
    if (retryCount === 0) { setDealsLoading(true); setDealsError(null); }

    dealsApi.getDealsByStore(store)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.deals ?? []);
        setStoreDeals(list);
        setDealsError(null);
        setDealsLoading(false);
        setDealsRetryCountdown(0);
      })
      .catch((err) => {
        console.error('Failed to load store deals:', err);
        if (err.response?.status === 503 && retryCount < 4) {
          setDealsError('warming');
          setDealsRetryCountdown(15);
          setTimeout(() => fetchStoreDeals(retryCount + 1), 15000);
        } else {
          setDealsError(err.response?.status >= 500 ? 'network' : 'Could not load deals. Please try again.');
          setDealsLoading(false);
          setDealsRetryCountdown(0);
        }
      });
  }, [store]);

  useEffect(() => { fetchStoreDeals(0); }, [fetchStoreDeals]);

  useEffect(() => {
    if (!store) return;
    setRecipesLoading(true);
    setRecipesError(null);

    recipesApi.getRecipesForStore(store)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.recipes ?? []);
        setStoreRecipes(list);
      })
      .catch((err) => {
        console.error('Failed to load store recipes:', err);
        setStoreRecipes([]);
        if (err.response?.status === 503) {
          setRecipesError('warming');
        } else {
          setRecipesError('error');
        }
      })
      .finally(() => setRecipesLoading(false));
  }, [store]);

  const handleChangeStore = () => {
    setSelectedStore(null);
    navigate('/');
  };

  const filteredRecipes = useMemo(() => {
    let list = storeRecipes;
    if (activeTag !== 'all') {
      list = list.filter((r) =>
        (r.tags ?? []).some((t) => t.toLowerCase().includes(activeTag.toLowerCase()))
      );
    }
    if (activeProtein && isPremium) {
      list = list.filter((r) => hasProteinDeal(r, activeProtein));
    }
    return list;
  }, [storeRecipes, activeTag, activeProtein, isPremium]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      {/* ── Store header band ──────────────────────────────────────────────── */}
      <div
        className="w-full px-4 sm:px-6 lg:px-8 py-5"
        style={{ background: colors.bg, color: colors.text }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {STORE_LOGOS[store] && (
              <img
                src={STORE_LOGOS[store]}
                alt=""
                className="w-8 h-8 object-contain rounded flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div>
              <h1
                className="text-2xl sm:text-3xl"
                style={{ fontFamily: '"Fredoka One", sans-serif' }}
              >
                {storeName}
              </h1>
              {dealsLoading ? (
                <p className="text-sm opacity-80 mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Loading deals...
                </p>
              ) : (
                <p className="text-sm opacity-80 mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  {storeDeals.length} deal{storeDeals.length !== 1 ? 's' : ''} this week
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleChangeStore}
            className="flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-xl transition-opacity hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.2)', fontFamily: 'Nunito, sans-serif' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Change store
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

        {/* ── Section 1: Recipes ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2
              className="text-xl flex items-center gap-2"
              style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
            >
              <ChefHat className="w-5 h-5" style={{ color: colors.bg }} />
              Recipes Using These Deals
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!isPremium) { setShowPremiumNudge(true); return; }
                  setPanelOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
                style={{ background: isPremium ? 'var(--color-leaf)' : 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
              >
                {isPremium ? <SlidersHorizontal className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
                Filter
              </button>
              <Link
                to="/recipes"
                className="text-sm font-bold underline underline-offset-2 transition-colors hover:opacity-70 py-2.5"
                style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
              >
                View all →
              </Link>
            </div>
          </div>

          {/* Tag filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0 mb-3">
            {TAG_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setActiveTag(id); setDisplayCount(RECIPES_PER_PAGE); }}
                className={`tag-chip flex-shrink-0 ${activeTag === id ? 'active' : 'inactive'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Protein filter chips (premium only) */}
          {isPremium && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                  🥩 Filter by protein on special
                </span>
                {activeProtein && (
                  <button
                    onClick={() => { setActiveProtein(null); setDisplayCount(RECIPES_PER_PAGE); }}
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
                    onClick={() => { setActiveProtein(activeProtein === id ? null : id); setDisplayCount(RECIPES_PER_PAGE); }}
                    className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
                    style={{
                      borderWidth: '1.5px',
                      borderStyle: 'solid',
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

          {/* Premium nudge */}
          {showPremiumNudge && !isPremium && (
            <div
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm border mb-3"
              style={{ background: '#fffbf0', borderColor: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
            >
              <span style={{ color: 'var(--color-bark)' }}>
                <Crown className="w-3.5 h-3.5 inline mr-1.5" style={{ color: 'var(--color-honey)' }} />
                Personalised filters are a <strong>Premium</strong> feature.
              </span>
              <button onClick={() => setShowPremiumNudge(false)} style={{ color: 'var(--color-text-muted)' }}>✕</button>
            </div>
          )}

          {recipesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <RecipeSkeleton key={i} />
              ))}
            </div>
          ) : recipesError === 'warming' ? (
            <div
              className="rounded-[20px] border p-6 text-center"
              style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)', fontFamily: 'Nunito, sans-serif' }}
            >
              <ChefHat className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-honey)' }} />
              <p className="text-sm mb-1" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                Recipes are on the way
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                The server is loading this week's deals — recipes will appear shortly.
              </p>
            </div>
          ) : filteredRecipes.length === 0 && storeRecipes.length === 0 ? (
            <div
              className="rounded-[20px] border p-6 text-center"
              style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)', fontFamily: 'Nunito, sans-serif' }}
            >
              <p className="text-2xl mb-2">🍽️</p>
              <p className="text-sm font-bold mb-1" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                No strong matches this week
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Try a different store, or check back Wednesday when deals refresh.
              </p>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div
              className="rounded-[20px] p-6 text-center text-sm border border-dashed"
              style={{ background: colors.light, borderColor: 'var(--color-stone)', color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              <p>No recipes match this filter. Try a different tag.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecipes.slice(0, displayCount).map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe} />
                ))}
              </div>
              {displayCount < filteredRecipes.length ? (
                <div className="flex justify-center mt-6">
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
                  className="text-center text-sm mt-4"
                  style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                >
                  Showing all {filteredRecipes.length} recipes
                </p>
              ) : null}
            </>
          )}
        </section>

        {/* ── Section 2: Deals ──────────────────────────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2
              className="text-xl"
              style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
            >
              This Week's Deals at {storeName}
            </h2>
          </div>

          {dealsError === 'warming' ? (
            <div
              className="rounded-[20px] border p-6 text-center"
              style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)', fontFamily: 'Nunito, sans-serif' }}
            >
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 animate-spin" style={{ color: 'var(--color-honey)', animationDuration: '3s' }} />
              <p className="text-sm font-bold mb-1" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                Getting this week's specials ready
              </p>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Usually takes about 30 seconds on first load
              </p>
              {dealsRetryCountdown > 0 && (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Trying again in {dealsRetryCountdown}s...
                </p>
              )}
            </div>
          ) : dealsError === 'network' ? (
            <div
              className="rounded-[20px] border p-6 text-center"
              style={{ background: '#ffffff', borderColor: 'var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)', fontFamily: 'Nunito, sans-serif' }}
            >
              <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-honey)' }} />
              <p className="text-sm font-bold mb-1" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                Something went wrong on our end
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                The deals are still there — try refreshing!
              </p>
              <button
                onClick={() => fetchStoreDeals(0)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
            </div>
          ) : dealsError ? (
            <div
              className="rounded-[20px] p-4 text-sm mb-4 border"
              style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
            >
              {dealsError}
            </div>
          ) : dealsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <DealSkeleton key={i} />
              ))}
            </div>
          ) : storeDeals.length === 0 ? (
            <div
              className="text-center py-12"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              <p className="text-lg mb-1">No deals found for {storeName}.</p>
              <p className="text-sm">Check back later or try refreshing.</p>
            </div>
          ) : (
            <CategorizedDeals deals={storeDeals} />
          )}
        </section>
      </div>

      {/* Preferences panel — premium only */}
      {isPremium && (
        <PreferencesPanel
          isOpen={panelOpen}
          onClose={() => setPanelOpen(false)}
          onApply={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
