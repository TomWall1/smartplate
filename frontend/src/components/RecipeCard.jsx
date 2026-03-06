import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, DollarSign, Sparkles } from 'lucide-react';

const SOURCE_META = {
  jamieoliver:  { label: 'Jamie Oliver',   logo: 'https://www.jamieoliver.com/favicon.ico' },
  recipetineats: { label: 'RecipeTin Eats', logo: 'https://www.recipetineats.com/favicon.ico' },
};

export default function RecipeCard({ recipe, showMatchReason = false }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const dealIngredients = recipe.dealIngredients ?? [];
  const tags = recipe.tags ?? [];
  const prepTime = recipe.prepTime ?? recipe.cookTime ?? 30;
  const servings = recipe.servings ?? 4;
  const cost = recipe.totalEstimatedCost ?? 0;
  const saving = recipe.estimatedSaving ?? 0;

  // Up to 3 deal ingredient tags, then "+N more"
  const visibleDeals = dealIngredients.slice(0, 3);
  const extraDeals = dealIngredients.length > 3 ? dealIngredients.length - 3 : 0;

  // Up to 3 tag chips
  const visibleTags = tags.slice(0, 3);

  return (
    <div
      className="recipe-card bg-white rounded-2xl shadow-sm hover:shadow-md cursor-pointer overflow-hidden"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View recipe: ${recipe.title}`}
    >
      {/* Image */}
      <div className="aspect-video bg-stone-200 overflow-hidden relative">
        {recipe.image ? (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.querySelector('.fallback-emoji').style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="fallback-emoji absolute inset-0 flex items-center justify-center text-4xl text-stone-400"
          style={{ display: recipe.image ? 'none' : 'flex' }}
        >
          🍽️
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-stone-800 leading-snug line-clamp-2 mb-1">
          {recipe.title}
        </h3>

        {/* Match reason (personalised) */}
        {showMatchReason && recipe.matchReason && (
          <p className="text-sm italic text-amber-700 mt-1 mb-2">
            {recipe.matchReason}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 mb-3 text-xs text-stone-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {prepTime} min
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {servings}
          </span>
          {cost > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              ${cost.toFixed(2)}
            </span>
          )}
          {saving > 0 && (
            <span className="flex items-center gap-1 text-green-700 font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Save ${saving.toFixed(2)}
            </span>
          )}
        </div>

        {/* Deal ingredient tags */}
        {dealIngredients.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {visibleDeals.map((ing, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"
              >
                • {ing}
              </span>
            ))}
            {extraDeals > 0 && (
              <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                +{extraDeals} more
              </span>
            )}
          </div>
        )}

        {/* Tag chips */}
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {visibleTags.map((tag, i) => (
              <span
                key={i}
                className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Source attribution */}
        {SOURCE_META[recipe.source] && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-stone-100">
            <img
              src={SOURCE_META[recipe.source].logo}
              alt={SOURCE_META[recipe.source].label}
              className="w-3.5 h-3.5 rounded-sm object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span className="text-xs text-stone-400">{SOURCE_META[recipe.source].label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
