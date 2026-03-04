import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ChefHat } from 'lucide-react';
import { useApp } from '../App';
import { dealsApi } from '../services/api';
import DealCard from '../components/DealCard';
import RecipeCard from '../components/RecipeCard';

// Map store id → display color
const STORE_COLORS = {
  woolworths: { bg: '#007833', light: '#e8f5e9', text: '#ffffff' },
  coles:      { bg: '#e31837', light: '#ffeaed', text: '#ffffff' },
  iga:        { bg: '#003da5', light: '#e8eeff', text: '#ffffff' },
};

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Skeleton deal card ────────────────────────────────────────────────────────
function DealSkeleton() {
  return (
    <div className="bg-white rounded-xl p-3 border border-stone-100">
      <div className="skeleton h-4 w-3/4 mb-2" />
      <div className="skeleton h-3 w-1/2 mb-3" />
      <div className="skeleton h-5 w-1/4 ml-auto" />
    </div>
  );
}

// ── Skeleton recipe card ──────────────────────────────────────────────────────
function RecipeSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex-shrink-0 w-64 sm:w-auto">
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
  const { weeklyRecipes, setSelectedStore } = useApp();

  const [storeDeals, setStoreDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState(null);

  const colors = STORE_COLORS[store] || { bg: '#78716c', light: '#f5f5f4', text: '#ffffff' };
  const storeName = capitalize(store);

  // Fetch deals for this store
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

  // Filter weekly recipes that have at least one deal from this store
  const storeRecipes = weeklyRecipes
    .filter((r) =>
      r.matchedDeals?.some(
        (d) => (d.store || '').toLowerCase() === store
      )
    )
    .sort((a, b) => {
      const countA = a.matchedDeals?.filter(
        (d) => (d.store || '').toLowerCase() === store
      ).length ?? 0;
      const countB = b.matchedDeals?.filter(
        (d) => (d.store || '').toLowerCase() === store
      ).length ?? 0;
      return countB - countA;
    });

  const handleChangeStore = () => {
    setSelectedStore(null);
    navigate('/');
  };

  return (
    <div className="min-h-screen" style={{ background: '#fef9f0' }}>
      {/* ── Store header band ──────────────────────────────────────────────── */}
      <div
        className="w-full px-4 sm:px-6 lg:px-8 py-5"
        style={{ background: colors.bg, color: colors.text }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{storeName}</h1>
            {dealsLoading ? (
              <p className="text-sm opacity-80 mt-0.5">Loading deals...</p>
            ) : (
              <p className="text-sm opacity-80 mt-0.5">
                {storeDeals.length} deal{storeDeals.length !== 1 ? 's' : ''} this week
              </p>
            )}
          </div>
          <button
            onClick={handleChangeStore}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Change store
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

        {/* ── Section 1: Deals ──────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold text-stone-800 mb-4">
            This Week's Deals at {storeName}
          </h2>

          {dealsError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">
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
            <div className="text-center py-12 text-stone-500">
              <p className="text-lg mb-1">No deals found for {storeName}.</p>
              <p className="text-sm">Check back later or try refreshing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {storeDeals.map((deal, idx) => (
                <DealCard key={deal.id ?? idx} deal={deal} />
              ))}
            </div>
          )}
        </section>

        {/* ── Section 2: Recipes ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
              <ChefHat className="w-5 h-5" style={{ color: colors.bg }} />
              Recipes Using These Deals
            </h2>
            <Link
              to="/recipes"
              className="text-sm font-medium underline underline-offset-2 text-stone-500 hover:text-stone-800 transition-colors"
            >
              View all recipes →
            </Link>
          </div>

          {storeRecipes.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center text-sm text-stone-500 border border-dashed border-stone-300"
              style={{ background: colors.light }}
            >
              <p>No recipes matched to {storeName} deals yet.</p>
              <p className="mt-1 text-xs">Check back after recipes are generated for the week.</p>
            </div>
          ) : (
            <>
              {/* Horizontal scroll on mobile, grid on desktop */}
              <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible sm:pb-0 -mx-4 sm:mx-0 px-4 sm:px-0">
                {storeRecipes.map((recipe) => (
                  <div key={recipe.id} className="flex-shrink-0 w-64 sm:w-auto">
                    <RecipeCard recipe={recipe} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
