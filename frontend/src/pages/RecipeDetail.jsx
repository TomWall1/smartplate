import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Users,
  ExternalLink,
  Flame,
} from 'lucide-react';
import { recipesApi } from '../services/api';
import { useApp } from '../App';

// ── Skeleton layout ───────────────────────────────────────────────────────────
function RecipeDetailSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: '#ffffff' }}>
      <div className="skeleton w-full h-56 sm:h-72" style={{ borderRadius: 0 }} />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="skeleton h-8 w-3/4" />
        <div className="skeleton h-5 w-full" />
        <div className="skeleton h-5 w-5/6" />
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Find which matchedDeal corresponds to a display ingredient line ───────────
function findMatchedDeal(ingredientLine, matchedDeals = []) {
  const line = ingredientLine.toLowerCase();
  return matchedDeals.find(deal => {
    const ing = deal.ingredient.toLowerCase();
    // exact substring match, or any significant word from the ingredient appears in the line
    return line.includes(ing) || ing.split(' ').some(w => w.length > 3 && line.includes(w));
  }) || null;
}

// ── Build a store search URL for the ingredient ───────────────────────────────
function getStoreSearchUrl(ingredient, store) {
  const q = encodeURIComponent(ingredient);
  if (store === 'woolworths') return `https://www.woolworths.com.au/shop/search/products?searchTerm=${q}`;
  if (store === 'coles') return `https://www.coles.com.au/search?q=${q}`;
  if (store === 'iga') return `https://www.iga.com.au/search/?q=${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(ingredient + ' supermarket special')}`;
}

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selectedStore } = useApp();

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    recipesApi.getRecipeDetails(id, selectedStore)
      .then((data) => {
        if (!data) throw new Error('Recipe not found');
        setRecipe(data);
      })
      .catch((err) => {
        console.error('Failed to load recipe:', err);
        setError(err.message || 'Recipe not found');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleBack = () => {
    navigate(-1);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <RecipeDetailSkeleton />;

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !recipe) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#ffffff' }}>
        <p className="text-2xl mb-2">🍽️</p>
        <h2 className="text-xl font-bold text-stone-800 mb-2">Recipe not found</h2>
        <p className="text-stone-500 text-sm mb-6">
          {error || 'This recipe could not be loaded.'}
        </p>
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Recipes
        </button>
      </div>
    );
  }

  const {
    title,
    description,
    image,
    prepTime,
    cookTime,
    servings,
    matchedDeals = [],
    allIngredients = [],
    ingredients = [],
    steps = [],
    instructions,
    sourceUrl,
    nutrition,
    tags = [],
  } = recipe;

  const displayIngredients = allIngredients.length > 0 ? allIngredients : ingredients;
  const displaySteps = steps.length > 0 ? steps : (instructions ? [instructions] : []);
  const totalTime = (prepTime ?? 0) + (cookTime ?? 0) || prepTime || cookTime || 30;

  const hasNutrition =
    nutrition &&
    (nutrition.calories > 0 || nutrition.protein > 0 || nutrition.carbs > 0 || nutrition.fat > 0);

  return (
    <div className="min-h-screen" style={{ background: '#ffffff' }}>
      {/* ── Hero image ──────────────────────────────────────────────────────── */}
      <div className="w-full h-56 sm:h-72 bg-stone-200 relative overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.querySelector('.hero-fallback').style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="hero-fallback absolute inset-0 flex items-center justify-center text-5xl text-stone-400 bg-stone-200"
          style={{ display: image ? 'none' : 'flex' }}
        >
          🍽️
        </div>

        {/* Back button overlay */}
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 text-white text-sm font-medium hover:bg-black/60 transition-colors backdrop-blur-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-800 leading-tight">
          {title}
        </h1>

        {/* Description */}
        {description && (
          <p className="text-stone-600 text-sm leading-relaxed">{description}</p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span key={i} className="text-xs bg-stone-100 text-stone-500 px-2.5 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats bar — prep time and servings only */}
        <div className="flex gap-3">
          <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-stone-100 flex flex-col items-center min-w-[80px]">
            <Clock className="w-5 h-5 text-stone-400 mb-1" />
            <span className="text-lg font-bold text-stone-800">{totalTime}</span>
            <span className="text-xs text-stone-500">min</span>
          </div>
          <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-stone-100 flex flex-col items-center min-w-[80px]">
            <Users className="w-5 h-5 text-stone-400 mb-1" />
            <span className="text-lg font-bold text-stone-800">{servings ?? 4}</span>
            <span className="text-xs text-stone-500">servings</span>
          </div>
        </div>

        {/* Ingredients */}
        {displayIngredients.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-3">Ingredients</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {displayIngredients.map((ing, i) => {
                const deal = findMatchedDeal(ing, matchedDeals);
                const special = !!deal;
                const searchUrl = deal
                  ? getStoreSearchUrl(deal.ingredient, deal.store)
                  : null;

                const cardClasses = `flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${
                  special
                    ? 'bg-green-50 border border-green-100'
                    : 'bg-white border border-stone-100'
                }`;

                const inner = (
                  <>
                    <span
                      className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: special ? '#15803d' : '#d6d3d1' }}
                    />
                    <span className={special ? 'text-green-800 font-medium' : 'text-stone-700'}>
                      {ing}
                    </span>
                    {special && (
                      <span className="ml-auto flex items-center gap-1 text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                        on special
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    )}
                  </>
                );

                return special ? (
                  <a
                    key={i}
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${cardClasses} hover:border-green-300 hover:bg-green-100 transition-colors cursor-pointer`}
                    title={`Search for ${deal.ingredient} at ${deal.store}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={i} className={cardClasses}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Method / Steps */}
        {displaySteps.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-3">Method</h2>
            <ol className="space-y-3">
              {displaySteps.map((step, i) => (
                <li key={i} className="flex gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-stone-100">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-sm font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm text-stone-700 leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Nutrition info */}
        {hasNutrition && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              Nutrition (per serving)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Calories', value: nutrition.calories, unit: 'kcal' },
                { label: 'Protein', value: nutrition.protein, unit: 'g' },
                { label: 'Carbs', value: nutrition.carbs, unit: 'g' },
                { label: 'Fat', value: nutrition.fat, unit: 'g' },
              ]
                .filter((n) => n.value > 0)
                .map(({ label, value, unit }) => (
                  <div key={label} className="bg-white rounded-xl px-4 py-3 shadow-sm text-center border border-stone-100">
                    <p className="text-lg font-bold text-stone-800">
                      {value}
                      <span className="text-xs font-normal text-stone-500 ml-0.5">{unit}</span>
                    </p>
                    <p className="text-xs text-stone-500">{label}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Original recipe link */}
        {sourceUrl && sourceUrl !== '#' && (
          <div className="pt-2 pb-4">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View original recipe
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
