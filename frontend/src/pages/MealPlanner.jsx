import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, X, Plus, ShoppingCart, Loader } from 'lucide-react';
import PremiumGate from '../components/PremiumGate';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../App';
import { premiumApi } from '../services/api';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const MEAL_EMOJI  = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };

function getWeekDates(anchor) {
  const d = new Date(anchor);
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day;
  });
}

function toISO(date) {
  return date.toISOString().split('T')[0];
}

function RecipePickerModal({ recipes, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const filtered = q
    ? recipes.filter(r => r.title?.toLowerCase().includes(q.toLowerCase()))
    : recipes;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(92,74,53,0.4)' }} onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[20px] overflow-hidden shadow-xl"
        style={{ background: '#ffffff', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b" style={{ borderColor: 'var(--color-stone)' }}>
          <h3 className="text-lg mb-2" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
            Pick a Recipe
          </h3>
          <input
            type="text"
            placeholder="Search recipes..."
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={{ border: '1.5px solid var(--color-stone)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
              No recipes found
            </p>
          ) : filtered.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#D6EDD4] transition-colors border-b"
              style={{ borderColor: 'var(--color-stone)' }}
            >
              {r.image && (
                <img src={r.image} alt={r.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  onError={e => e.target.style.display = 'none'} />
              )}
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>{r.title}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                  {r.prepTime ?? r.cookTime ?? 30} min · {r.servings ?? 4} servings
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t" style={{ borderColor: 'var(--color-stone)' }}>
          <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-bold"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MealPlanner() {
  const { isPremium, premiumLoading } = usePremium();
  const { user } = useAuth();
  const { weeklyRecipes } = useApp();
  const navigate = useNavigate();

  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [mealPlan, setMealPlan] = useState({}); // { "2026-03-14-dinner": { id, recipe_id, recipe_data } }
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null); // { date, mealType }
  const [saving, setSaving] = useState(false);

  const weekDates = getWeekDates(weekAnchor);
  const startDate = toISO(weekDates[0]);
  const endDate   = toISO(weekDates[6]);

  const loadMealPlan = useCallback(async () => {
    if (!user || !isPremium) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await premiumApi.getMealPlan(startDate, endDate);
      const map = {};
      (data.mealPlan ?? []).forEach(m => {
        map[`${m.date}-${m.meal_type}`] = m;
      });
      setMealPlan(map);
    } catch (err) {
      console.error('Load meal plan failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [user, isPremium, startDate, endDate]);

  useEffect(() => { loadMealPlan(); }, [loadMealPlan]);

  const handleAddMeal = useCallback(async (recipe) => {
    if (!picker) return;
    const { date, mealType } = picker;
    setPicker(null);
    setSaving(true);
    try {
      const snapshot = { title: recipe.title, image: recipe.image, prepTime: recipe.prepTime ?? recipe.cookTime, servings: recipe.servings };
      const data = await premiumApi.addToMealPlan(date, mealType, recipe.id, snapshot);
      setMealPlan(prev => ({ ...prev, [`${date}-${mealType}`]: data.meal }));
    } catch (err) {
      console.error('Add to meal plan failed:', err.message);
    } finally {
      setSaving(false);
    }
  }, [picker]);

  const handleRemoveMeal = useCallback(async (dateStr, mealType) => {
    const key = `${dateStr}-${mealType}`;
    const meal = mealPlan[key];
    if (!meal) return;
    try {
      await premiumApi.removeFromMealPlan(meal.id);
      setMealPlan(prev => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err) {
      console.error('Remove meal failed:', err.message);
    }
  }, [mealPlan]);

  const handleGenerateShoppingList = () => {
    const recipeIds = Object.values(mealPlan).map(m => m.recipe_id);
    if (recipeIds.length === 0) return;
    navigate('/shopping-list', { state: { recipeIds } });
  };

  const prevWeek = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() - 7);
    setWeekAnchor(d);
  };
  const nextWeek = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + 7);
    setWeekAnchor(d);
  };

  const today = toISO(new Date());

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-leaf)' }}>
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
              Meal Planner
            </h1>
          </div>
          {isPremium && (
            <button
              onClick={handleGenerateShoppingList}
              disabled={Object.keys(mealPlan).length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
            >
              <ShoppingCart className="w-4 h-4" />
              Generate Shopping List
            </button>
          )}
        </div>

        {premiumLoading ? null : !isPremium ? (
          <PremiumGate feature="The meal planner" />
        ) : (
          <>
            {/* Week navigator */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevWeek} className="p-2 rounded-xl hover:bg-[#D6EDD4] transition-colors" style={{ color: 'var(--color-bark)' }}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <p className="text-sm font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                {weekDates[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                {' – '}
                {weekDates[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <button onClick={nextWeek} className="p-2 rounded-xl hover:bg-[#D6EDD4] transition-colors" style={{ color: 'var(--color-bark)' }}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--color-leaf)' }} />
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className="min-w-[640px]">
                  {/* Day headers */}
                  <div className="grid" style={{ gridTemplateColumns: '80px repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                    <div />
                    {weekDates.map(d => (
                      <div
                        key={d}
                        className="text-center text-xs font-bold py-2 rounded-lg"
                        style={{
                          fontFamily: 'Nunito, sans-serif',
                          color: toISO(d) === today ? '#ffffff' : 'var(--color-bark)',
                          background: toISO(d) === today ? 'var(--color-leaf)' : 'transparent',
                        }}
                      >
                        <div>{d.toLocaleDateString('en-AU', { weekday: 'short' })}</div>
                        <div>{d.getDate()}</div>
                      </div>
                    ))}
                  </div>

                  {/* Meal rows */}
                  {MEAL_TYPES.map(mealType => (
                    <div key={mealType} className="grid mb-1" style={{ gridTemplateColumns: '80px repeat(7, 1fr)', gap: '4px' }}>
                      {/* Row label */}
                      <div className="flex items-center gap-1 pr-2 text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                        <span>{MEAL_EMOJI[mealType]}</span>
                        <span>{MEAL_LABELS[mealType]}</span>
                      </div>
                      {weekDates.map(d => {
                        const dateStr = toISO(d);
                        const key  = `${dateStr}-${mealType}`;
                        const meal = mealPlan[key];
                        const rd   = meal?.recipe_data ?? {};

                        return (
                          <div
                            key={dateStr}
                            className="rounded-xl border overflow-hidden"
                            style={{
                              borderColor: 'var(--color-stone)',
                              background: meal ? '#ffffff' : 'var(--color-mist)',
                              minHeight: '70px',
                            }}
                          >
                            {meal ? (
                              <div className="relative h-full p-2">
                                <button
                                  onClick={() => handleRemoveMeal(dateStr, mealType)}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                                  style={{ background: 'var(--color-stone)', color: 'var(--color-bark)' }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                <p
                                  className="text-xs font-bold leading-tight line-clamp-2 pr-5 cursor-pointer hover:underline"
                                  style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
                                  onClick={() => navigate(`/recipes/${meal.recipe_id}`)}
                                >
                                  {rd.title ?? meal.recipe_id}
                                </p>
                                {rd.prepTime && (
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                                    {rd.prepTime} min
                                  </p>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => setPicker({ date: dateStr, mealType })}
                                className="w-full h-full flex flex-col items-center justify-center gap-0.5 transition-colors hover:bg-[#D6EDD4]"
                                style={{ minHeight: '70px' }}
                              >
                                <Plus className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {picker && (
        <RecipePickerModal
          recipes={weeklyRecipes}
          onSelect={handleAddMeal}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
