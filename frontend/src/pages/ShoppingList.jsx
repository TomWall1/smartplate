import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ShoppingCart, Plus, Trash2, Check, Printer, Loader, X, ChevronDown, ChevronUp } from 'lucide-react';
import PremiumGate from '../components/PremiumGate';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../App';
import { premiumApi } from '../services/api';

const CATEGORIES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Grains & Bread', 'Oils & Condiments', 'Herbs & Spices', 'Pantry & Canned', 'Other'];

function categorize(name) {
  const n = name.toLowerCase();
  if (/chicken|beef|pork|lamb|fish|salmon|tuna|prawn|shrimp|mince|steak|sausage|bacon|turkey/.test(n)) return 'Meat & Seafood';
  if (/milk|cream|butter|cheese|yoghurt|yogurt|egg|cheddar|parmesan|ricotta|feta/.test(n)) return 'Dairy & Eggs';
  if (/bread|pasta|rice|noodle|flour|oat|couscous|quinoa|tortilla|pita|wrap/.test(n)) return 'Grains & Bread';
  if (/olive oil|vegetable oil|coconut oil|canola oil|sesame oil|soy sauce|fish sauce|oyster sauce|worcestershire|balsamic|vinegar|mustard|mayo|ketchup/.test(n)) return 'Oils & Condiments';
  if (/salt|pepper|cumin|paprika|cinnamon|turmeric|oregano|basil|thyme|rosemary|coriander|parsley|ginger|chilli|chili|spice|herb|bay leaf/.test(n)) return 'Herbs & Spices';
  if (/onion|garlic|tomato|capsicum|carrot|potato|broccoli|spinach|lettuce|cucumber|zucchini|mushroom|celery|corn|peas|beans|lentil|avocado|lemon|lime|apple|banana|mango|berries|kale|silverbeet|asparagus|eggplant|pumpkin/.test(n)) return 'Produce';
  if (/stock|broth|coconut milk|tomato paste|canned|tin|jar|sauce|paste|diced/.test(n)) return 'Pantry & Canned';
  return 'Other';
}

function combineIngredients(recipes) {
  const seen = new Map();
  recipes.forEach(r => {
    const ingredients = r.allIngredients ?? r.ingredients ?? [];
    ingredients.forEach(ing => {
      const key = ing.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.set(key, { name: ing.trim(), category: categorize(ing), checked: false });
      }
    });
  });
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function groupByCategory(items) {
  const groups = {};
  CATEGORIES.forEach(c => { groups[c] = []; });
  items.forEach(item => {
    const cat = item.category ?? 'Other';
    if (groups[cat]) groups[cat].push(item);
    else groups['Other'].push(item);
  });
  return groups;
}

