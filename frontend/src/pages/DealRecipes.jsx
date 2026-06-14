import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { recipesApi } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import { STORE_COLORS } from '../constants/colors';

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Recipes linked to a single deal — reached by clicking a deal on the store
 * page. Lets customers shop by deal. Uses the same store-isolated recipe
 * source as StorePage, then filters to recipes whose matchedDeals include
 * this product.
 */
export default function DealRecipes() {
  const { store, dealName: rawDealName } = useParams();
  const navigate = useNavigate();
  const dealName = decodeURIComponent(rawDealName || '');

  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const colors = STORE_COLORS[store] || { bg: '#6B5F52', text: '#ffffff' };

  useEffect(() => {
    let active = true;
    setLoading(true);
    recipesApi
      .getRecipesForStore(store)
      .then((data) => { if (active) setRecipes(Array.isArray(data) ? data : (data?.recipes ?? [])); })
      .catch(() => { if (active) setRecipes([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [store]);

  const matching = useMemo(() => {
    const target = dealName.toLowerCase();
    return recipes.filter((r) =>
      (r.matchedDeals ?? []).some((d) => (d.dealName ?? '').toLowerCase() === target)
    );
  }, [recipes, dealName]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-5" style={{ background: colors.bg, color: colors.text }}>
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate(`/store/${store}`)}
            className="flex items-center gap-1.5 text-sm font-bold mb-2 transition-opacity hover:opacity-80"
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {capitalize(store)}
          </button>
          <p className="text-sm opacity-80" style={{ fontFamily: 'var(--font-ui)' }}>Recipes using</p>
          <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: 'var(--font-display)' }}>{dealName}</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--color-text-muted)' }}>Loading recipes…</p>
        ) : matching.length === 0 ? (
          <div
            className="rounded-[12px] border p-6 text-center"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-stone)', fontFamily: 'var(--font-ui)', color: 'var(--color-text-muted)' }}
          >
            No recipes use this deal this week.
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-ui)', color: 'var(--color-text-muted)' }}>
              {matching.length} recipe{matching.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {matching.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
