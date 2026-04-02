import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Users, ExternalLink, Flame } from 'lucide-react';
import DealPopup from '../components/DealPopup';
import SavingsBreakdown from '../components/SavingsBreakdown';
import MatchFeedbackButton from '../components/MatchFeedbackButton';
import { recipesApi } from '../services/api';
import { useApp } from '../App';

const SOURCE_META = {
  jamieoliver:   { label: 'Jamie Oliver',       logo: 'https://www.jamieoliver.com/favicon.ico' },
  recipetineats: { label: 'RecipeTin Eats',     logo: 'https://www.recipetineats.com/favicon.ico' },
  donnahay:      { label: 'Donna Hay',          logo: 'https://www.donnahay.com.au/favicon.ico' },
  womensweekly:  { label: "Women's Weekly Food", logo: 'https://www.womensweeklyfood.com.au/favicon.ico' },
};

// ── Ingredient helpers ────────────────────────────────────────────────────────

/**
 * Build grouped sections from the ingredients array.
 * Ingredients that are objects with isSubheading/isActive are from enriched recipes.
 * String ingredients (legacy) are treated as plain active items.
 */
function groupIngredients(raw) {
  const isObj = raw.length > 0 && typeof raw[0] === 'object';
  if (!isObj) {
    // Legacy string array — single ungrouped section
    return [{ heading: null, items: raw.map((s, i) => ({ text: s, globalIdx: i, isActive: true })) }];
  }

  const sections = [];
  let current = { heading: null, items: [] };

  raw.forEach((ing, i) => {
    if (ing.isActive === false) return; // hide admin-deactivated ingredients from users
    if (ing.isSubheading) {
      if (current.items.length > 0 || current.heading) sections.push(current);
      current = { heading: ing.name, items: [] };
    } else {
      const text = [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ') || ing.raw || '';
      current.items.push({ text, globalIdx: i, isActive: true });
    }
  });
  if (current.items.length > 0 || current.heading) sections.push(current);
  return sections;
}

function IngredientRow({ item, globalIdx, matchedDeals, openPopupIndex, setOpenPopupIndex, badgeRefs, closePopup, recipeId, recipeTitle }) {
  const deal    = findMatchedDeal(item.text, matchedDeals);
  const special = !!deal;
  const isOpen  = openPopupIndex === globalIdx;

  if (special) {
    return (
      <div className="relative">
        <button
          ref={(el) => { badgeRefs.current[globalIdx] = el; }}
          onClick={() => setOpenPopupIndex(isOpen ? null : globalIdx)}
          className="w-full text-left flex items-start gap-2 text-sm px-3 py-2 rounded-xl transition-colors cursor-pointer"
          style={{ background: 'var(--color-mist)', border: '1.5px solid var(--color-sprout)', fontFamily: 'Nunito, sans-serif' }}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
        >
          <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-text-green)' }} />
          <span className="font-semibold" style={{ color: 'var(--color-text-green)' }}>{item.text}</span>
          <span className="ml-auto flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 text-white" style={{ background: 'var(--color-berry)' }}>
            on special
          </span>
        </button>
        <div className="flex justify-end mt-0.5 pr-1">
          <MatchFeedbackButton
            recipeId={recipeId}
            recipeTitle={recipeTitle}
            ingredientName={deal.ingredient}
            productName={deal.dealName}
            store={deal.store}
          />
        </div>
        {isOpen && (
          <DealPopup deal={deal} anchorRef={{ current: badgeRefs.current[globalIdx] }} onClose={closePopup} />
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2 text-sm px-3 py-2 rounded-xl"
      style={{ background: '#ffffff', border: '1.5px solid var(--color-stone)', fontFamily: 'Nunito, sans-serif' }}
    >
      <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-stone)' }} />
      <span style={{ color: 'var(--color-bark)' }}>{item.text}</span>
    </div>
  );
}

function IngredientList({ ingredients, matchedDeals, openPopupIndex, setOpenPopupIndex, badgeRefs, closePopup, recipeId, recipeTitle }) {
  const sections = groupIngredients(ingredients);
  return (
    <div>
      <h2 className="mb-3" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '20px' }}>
        Ingredients
      </h2>
      {sections.map((section, si) => (
        <div key={si} className={si > 0 ? 'mt-4' : ''}>
          {section.heading && (
            <p className="text-xs font-extrabold uppercase tracking-wide mb-2"
              style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
              {section.heading}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {section.items.map((item) => (
              <IngredientRow
                key={item.globalIdx}
                item={item}
                globalIdx={item.globalIdx}
                matchedDeals={matchedDeals}
                openPopupIndex={openPopupIndex}
                setOpenPopupIndex={setOpenPopupIndex}
                badgeRefs={badgeRefs}
                closePopup={closePopup}
                recipeId={recipeId}
                recipeTitle={recipeTitle}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecipeDetailSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
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

function findMatchedDeal(ingredientLine, matchedDeals = []) {
  const line = ingredientLine.toLowerCase();
  return matchedDeals.find((deal) => {
    const ing = deal.ingredient.toLowerCase();
    return line.includes(ing) || ing.split(' ').some((w) => w.length > 3 && line.includes(w));
  }) || null;
}

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selectedStore } = useApp();

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openPopupIndex, setOpenPopupIndex] = useState(null);
  const [isDealsExpanded, setIsDealsExpanded] = useState(false);
  const badgeRefs = useRef({});

  const closePopup = useCallback(() => setOpenPopupIndex(null), []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

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

  if (loading) return <RecipeDetailSkeleton />;

  if (error || !recipe) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: 'var(--color-parchment)' }}
      >
        <p className="text-2xl mb-2">🍽️</p>
        <h2
          className="text-xl mb-2"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
        >
          Recipe not found
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
          {error || 'This recipe could not be loaded.'}
        </p>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-px"
          style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
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
    totalMealSaving,
    totalPerServingSaving,
  } = recipe;

  const displayIngredients = allIngredients.length > 0 ? allIngredients : ingredients;
  const displaySteps = steps.length > 0 ? steps : (instructions ? [instructions] : []);
  const totalTime = (prepTime ?? 0) + (cookTime ?? 0) || prepTime || cookTime || 30;

  const hasNutrition =
    nutrition &&
    (nutrition.calories > 0 || nutrition.protein > 0 || nutrition.carbs > 0 || nutrition.fat > 0);

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      {/* ── Hero image ──────────────────────────────────────────────────────── */}
      <div className="w-full h-56 sm:h-72 relative overflow-hidden" style={{ background: 'var(--color-mist)' }}>
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
          className="hero-fallback absolute inset-0 flex items-center justify-center text-5xl"
          style={{ display: image ? 'none' : 'flex', background: 'var(--color-mist)', color: 'var(--color-text-muted)' }}
        >
          🍽️
        </div>

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-sm font-bold transition-colors backdrop-blur-sm"
          style={{ background: 'rgba(92, 74, 53, 0.55)', fontFamily: 'Nunito, sans-serif' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Title */}
        <h1
          className="leading-tight"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: 'clamp(22px, 4vw, 28px)' }}
        >
          {title}
        </h1>

        {/* Source + original link */}
        {SOURCE_META[recipe.source] && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <img
                src={SOURCE_META[recipe.source].logo}
                alt={SOURCE_META[recipe.source].label}
                className="w-4 h-4 rounded-sm object-contain"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                Recipe from{' '}
                <span style={{ color: 'var(--color-bark)', fontWeight: 700 }}>
                  {SOURCE_META[recipe.source].label}
                </span>
              </span>
            </div>
            {sourceUrl && sourceUrl !== '#' && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View original recipe
              </a>
            )}
          </div>
        )}

        {/* Description */}
        {description && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
            {description}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="text-xs font-bold px-3 py-1 rounded-full"
                style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3">
          {[
            { icon: Clock, label: 'min', value: totalTime },
            { icon: Users, label: 'servings', value: servings ?? 4 },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="rounded-xl px-4 py-3 flex flex-col items-center min-w-[80px]"
              style={{ background: '#ffffff', border: '1.5px solid var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)' }}
            >
              <Icon className="w-5 h-5 mb-1" style={{ color: 'var(--color-text-muted)' }} />
              <span
                className="text-lg font-bold"
                style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
              >
                {value}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Savings breakdown */}
        {totalMealSaving > 0 && (
          <SavingsBreakdown
            totalMealSaving={totalMealSaving}
            totalPerServingSaving={totalPerServingSaving}
            servings={servings ?? 4}
            matchedDeals={matchedDeals}
            collapsed={true}
          />
        )}

        {/* Deal highlights (shopping tip) — collapsed by default */}
        {matchedDeals.length > 0 && (
          <div
            className="rounded-[20px] overflow-hidden"
            style={{ background: '#ffffff', border: '1.5px solid var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)' }}
          >
            <button
              onClick={() => setIsDealsExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-stone-50"
              style={{ fontFamily: 'Nunito, sans-serif' }}
              aria-expanded={isDealsExpanded}
            >
              <h2
                style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '18px' }}
              >
                This week's deals used
                <span
                  className="ml-2 text-sm font-bold px-2 py-0.5 rounded-full align-middle"
                  style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
                >
                  {matchedDeals.length}
                </span>
              </h2>
              <span
                className="text-lg transition-transform duration-200"
                style={{ color: 'var(--color-text-muted)', transform: isDealsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}
              >
                ▾
              </span>
            </button>

            {isDealsExpanded && (
              <div className="px-5 pb-4">
                <div className="space-y-2">
                  {matchedDeals.slice(0, 6).map((deal, i) => (
                    <div key={i} className="flex items-start justify-between gap-3">
                      {(deal.productImage || deal.image) && (
                        <img
                          src={deal.productImage || deal.image}
                          alt={deal.dealName}
                          className="w-12 h-12 rounded-xl object-contain flex-shrink-0"
                          style={{ border: '1px solid var(--color-stone)' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-semibold leading-snug truncate"
                          style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
                        >
                          {deal.dealName}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                        >
                          {deal.store && (
                            <span
                              className="inline-block mr-1.5 px-1.5 py-0.5 rounded-full text-white text-xs font-bold"
                              style={{ background: deal.store === 'woolworths' ? '#00843D' : deal.store === 'coles' ? '#E32726' : '#003087', fontSize: '12px' }}
                            >
                              {deal.store.charAt(0).toUpperCase() + deal.store.slice(1)}
                            </span>
                          )}
                          for recipe ingredient: {deal.ingredient}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {deal.price > 0 && (
                          <p
                            className="text-sm font-bold"
                            style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
                          >
                            ${deal.price.toFixed(2)}
                          </p>
                        )}
                        {deal.saving > 0 && (
                          <p
                            className="text-xs font-bold"
                            style={{ color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
                          >
                            save ${deal.saving.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {totalMealSaving > 0 && (
                  <p
                    className="text-sm font-bold mt-4 pt-3"
                    style={{ borderTop: '1px solid var(--color-stone)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    🛒 Up to ${matchedDeals.reduce((sum, d) => sum + (d.saving || 0), 0).toFixed(2)} off full price on all items
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ingredients */}
        {displayIngredients.length > 0 && (
          <IngredientList
            ingredients={displayIngredients}
            matchedDeals={matchedDeals}
            openPopupIndex={openPopupIndex}
            setOpenPopupIndex={setOpenPopupIndex}
            badgeRefs={badgeRefs}
            closePopup={closePopup}
            recipeId={recipe.id}
            recipeTitle={recipe.title}
          />
        )}

        {/* Steps */}
        {displaySteps.length > 0 && (
          <div>
            <h2
              className="mb-3"
              style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '20px' }}
            >
              Method
            </h2>
            <ol className="space-y-3">
              {displaySteps.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-xl px-4 py-3"
                  style={{ background: '#ffffff', border: '1.5px solid var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.06)' }}
                >
                  <span
                    className="flex-shrink-0 w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center text-white"
                    style={{ background: 'var(--color-leaf)' }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-sm leading-relaxed pt-0.5"
                    style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Nutrition */}
        {hasNutrition && (
          <div>
            <h2
              className="mb-3 flex items-center gap-2"
              style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '20px' }}
            >
              <Flame className="w-5 h-5" style={{ color: 'var(--color-honey)' }} />
              Nutrition (per serving)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Calories', value: nutrition.calories, unit: 'kcal' },
                { label: 'Protein',  value: nutrition.protein,  unit: 'g' },
                { label: 'Carbs',    value: nutrition.carbs,    unit: 'g' },
                { label: 'Fat',      value: nutrition.fat,      unit: 'g' },
              ]
                .filter((n) => n.value > 0)
                .map(({ label, value, unit }) => (
                  <div
                    key={label}
                    className="rounded-xl px-4 py-3 text-center"
                    style={{ background: '#ffffff', border: '1.5px solid var(--color-stone)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.06)' }}
                  >
                    <p className="text-lg font-bold" style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
                      {value}
                      <span className="text-xs font-normal ml-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {unit}
                      </span>
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                      {label}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* bottom spacer */}
        <div className="pb-4" />
      </div>
    </div>
  );
}
