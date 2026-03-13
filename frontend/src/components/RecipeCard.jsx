import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, DollarSign, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import SavingsBreakdown from './SavingsBreakdown';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';
import { premiumApi } from '../services/api';

const SOURCE_META = {
  jamieoliver:   { label: 'Jamie Oliver',       logo: 'https://www.jamieoliver.com/favicon.ico' },
  recipetineats: { label: 'RecipeTin Eats',     logo: 'https://www.recipetineats.com/favicon.ico' },
  donnahay:      { label: 'Donna Hay',          logo: 'https://www.donnahay.com.au/favicon.ico' },
  womensweekly:  { label: "Women's Weekly Food", logo: 'https://www.womensweeklyfood.com.au/favicon.ico' },
};

export default function RecipeCard({ recipe, showMatchReason = false, isFavorited = false, onFavoriteChange }) {
  const navigate = useNavigate();
  const { isPremium } = usePremium();
  const { user } = useAuth();
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [favorited, setFavorited] = useState(isFavorited);
  const [favLoading, setFavLoading] = useState(false);
  const [showFavTooltip, setShowFavTooltip] = useState(false);

  const handleFavorite = useCallback(async (e) => {
    e.stopPropagation();
    if (!user) { navigate('/auth'); return; }
    if (!isPremium) { navigate('/premium'); return; }

    setFavLoading(true);
    try {
      if (favorited) {
        await premiumApi.removeFavorite(recipe.id);
        setFavorited(false);
      } else {
        const snapshot = {
          title:    recipe.title,
          image:    recipe.image,
          tags:     recipe.tags,
          prepTime: recipe.prepTime ?? recipe.cookTime,
          servings: recipe.servings,
          source:   recipe.source,
        };
        await premiumApi.addFavorite(recipe.id, snapshot);
        setFavorited(true);
      }
      onFavoriteChange?.(recipe.id, !favorited);
    } catch (err) {
      console.error('Favorite toggle failed:', err.message);
    } finally {
      setFavLoading(false);
    }
  }, [favorited, recipe, user, isPremium, navigate, onFavoriteChange]);

  const handleClick = () => navigate(`/recipes/${recipe.id}`);
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
  const totalMealSaving = recipe.totalMealSaving ?? null;
  const totalPerServingSaving = recipe.totalPerServingSaving ?? null;
  const matchedDeals = recipe.matchedDeals ?? [];

  const excludedWarnings = recipe.excludedWarnings ?? [];
  const visibleDeals = dealIngredients.slice(0, 3);
  const extraDeals = dealIngredients.length > 3 ? dealIngredients.length - 3 : 0;
  const visibleTags = tags.slice(0, 3);

  return (
    <div
      className="recipe-card rounded-[20px] cursor-pointer overflow-hidden"
      style={{ background: '#ffffff' }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View recipe: ${recipe.title}`}
    >
      {/* Image */}
      <div className="aspect-video overflow-hidden relative" style={{ background: 'var(--color-mist)' }}>
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
          className="fallback-emoji absolute inset-0 flex items-center justify-center text-4xl"
          style={{ display: recipe.image ? 'none' : 'flex', color: 'var(--color-text-muted)' }}
        >
          🍽️
        </div>
        {/* Favourite button — shown when logged in */}
        {user && (
          <button
            onClick={handleFavorite}
            disabled={favLoading}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-sm"
            style={{ background: favorited ? 'var(--color-berry)' : 'rgba(255,255,255,0.9)' }}
            aria-label={favorited ? 'Remove from favourites' : 'Save to favourites'}
          >
            <Heart
              className="w-4 h-4"
              style={{ color: favorited ? '#ffffff' : 'var(--color-berry)' }}
              fill={favorited ? '#ffffff' : 'none'}
            />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Title */}
        <h3
          className="leading-snug line-clamp-2 mb-1"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '17px' }}
        >
          {recipe.title}
        </h3>

        {/* Match reason */}
        {showMatchReason && recipe.matchReason && (
          <p
            className="text-sm italic mt-1 mb-2"
            style={{ color: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
          >
            {recipe.matchReason}
          </p>
        )}

        {/* Stats row */}
        <div
          className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 mb-3 text-xs"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif', fontWeight: 600 }}
        >
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
          {(totalMealSaving ?? saving) > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setBreakdownOpen((o) => !o); }}
              className="inline-flex items-center gap-1 font-bold rounded-full px-2 py-0.5 transition-colors"
              style={{
                background: breakdownOpen ? 'var(--color-mist)' : 'transparent',
                color: 'var(--color-text-green)',
                border: breakdownOpen ? '1px solid var(--color-sprout)' : '1px solid transparent',
                fontFamily: 'Nunito, sans-serif',
                fontSize: '12px',
              }}
              aria-label="Show savings breakdown"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Save ${(totalMealSaving ?? saving).toFixed(2)}/meal
              {breakdownOpen
                ? <ChevronUp  className="w-3 h-3 ml-0.5" />
                : <ChevronDown className="w-3 h-3 ml-0.5" />
              }
            </button>
          )}
        </div>

        {/* Deal ingredient tags */}
        {dealIngredients.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {visibleDeals.map((ing, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 text-xs font-bold px-3 py-0.5 rounded-full"
                style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
              >
                • {ing}
              </span>
            ))}
            {extraDeals > 0 && (
              <span
                className="text-xs font-bold px-3 py-0.5 rounded-full"
                style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
              >
                +{extraDeals} more
              </span>
            )}
          </div>
        )}

        {/* Inline savings breakdown (expanded from badge) */}
        {breakdownOpen && totalMealSaving > 0 && (
          <div className="mb-2" onClick={(e) => e.stopPropagation()}>
            <SavingsBreakdown
              totalMealSaving={totalMealSaving}
              totalPerServingSaving={totalPerServingSaving}
              servings={servings}
              matchedDeals={matchedDeals}
              collapsed={false}
            />
          </div>
        )}

        {/* Tag chips */}
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {visibleTags.map((tag, i) => (
              <span
                key={i}
                className="text-xs font-bold px-3 py-0.5 rounded-full"
                style={{ background: 'var(--color-blush)', color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Source */}
        {SOURCE_META[recipe.source] && (
          <div
            className="flex items-center gap-1.5 pt-2 border-t"
            style={{ borderColor: 'var(--color-stone)' }}
          >
            <img
              src={SOURCE_META[recipe.source].logo}
              alt={SOURCE_META[recipe.source].label}
              className="w-3.5 h-3.5 rounded-sm object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span
              className="text-xs"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              {SOURCE_META[recipe.source].label}
            </span>
          </div>
        )}

        {/* Excluded ingredient warning */}
        {excludedWarnings.length > 0 && (
          <div
            className="flex items-start gap-1.5 mt-2 pt-2 border-t rounded-b-lg px-2 py-1.5"
            style={{
              borderColor: 'var(--color-honey)',
              background: 'var(--color-peach)',
              marginLeft: '-16px',
              marginRight: '-16px',
              marginBottom: '-16px',
              paddingLeft: '16px',
              paddingRight: '16px',
            }}
          >
            <AlertTriangle
              className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
              style={{ color: 'var(--color-honey)' }}
            />
            <span
              className="text-xs"
              style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif', fontWeight: 600 }}
            >
              Contains {excludedWarnings.join(', ')}
              {excludedWarnings.length === 1 ? ' (your excluded ingredient)' : ' (your excluded ingredients)'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
