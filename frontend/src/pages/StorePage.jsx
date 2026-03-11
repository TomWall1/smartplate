import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChefHat, LayoutGrid, List } from 'lucide-react';
import { useApp } from '../App';
import { dealsApi, recipesApi } from '../services/api';
import DealCard from '../components/DealCard';
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
  const [viewMode, setViewMode] = useState('categorized'); // 'categorized' | 'list'

  const [storeRecipes, setStoreRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(true);

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
            <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible sm:pb-0 -mx-4 sm:mx-0 px-4 sm:px-0">
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
            <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible sm:pb-0 -mx-4 sm:mx-0 px-4 sm:px-0">
              {storeRecipes.map((recipe) => (
                <div key={recipe.id} className="flex-shrink-0 w-64 sm:w-auto">
                  <RecipeCard recipe={recipe} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Section 2: Deals ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2
              className="text-xl"
              style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
            >
              This Week's Deals at {storeName}
            </h2>

            {/* View mode toggle */}
            {!dealsLoading && storeDeals.length > 0 && (
              <div
                className="flex items-center rounded-xl overflow-hidden"
                style={{ border: '1.5px solid var(--color-stone)', background: '#ffffff' }}
              >
                <button
                  onClick={() => setViewMode('categorized')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    fontFamily: 'Nunito, sans-serif',
                    background: viewMode === 'categorized' ? 'var(--color-leaf)' : 'transparent',
                    color:      viewMode === 'categorized' ? '#ffffff' : 'var(--color-text-muted)',
                  }}
                  aria-pressed={viewMode === 'categorized'}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Categories
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    fontFamily: 'Nunito, sans-serif',
                    background: viewMode === 'list' ? 'var(--color-leaf)' : 'transparent',
                    color:      viewMode === 'list' ? '#ffffff' : 'var(--color-text-muted)',
                  }}
                  aria-pressed={viewMode === 'list'}
                >
                  <List className="w-3.5 h-3.5" />
                  All deals
                </button>
              </div>
            )}
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
          ) : viewMode === 'categorized' ? (
            <CategorizedDeals deals={storeDeals} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {storeDeals.map((deal, idx) => (
                <DealCard key={deal.id ?? idx} deal={deal} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
