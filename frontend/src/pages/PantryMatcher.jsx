import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Crown, X, Plus, ChefHat, ShoppingCart, Check, Search, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';
import { pantryApi } from '../services/api';

// ── Common ingredients for quick-add ─────────────────────────────────────────
const QUICK_ADD = [
  'chicken', 'beef mince', 'eggs', 'onion', 'garlic', 'rice',
  'pasta', 'potato', 'tomato', 'carrot', 'broccoli', 'cheese',
  'milk', 'lemon', 'spinach', 'mushroom',
];

// ── Coverage badge colour ─────────────────────────────────────────────────────
function coverageStyle(coverage) {
  if (coverage >= 0.7) return { bg: '#D6EDD4', color: '#3D7A3A', label: 'Ready to cook!' };
  if (coverage >= 0.5) return { bg: '#FEF3C7', color: '#92400E', label: 'Almost there' };
  return { bg: '#F3F4F6', color: '#6B7280', label: 'Needs a few items' };
}

// ── Upsell screen for non-premium users ──────────────────────────────────────
function UpsellScreen() {
  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--color-mist)', margin: '0 auto 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ChefHat style={{ width: 36, height: 36, color: 'var(--color-leaf)' }} />
        </div>

        <h1 style={{ fontFamily: '"Fredoka One", sans-serif', fontSize: 28, color: 'var(--color-bark)', marginBottom: 8 }}>
          What I Have at Home
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
          Tell us what's in your fridge and pantry — we'll find recipes you can make right now,
          and show you what missing ingredients are on sale.
        </p>

        {/* Blurred preview */}
        <div style={{
          background: 'white', border: '1.5px solid var(--color-stone)', borderRadius: 20,
          padding: 20, marginBottom: 24, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ filter: 'blur(4px)', pointerEvents: 'none', opacity: 0.6 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {['chicken', 'rice', 'broccoli', 'garlic', 'onion'].map(i => (
                <span key={i} style={{
                  background: 'var(--color-mist)', color: 'var(--color-text-green)',
                  borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 600,
                }}>
                  {i}
                </span>
              ))}
            </div>
            <p style={{ color: 'var(--color-bark)', fontWeight: 700, marginBottom: 4 }}>
              Found 12 recipes you can make!
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              You have 5/8 ingredients · 3 items on sale
            </p>
          </div>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(253, 250, 245, 0.6)',
          }}>
            <span style={{
              background: 'var(--color-honey)', color: 'white', borderRadius: 999,
              padding: '6px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Crown style={{ width: 14, height: 14 }} /> Premium only
            </span>
          </div>
        </div>

        <ul style={{ textAlign: 'left', marginBottom: 24, listStyle: 'none', padding: 0 }}>
          {[
            'Stop wasting food — use what you have before it spoils',
            'Discover recipes you can make RIGHT NOW without shopping',
            'See which missing ingredients are on sale nearby',
          ].map(item => (
            <li key={item} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start', color: 'var(--color-bark)', fontSize: 14 }}>
              <Check style={{ width: 16, height: 16, color: 'var(--color-leaf)', flexShrink: 0, marginTop: 2 }} />
              {item}
            </li>
          ))}
        </ul>

        <Link
          to="/premium"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--color-leaf)', color: 'white',
            borderRadius: 12, padding: '12px 28px', fontWeight: 700, fontSize: 15,
            textDecoration: 'none', fontFamily: 'Nunito, sans-serif',
          }}
        >
          <Crown style={{ width: 16, height: 16 }} />
          Upgrade to Premium — $9.99/month
        </Link>
      </div>
    </div>
  );
}

// ── Ingredient chip ───────────────────────────────────────────────────────────
function IngredientChip({ label, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'var(--color-mist)', color: 'var(--color-text-green)',
      borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 600,
      fontFamily: 'Nunito, sans-serif',
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.7 }}
        aria-label={`Remove ${label}`}
      >
        <X style={{ width: 13, height: 13 }} />
      </button>
    </span>
  );
}

