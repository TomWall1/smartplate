import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Trash2, Clock, Users, Loader } from 'lucide-react';
import PremiumGate from '../components/PremiumGate';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';
import { premiumApi } from '../services/api';

const SOURCE_LABEL = {
  jamieoliver:  'Jamie Oliver',
  donnahay:     'Donna Hay',
  womensweekly: "Women's Weekly",
};

function FavoriteCard({ fav, onRemove }) {
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(false);
  const data = fav.recipe_data ?? {};

  const handleRemove = async (e) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await premiumApi.removeFavorite(fav.recipe_id);
      onRemove(fav.recipe_id);
    } catch (err) {
      console.error('Remove favorite failed:', err.message);
      setRemoving(false);
    }
  };

  return (
    <div
      className="recipe-card rounded-[20px] cursor-pointer overflow-hidden"
      style={{ background: '#ffffff' }}
      onClick={() => navigate(`/recipes/${fav.recipe_id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/recipes/${fav.recipe_id}`); }}
    >
      {/* Image */}
      <div className="aspect-video overflow-hidden relative" style={{ background: 'var(--color-mist)' }}>
        {data.image ? (
          <img src={data.image} alt={data.title} className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl"
            style={{ color: 'var(--color-text-muted)' }}>🍽️</div>
        )}
        <button
          onClick={handleRemove}
          disabled={removing}
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-sm"
          style={{ background: 'rgba(255,255,255,0.9)' }}
          aria-label="Remove from favourites"
        >
          {removing
            ? <Loader className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
            : <Trash2 className="w-4 h-4" style={{ color: 'var(--color-berry)' }} />}
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3
          className="leading-snug line-clamp-2 mb-2"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)', fontSize: '17px' }}
        >
          {data.title ?? fav.recipe_id}
        </h3>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif', fontWeight: 600 }}>
          {data.prepTime && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {data.prepTime} min
            </span>
          )}
          {data.servings && (
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {data.servings}
            </span>
          )}
        </div>
        {data.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {data.tags.slice(0, 3).map((tag, i) => (
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
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
          Saved {new Date(fav.saved_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
        </p>
      </div>
    </div>
  );
}

export default function Favorites() {
  const { isPremium, premiumLoading } = usePremium();
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !isPremium) { setLoading(false); return; }
    premiumApi.getFavorites()
      .then(data => setFavorites(data.favorites ?? []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, isPremium]);

  const handleRemove = useCallback((recipeId) => {
    setFavorites(prev => prev.filter(f => f.recipe_id !== recipeId));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-berry)' }}
          >
            <Heart className="w-5 h-5 text-white" fill="white" />
          </div>
          <h1
            className="text-2xl sm:text-3xl"
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
          >
            Saved Recipes
          </h1>
        </div>

        {premiumLoading ? null : !isPremium ? (
          <PremiumGate feature="Saved recipes" />
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[20px] overflow-hidden border animate-pulse" style={{ background: '#fff', borderColor: 'var(--color-stone)' }}>
                <div className="aspect-video" style={{ background: 'var(--color-mist)' }} />
                <div className="p-4 space-y-2">
                  <div className="h-4 rounded" style={{ background: 'var(--color-stone)', width: '75%' }} />
                  <div className="h-3 rounded" style={{ background: 'var(--color-stone)', width: '50%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--color-peach)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}>
            Failed to load favourites: {error}
          </div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-20" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <p className="text-5xl mb-4">❤️</p>
            <p className="text-lg font-bold mb-2" style={{ color: 'var(--color-bark)' }}>No saved recipes yet</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Tap the heart on any recipe card to save it here.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
              {favorites.length} saved recipe{favorites.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {favorites.map(fav => (
                <FavoriteCard key={fav.recipe_id} fav={fav} onRemove={handleRemove} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
