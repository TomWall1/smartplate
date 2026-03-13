import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChefHat } from 'lucide-react';
import { useApp } from '../App';
import { dealsApi, recipesApi } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import CategorizedDeals from '../components/CategorizedDeals';

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
      className="rounded-[20px] overflow-hidden flex-shrink-0 w-64 sm:w-auto border"
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

  const [storeDeals, setStoreDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState(null);

  const [storeRecipes, setStoreRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(6);
  const RECIPES_PER_PAGE = 6;

  const colors = STORE_COLORS[store] || { bg: '#78716c', light: 'var(--color-blush)', text: '#ffffff' };
  const storeName = capitalize(store);

  useEffect(() => {
    if (!store) return;
    setDealsLoading(true);
    setDealsError(null);

    dealsApi.getDealsByStore(store)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.deals ?? []);
        setStoreDeals(list);
      })
      .catch((err) => {
        console.error('Failed to load store deals:', err);
        setDealsError('Could not load deals. Please try again.');
      })
      .finally(() => setDealsLoading(false));
  }, [store]);

  useEffect(() => {
    if (!store) return;
    setRecipesLoading(true);

    recipesApi.getRecipesForStore(store)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.recipes ?? []);
        setStoreRecipes(list);
      })
      .catch((err) => {
        console.error('Failed to load store recipes:', err);
        setStoreRecipes([]);
      })
      .finally(() => setRecipesLoading(false));
  }, [store]);

  const handleChangeStore = () => {
    setSelectedStore(null);
    navigate('/');
  };

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
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2
              className="text-xl flex items-center gap-2"
              style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
            >
              <ChefHat className="w-5 h-5" style={{ color: colors.bg }} />
              Recipes Using These Deals
            </h2>
            <Link
              to="/recipes"
              className="text-sm font-bold underline underline-offset-2 transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              View all recipes →
            </Link>
          </div>

          {recipesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <RecipeSkeleton key={i} />
              ))}
            </div>
          ) : storeRecipes.length === 0 ? (
            <div
              className="rounded-[20px] p-6 text-center text-sm border border-dashed"
              style={{ background: colors.light, borderColor: 'var(--color-stone)', color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              <p>No recipes matched to {storeName} deals yet.</p>
              <p className="mt-1 text-xs">Check back after recipes are generated for the week.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {storeRecipes.slice(0, displayCount).map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe} />
                ))}
              </div>
              {displayCount < storeRecipes.length ? (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setDisplayCount((n) => Math.min(n + RECIPES_PER_PAGE, storeRecipes.length))}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
                    style={{ background: 'var(--color-leaf)', color: '#ffffff', fontFamily: 'Nunito, sans-serif' }}
                  >
                    Show more recipes ({storeRecipes.length - displayCount} remaining)
                  </button>
                </div>
              ) : storeRecipes.length > RECIPES_PER_PAGE ? (
                <p
                  className="text-center text-sm mt-4"
                  style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                >
                  Showing all {storeRecipes.length} recipes
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

          {dealsError && (
            <div
              className="rounded-[20px] p-4 text-sm mb-4 border"
              style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
            >
              {dealsError}
            </div>
          )}

          {dealsLoading ? (
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
    </div>
  );
}