export default function ShoppingList() {
  const { isPremium, premiumLoading } = usePremium();
  const { user } = useAuth();
  const { weeklyRecipes } = useApp();
  const location = useLocation();

  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState({});
  const [newItemName, setNewItemName] = useState('');

  // Load existing lists
  useEffect(() => {
    if (!user || !isPremium) { setLoading(false); return; }
    premiumApi.getShoppingLists()
      .then(data => {
        const lsts = data.lists ?? [];
        setLists(lsts);
        if (lsts.length > 0) {
          setActiveList(lsts[0]);
          setItems(lsts[0].items ?? []);
        }
      })
      .catch(err => console.error('Load lists failed:', err.message))
      .finally(() => setLoading(false));
  }, [user, isPremium]);

  // Auto-generate from meal planner if recipeIds passed in state
  useEffect(() => {
    const recipeIds = location.state?.recipeIds;
    if (!recipeIds?.length || !weeklyRecipes.length || !isPremium) return;
    const selected = weeklyRecipes.filter(r => recipeIds.includes(r.id));
    if (selected.length === 0) return;
    const generated = combineIngredients(selected);
    handleSaveNew('Meal Plan Shopping List', generated);
  }, [location.state?.recipeIds, weeklyRecipes.length, isPremium]);

  const handleSaveNew = async (name, generatedItems) => {
    if (!user) return;
    setSaving(true);
    try {
      const data = await premiumApi.createShoppingList(name, generatedItems);
      const newList = data.list;
      setLists(prev => [newList, ...prev]);
      setActiveList(newList);
      setItems(newList.items ?? []);
    } catch (err) {
      console.error('Create list failed:', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateFromRecipes = () => {
    if (!weeklyRecipes.length) return;
    const generated = combineIngredients(weeklyRecipes.slice(0, 5));
    handleSaveNew('Weekly Recipes List', generated);
  };

  const persistItems = useCallback(async (newItems) => {
    if (!activeList) return;
    setItems(newItems);
    try {
      await premiumApi.updateShoppingList(activeList.id, { items: newItems });
    } catch (err) {
      console.error('Save items failed:', err.message);
    }
  }, [activeList]);

  const toggleItem = useCallback((idx) => {
    const updated = items.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item);
    persistItems(updated);
  }, [items, persistItems]);

  const removeItem = useCallback((idx) => {
    const updated = items.filter((_, i) => i !== idx);
    persistItems(updated);
  }, [items, persistItems]);

  const addItem = useCallback(() => {
    if (!newItemName.trim()) return;
    const item = { name: newItemName.trim(), category: categorize(newItemName), checked: false };
    const updated = [...items, item];
    persistItems(updated);
    setNewItemName('');
  }, [newItemName, items, persistItems]);

  const handleDeleteList = async () => {
    if (!activeList) return;
    try {
      await premiumApi.deleteShoppingList(activeList.id);
      const remaining = lists.filter(l => l.id !== activeList.id);
      setLists(remaining);
      if (remaining.length > 0) {
        setActiveList(remaining[0]);
        setItems(remaining[0].items ?? []);
      } else {
        setActiveList(null);
        setItems([]);
      }
    } catch (err) {
      console.error('Delete list failed:', err.message);
    }
  };

  const groups = groupByCategory(items);
  const checkedCount = items.filter(i => i.checked).length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-leaf)' }}>
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
            Shopping List
          </h1>
        </div>

        {premiumLoading ? null : !isPremium ? (
          <PremiumGate feature="Smart shopping lists" />
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--color-leaf)' }} />
          </div>
        ) : (
          <>
            {/* Generate / list selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={handleGenerateFromRecipes}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
              >
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Generate from this week's recipes
              </button>
              {activeList && (
                <button
                  onClick={handleDeleteList}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 border"
                  style={{ color: 'var(--color-berry)', borderColor: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete list
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 border"
                style={{ color: 'var(--color-bark)', borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif' }}
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>

            {/* Saved lists selector */}
            {lists.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {lists.map(l => (
                  <button
                    key={l.id}
                    onClick={() => { setActiveList(l); setItems(l.items ?? []); }}
                    className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
                    style={{
                      fontFamily: 'Nunito, sans-serif',
                      background: activeList?.id === l.id ? 'var(--color-leaf)' : 'var(--color-mist)',
                      color: activeList?.id === l.id ? '#ffffff' : 'var(--color-text-green)',
                    }}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}

            {activeList ? (
              <>
                {/* Progress */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                    {activeList.name}
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
                    {checkedCount}/{items.length} done
                  </p>
                </div>
                {items.length > 0 && (
                  <div className="w-full rounded-full h-2 mb-5" style={{ background: 'var(--color-mist)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${(checkedCount / items.length) * 100}%`, background: 'var(--color-leaf)' }}
                    />
                  </div>
                )}

                {/* Add item */}
                <div className="flex gap-2 mb-5">
                  <input
                    type="text"
                    placeholder="Add item..."
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addItem()}
                    className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ border: '1.5px solid var(--color-stone)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
                  />
                  <button
                    onClick={addItem}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                    style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    Add
                  </button>
                </div>

                {/* Categories */}
                {CATEGORIES.map(cat => {
                  const catItems = groups[cat] ?? [];
                  if (catItems.length === 0) return null;
                  const collapsed = collapsedCats[cat];
                  const allDone   = catItems.every(i => i.checked);
                  return (
                    <div key={cat} className="mb-3">
                      <button
                        onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg mb-1"
                        style={{ background: allDone ? 'var(--color-mist)' : 'var(--color-blush)' }}
                      >
                        <span className="text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                          {cat}
                          <span className="ml-2 font-normal" style={{ color: 'var(--color-text-muted)' }}>
                            {catItems.filter(i => i.checked).length}/{catItems.length}
                          </span>
                        </span>
                        {collapsed ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                                   : <ChevronUp   className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />}
                      </button>
                      {!collapsed && (
                        <div className="space-y-1">
                          {catItems.map((item, globalIdx) => {
                            const idx = items.indexOf(item);
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                                style={{ background: item.checked ? 'var(--color-mist)' : '#ffffff', border: '1px solid var(--color-stone)' }}
                              >
                                <button
                                  onClick={() => toggleItem(idx)}
                                  className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors"
                                  style={{
                                    borderColor: item.checked ? 'var(--color-leaf)' : 'var(--color-stone)',
                                    background: item.checked ? 'var(--color-leaf)' : 'transparent',
                                  }}
                                >
                                  {item.checked && <Check className="w-3 h-3 text-white" />}
                                </button>
                                <span
                                  className="flex-1 text-sm"
                                  style={{
                                    fontFamily: 'Nunito, sans-serif',
                                    color: item.checked ? 'var(--color-text-muted)' : 'var(--color-bark)',
                                    textDecoration: item.checked ? 'line-through' : 'none',
                                  }}
                                >
                                  {item.name}
                                </span>
                                <button onClick={() => removeItem(idx)} style={{ color: 'var(--color-stone)' }}
                                  className="hover:text-[var(--color-berry)] transition-colors">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="text-center py-20" style={{ fontFamily: 'Nunito, sans-serif' }}>
                <p className="text-5xl mb-4">🛒</p>
                <p className="text-lg font-bold mb-2" style={{ color: 'var(--color-bark)' }}>No shopping list yet</p>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Generate one from this week's recipes or your meal plan.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