// ── Single result card ────────────────────────────────────────────────────────
function PantryRecipeCard({ result, userIngredients }) {
  const [expanded, setExpanded] = useState(false);
  const { recipe, coverage, matchedIngredients, missingIngredients, totalCostToComplete, totalSavings } = result;
  const cs = coverageStyle(coverage);
  const pct = Math.round(coverage * 100);
  const dealsCount = missingIngredients.filter(i => i.deal).length;

  return (
    <div style={{
      background: 'white', border: '1.5px solid var(--color-stone)',
      borderRadius: 20, overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(92,74,53,0.07)',
    }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {recipe.image && (
          <img
            src={recipe.image}
            alt={recipe.title}
            style={{ width: 100, height: 100, objectFit: 'cover', flexShrink: 0 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ padding: '14px 16px', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <h3 style={{
              fontFamily: '"Fredoka One", sans-serif', fontSize: 16,
              color: 'var(--color-bark)', margin: 0, lineHeight: 1.3,
            }}>
              {recipe.title}
            </h3>
            <span style={{
              background: cs.bg, color: cs.color, borderRadius: 999,
              padding: '3px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0,
              fontFamily: 'Nunito, sans-serif',
            }}>
              {pct}%
            </span>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px', fontFamily: 'Nunito, sans-serif' }}>
            {cs.label} · You have {matchedIngredients.length}/{matchedIngredients.length + missingIngredients.length} ingredients
            {recipe.totalTime ? ` · ${recipe.totalTime} min` : ''}
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dealsCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-green)', background: 'var(--color-mist)', borderRadius: 999, padding: '2px 8px', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>
                {dealsCount} item{dealsCount !== 1 ? 's' : ''} on sale
              </span>
            )}
            {totalCostToComplete > 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                ~${totalCostToComplete.toFixed(2)} to complete
                {totalSavings > 0 && <span style={{ color: 'var(--color-text-green)' }}> (save ${totalSavings.toFixed(2)})</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable detail */}
      <div style={{ borderTop: '1px solid var(--color-stone)', padding: '12px 16px' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'Nunito, sans-serif', fontWeight: 600,
          }}
        >
          {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
          {expanded ? 'Hide' : 'Show'} ingredient breakdown
        </button>

        {expanded && (
          <div style={{ marginTop: 12 }}>
            {matchedIngredients.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-green)', marginBottom: 6, fontFamily: 'Nunito, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  You have
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {matchedIngredients.map((ing, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12, color: 'var(--color-bark)', background: '#F0FDF4',
                      borderRadius: 999, padding: '3px 10px', fontFamily: 'Nunito, sans-serif',
                    }}>
                      <Check style={{ width: 11, height: 11, color: 'var(--color-leaf)' }} />
                      {ing.name || ing.raw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {missingIngredients.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-berry)', marginBottom: 6, fontFamily: 'Nunito, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Still needed
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {missingIngredients.map((ing, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
                        <ShoppingCart style={{ width: 11, height: 11, color: 'var(--color-text-muted)', flexShrink: 0 }} />
                        {ing.name || ing.raw}
                      </span>
                      {ing.deal && (
                        <span style={{
                          fontSize: 11, color: 'var(--color-text-green)', fontWeight: 700,
                          background: 'var(--color-mist)', borderRadius: 999, padding: '2px 8px',
                          whiteSpace: 'nowrap', fontFamily: 'Nunito, sans-serif',
                        }}>
                          ${parseFloat(ing.deal.price).toFixed(2)} at {ing.deal.store?.charAt(0).toUpperCase() + ing.deal.store?.slice(1)}
                          {ing.deal.wasPrice && parseFloat(ing.deal.wasPrice) > parseFloat(ing.deal.price) && (
                            <span style={{ color: 'var(--color-berry)' }}> (save ${(parseFloat(ing.deal.wasPrice) - parseFloat(ing.deal.price)).toFixed(2)})</span>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Link
                to={`/recipes/${recipe.id || recipe.source_id}`}
                style={{
                  flex: 1, textAlign: 'center', background: 'var(--color-leaf)', color: 'white',
                  borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700,
                  textDecoration: 'none', fontFamily: 'Nunito, sans-serif',
                }}
              >
                View Recipe
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PantryMatcher() {
  const { isPremium, premiumLoading } = usePremium();
  const { user } = useAuth();

  const [ingredients, setIngredients]       = useState([]);
  const [hasPantryStaples, setHasPantryStaples] = useState(true);
  const [inputValue, setInputValue]         = useState('');
  const [results, setResults]               = useState(null);
  const [isMatching, setIsMatching]         = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [error, setError]                   = useState(null);
  const [pantryLoaded, setPantryLoaded]     = useState(false);
  const [sortBy, setSortBy]                 = useState('coverage');

  const inputRef = useRef(null);

  // Load saved pantry on mount
  useEffect(() => {
    if (!user || !isPremium || pantryLoaded) return;
    pantryApi.getPantry()
      .then(data => {
        if (data.pantry) {
          setIngredients(data.pantry.ingredients || []);
          setHasPantryStaples(data.pantry.has_pantry_staples !== false);
        }
        setPantryLoaded(true);
      })
      .catch(() => setPantryLoaded(true));
  }, [user, isPremium, pantryLoaded]);

  if (premiumLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader2 style={{ width: 32, height: 32, color: 'var(--color-leaf)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!isPremium) return <UpsellScreen />;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function addIngredient(name) {
    const clean = name.trim().toLowerCase();
    if (!clean || ingredients.includes(clean)) return;
    setIngredients(prev => [...prev, clean]);
  }

  function removeIngredient(name) {
    setIngredients(prev => prev.filter(i => i !== name));
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addIngredient(inputValue);
      setInputValue('');
    }
  }

  async function handleMatch() {
    if (ingredients.length === 0) return;
    setIsMatching(true);
    setError(null);
    setResults(null);
    try {
      const data = await pantryApi.matchPantry(ingredients, hasPantryStaples);
      setResults(data.recipes || []);
      // Auto-save pantry after matching
      pantryApi.savePantry(ingredients, hasPantryStaples).catch(() => {});
    } catch (err) {
      setError('Matching failed. Please try again.');
    } finally {
      setIsMatching(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await pantryApi.savePantry(ingredients, hasPantryStaples);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    setIngredients([]);
    setResults(null);
    pantryApi.deletePantry().catch(() => {});
  }

  // ── Sort results ──────────────────────────────────────────────────────────

  const sortedResults = results ? [...results].sort((a, b) => {
    if (sortBy === 'coverage') return b.coverage - a.coverage;
    if (sortBy === 'time') return (a.recipe.totalTime || 999) - (b.recipe.totalTime || 999);
    if (sortBy === 'cost') return a.totalCostToComplete - b.totalCostToComplete;
    return 0;
  }) : [];

  // ── Input screen ──────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--color-mist)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChefHat style={{ width: 22, height: 22, color: 'var(--color-leaf)' }} />
          </div>
          <h1 style={{ fontFamily: '"Fredoka One", sans-serif', fontSize: 26, color: 'var(--color-bark)', margin: 0 }}>
            What I Have at Home
          </h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, fontFamily: 'Nunito, sans-serif', margin: 0 }}>
          Enter your ingredients and we'll find recipes you can make, with deals on what's missing.
        </p>
      </div>

      {/* Input box */}
      <div style={{
        background: 'white', border: '1.5px solid var(--color-stone)',
        borderRadius: 20, padding: 16, marginBottom: 16,
        boxShadow: '0 2px 8px rgba(92,74,53,0.06)',
      }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: 13, color: 'var(--color-bark)', marginBottom: 10, fontFamily: 'Nunito, sans-serif' }}>
          Your ingredients
        </label>

        {/* Chips */}
        {ingredients.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {ingredients.map(ing => (
              <IngredientChip key={ing} label={ing} onRemove={() => removeIngredient(ing)} />
            ))}
          </div>
        )}

        {/* Text input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-stone)', borderRadius: 10, padding: '8px 12px' }}>
            <Search style={{ width: 15, height: 15, color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type an ingredient and press Enter…"
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14, color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif',
                width: '100%',
              }}
            />
          </div>
          <button
            onClick={() => { addIngredient(inputValue); setInputValue(''); }}
            disabled={!inputValue.trim()}
            style={{
              background: 'var(--color-leaf)', color: 'white', border: 'none', borderRadius: 10,
              padding: '8px 14px', cursor: 'pointer', opacity: inputValue.trim() ? 1 : 0.4,
            }}
          >
            <Plus style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Quick-add */}
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 7, fontFamily: 'Nunito, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick add
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {QUICK_ADD.filter(q => !ingredients.includes(q)).map(item => (
              <button
                key={item}
                onClick={() => addIngredient(item)}
                style={{
                  background: 'var(--color-parchment)', border: '1px solid var(--color-stone)',
                  borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                  color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif', fontWeight: 600,
                  transition: 'background 0.15s',
                }}
              >
                + {item}
              </button>
            ))}
          </div>
        </div>

        {/* Pantry staples toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
          cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 13, color: 'var(--color-bark)',
        }}>
          <input
            type="checkbox"
            checked={hasPantryStaples}
            onChange={e => setHasPantryStaples(e.target.checked)}
            style={{ accentColor: 'var(--color-leaf)', width: 16, height: 16 }}
          />
          <span>
            <strong>I have basic pantry staples</strong>{' '}
            <span style={{ color: 'var(--color-text-muted)' }}>(salt, pepper, oil, flour, butter, sugar)</span>
          </span>
        </label>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <button
          onClick={handleMatch}
          disabled={ingredients.length === 0 || isMatching}
          style={{
            flex: 1, background: ingredients.length === 0 ? 'var(--color-stone)' : 'var(--color-leaf)',
            color: 'white', border: 'none', borderRadius: 12, padding: '12px',
            fontWeight: 700, fontSize: 15, cursor: ingredients.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'Nunito, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {isMatching ? (
            <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} /> Finding recipes…</>
          ) : (
            <><Search style={{ width: 18, height: 18 }} /> Find Recipes</>
          )}
        </button>
        {ingredients.length > 0 && (
          <>
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                background: 'white', color: 'var(--color-bark)', border: '1.5px solid var(--color-stone)',
                borderRadius: 12, padding: '12px 16px', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', fontFamily: 'Nunito, sans-serif',
              }}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleClear}
              style={{
                background: 'white', color: 'var(--color-berry)', border: '1.5px solid var(--color-stone)',
                borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
              }}
              title="Clear pantry"
            >
              <Trash2 style={{ width: 16, height: 16 }} />
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12,
          padding: '12px 16px', color: '#991B1B', fontSize: 14, marginBottom: 16,
          fontFamily: 'Nunito, sans-serif',
        }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: '"Fredoka One", sans-serif', fontSize: 20, color: 'var(--color-bark)', margin: 0 }}>
              {results.length === 0 ? 'No recipes found' : `Found ${results.length} recipe${results.length !== 1 ? 's' : ''}!`}
            </h2>
            {results.length > 1 && (
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{
                  border: '1px solid var(--color-stone)', borderRadius: 8, padding: '6px 10px',
                  fontSize: 12, color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif',
                  background: 'white', cursor: 'pointer',
                }}
              >
                <option value="coverage">Best match</option>
                <option value="time">Quickest</option>
                <option value="cost">Cheapest</option>
              </select>
            )}
          </div>

          {results.length === 0 ? (
            <div style={{
              background: 'white', border: '1.5px solid var(--color-stone)', borderRadius: 20,
              padding: 24, textAlign: 'center', color: 'var(--color-text-muted)',
              fontFamily: 'Nunito, sans-serif',
            }}>
              <p style={{ marginBottom: 8, fontSize: 15 }}>We couldn't find recipes with ≥40% ingredient coverage.</p>
              <p style={{ fontSize: 13 }}>Try adding more common ingredients like onions, garlic, rice, or eggs.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {sortedResults.map((result, i) => (
                <PantryRecipeCard key={result.recipe.id ?? i} result={result} userIngredients={ingredients} />
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
