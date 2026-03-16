import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChefHat, Search, Filter, Edit2, Trash2, X, Check,
  Loader, ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
  GripVertical, Plus, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../services/api';

// ── Constants ────────────────────────────────────────────────────────────────

const SOURCES = [
  { value: '',              label: 'All sources' },
  { value: 'recipetineats', label: 'RecipeTinEats' },
  { value: 'jamieoliver',   label: 'Jamie Oliver' },
  { value: 'donnahay',      label: 'Donna Hay' },
  { value: 'juliegoodwin',  label: 'Julie Goodwin' },
  { value: 'womensweekly',  label: "Women's Weekly" },
];

const SKILL_LEVELS  = ['', 'beginner', 'intermediate', 'advanced'];
const CUISINE_TYPES = [
  'Australian','Italian','Asian','Chinese','Japanese','Thai','Indian','Mexican',
  'Mediterranean','Middle Eastern','Greek','French','American','British',
  'Vietnamese','Turkish','Moroccan','Spanish','Korean','Other',
];
const MEAL_OCCASIONS  = ['breakfast','lunch','dinner','snack','dessert','entertaining','lunchbox'];
const DIETARY_OPTIONS = ['vegetarian','vegan','gluten-free','dairy-free','nut-free','low-carb','high-protein','paleo'];
const COOKING_METHODS = ['stovetop','oven','grill','barbecue','slow-cooker','no-cook','air-fryer','microwave','deep-fry','steam','pressure-cooker','roast','bake'];
const PROTEIN_OPTIONS = ['chicken','beef','lamb','pork','seafood','fish','eggs','tofu','legumes','dairy',null];
const COST_OPTIONS    = ['low','medium','high'];
const ING_CATEGORIES  = ['meat','seafood','dairy','eggs','vegetables','fruit','grains','legumes','nuts_seeds','herbs_spices','condiments','oils_fats','baked_goods','canned_preserved','frozen','other'];

// ── Small helpers ─────────────────────────────────────────────────────────────

function SkillBadge({ level }) {
  const colors = { beginner: ['#d4edd4','var(--color-text-green)'], intermediate: ['#fff3cd','#856404'], advanced: ['#fde8eb','var(--color-berry)'] };
  const [bg, fg] = colors[level] ?? ['var(--color-mist)','var(--color-bark)'];
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: bg, color: fg, fontFamily: 'Nunito, sans-serif' }}>{level}</span>;
}

function MultiToggle({ label, options, value = [], onChange }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-bold mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map(opt => {
          const active = value.includes(opt);
          return (
            <button key={opt ?? 'null'} type="button"
              onClick={() => onChange(active ? value.filter(v => v !== opt) : [...value, opt])}
              className="text-xs px-2 py-0.5 rounded-full border transition-colors"
              style={{ fontFamily: 'Nunito, sans-serif', background: active ? 'var(--color-bark)' : 'transparent', color: active ? '#fff' : 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
              {opt ?? 'none'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Ingredient Editor ─────────────────────────────────────────────────────────

function IngredientEditor({ ingredients, onChange }) {
  const dragIdx  = useRef(null);
  const dragOver = useRef(null);

  // All subheading names for the "Part of" dropdown
  const subheadings = ingredients
    .filter(i => i.isSubheading)
    .map(i => i.name);

  const update = (idx, patch) => {
    const next = ingredients.map((ing, i) => i === idx ? { ...ing, ...patch } : ing);
    onChange(next);
  };

  const remove = (idx) => onChange(ingredients.filter((_, i) => i !== idx));

  const addIngredient = () => onChange([...ingredients, {
    name: '', quantity: '', unit: '', isSubheading: false, isActive: true, subheadingGroup: null,
  }]);

  const addSubheading = () => onChange([...ingredients, {
    name: 'FOR THE ', isSubheading: true, isActive: true, subheadingGroup: null,
  }]);

  const onDragStart = (idx) => { dragIdx.current = idx; };
  const onDragEnter = (idx) => { dragOver.current = idx; };
  const onDragEnd   = () => {
    if (dragIdx.current === null || dragOver.current === null || dragIdx.current === dragOver.current) {
      dragIdx.current = dragOver.current = null;
      return;
    }
    const next = [...ingredients];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(dragOver.current, 0, moved);
    onChange(next);
    dragIdx.current = dragOver.current = null;
  };

  return (
    <div>
      <div className="space-y-1">
        {ingredients.map((ing, idx) => {
          const isHeader = ing.isSubheading;
          const isInactive = !isHeader && ing.isActive === false;

          return (
            <div
              key={idx}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragEnter={() => onDragEnter(idx)}
              onDragEnd={onDragEnd}
              onDragOver={e => e.preventDefault()}
              className="flex items-start gap-1.5 rounded-xl px-2 py-1.5 border"
              style={{
                background:  isHeader ? '#eef2ff' : isInactive ? '#fafafa' : '#fff',
                borderColor: isHeader ? '#c7d2fe' : 'var(--color-stone)',
                opacity:     isInactive ? 0.6 : 1,
              }}
            >
              {/* Drag handle */}
              <div className="flex-shrink-0 mt-1.5 cursor-grab" style={{ color: 'var(--color-stone)' }}>
                <GripVertical className="w-3.5 h-3.5" />
              </div>

              {/* Active checkbox */}
              {!isHeader && (
                <div className="flex-shrink-0 mt-1.5" title="Active (include in matching)">
                  <input
                    type="checkbox"
                    checked={ing.isActive !== false}
                    onChange={e => update(idx, { isActive: e.target.checked })}
                    className="w-3.5 h-3.5 accent-green-600"
                  />
                </div>
              )}

              {/* Subheading checkbox */}
              <div className="flex-shrink-0 mt-1.5" title="Section header (not a real ingredient)">
                <input
                  type="checkbox"
                  checked={!!ing.isSubheading}
                  onChange={e => {
                    const patch = { isSubheading: e.target.checked };
                    if (e.target.checked) patch.subheadingGroup = null;
                    update(idx, patch);
                  }}
                  className="w-3.5 h-3.5 accent-indigo-500"
                />
              </div>

              {/* Fields */}
              <div className="flex-1 min-w-0 space-y-1">
                {/* Name */}
                <input
                  value={ing.name ?? ''}
                  onChange={e => update(idx, { name: e.target.value })}
                  placeholder={isHeader ? 'Section heading (e.g. FOR THE SAUCE)' : 'Ingredient name'}
                  className="w-full border rounded-lg px-2 py-0.5 text-xs"
                  style={{
                    borderColor: 'var(--color-stone)',
                    fontFamily: 'Nunito, sans-serif',
                    fontWeight: isHeader ? 700 : 400,
                    color: isHeader ? '#4338ca' : isInactive ? 'var(--color-text-muted)' : 'var(--color-bark)',
                    textDecoration: isInactive ? 'line-through' : 'none',
                    outline: 'none',
                  }}
                />

                {/* Qty / Unit / Group row */}
                {!isHeader && (
                  <div className="flex gap-1.5">
                    <input
                      value={ing.quantity ?? ''}
                      onChange={e => update(idx, { quantity: e.target.value })}
                      placeholder="Qty"
                      className="w-14 border rounded-lg px-2 py-0.5 text-xs"
                      style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif', outline: 'none' }}
                    />
                    <input
                      value={ing.unit ?? ''}
                      onChange={e => update(idx, { unit: e.target.value })}
                      placeholder="Unit"
                      className="w-14 border rounded-lg px-2 py-0.5 text-xs"
                      style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif', outline: 'none' }}
                    />
                    {subheadings.length > 0 && (
                      <select
                        value={ing.subheadingGroup ?? ''}
                        onChange={e => update(idx, { subheadingGroup: e.target.value || null })}
                        className="flex-1 border rounded-lg px-1.5 py-0.5 text-xs"
                        style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif' }}
                        title="Part of section"
                      >
                        <option value="">No section</option>
                        {subheadings.map(s => (
                          <option key={s} value={s.replace(/^for the /i,'').replace(/^for /i,'').toLowerCase().replace(/\s+/g,'_')}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Ingredient tags summary */}
                {!isHeader && ing.ingredientTags && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {ing.ingredientTags.category && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: 'var(--color-mist)', color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
                        {ing.ingredientTags.category}
                      </span>
                    )}
                    {ing.ingredientTags.proteinType && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: '#fde8eb', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}>
                        {ing.ingredientTags.proteinType}
                      </span>
                    )}
                    {ing.ingredientTags.essential === false && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: '#fff3cd', color: '#856404', fontFamily: 'Nunito, sans-serif' }}>
                        optional
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Delete */}
              <button onClick={() => remove(idx)} className="flex-shrink-0 mt-1 p-1 rounded hover:bg-red-50" title="Remove">
                <X className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add buttons */}
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={addIngredient}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors hover:bg-[#D6EDD4]"
          style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
          <Plus className="w-3.5 h-3.5" /> Add Ingredient
        </button>
        <button type="button" onClick={addSubheading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors hover:bg-[#eef2ff]"
          style={{ fontFamily: 'Nunito, sans-serif', color: '#4338ca', borderColor: '#c7d2fe' }}>
          <Plus className="w-3.5 h-3.5" /> Add Section Header
        </button>
      </div>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ recipe, onClose, onSave }) {
  const [tab, setTab]       = useState('metadata');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  // Recipe-level active flag
  const [isActive, setIsActive] = useState(recipe.is_active !== false);

  // Metadata state
  const initMeta = recipe.metadata ?? {};
  const [meta, setMeta] = useState({
    cuisineType:        initMeta.cuisineType        ?? [],
    mealOccasion:       initMeta.mealOccasion       ?? [],
    dietarySuitability: initMeta.dietarySuitability ?? [],
    cookingMethod:      initMeta.cookingMethod      ?? [],
    flavorProfile:      initMeta.flavorProfile      ?? [],
    skillLevel:         initMeta.skillLevel         ?? 'beginner',
    prepComplexity:     initMeta.prepComplexity     ?? 'simple',
    primaryProtein:     initMeta.primaryProtein     ?? null,
    estimatedCost:      initMeta.estimatedCost      ?? 'medium',
    prepTime:           initMeta.prepTime           ?? '',
    cookTime:           initMeta.cookTime           ?? '',
    totalTime:          initMeta.totalTime          ?? '',
    servings:           initMeta.servings           ?? '',
  });
  const setM = (key, val) => setMeta(prev => ({ ...prev, [key]: val }));

  // Ingredients state (loaded on demand)
  const [ingredients, setIngredients] = useState(null);
  const [ingLoading, setIngLoading]   = useState(false);

  const loadIngredients = useCallback(async () => {
    if (ingredients !== null) return;
    setIngLoading(true);
    try {
      const data = await adminApi.getRecipe(recipe.id);
      const raw  = data.recipe?.ingredients;
      setIngredients(Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []));
    } catch {
      setIngredients([]);
    } finally {
      setIngLoading(false);
    }
  }, [recipe.id, ingredients]);

  useEffect(() => {
    if (tab === 'ingredients') loadIngredients();
  }, [tab]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        is_active: isActive,
        metadata: {
          ...meta,
          prepTime:  meta.prepTime  ? parseInt(meta.prepTime,  10) : null,
          cookTime:  meta.cookTime  ? parseInt(meta.cookTime,  10) : null,
          totalTime: meta.totalTime ? parseInt(meta.totalTime, 10) : null,
          servings:  meta.servings  ? parseInt(meta.servings,  10) : null,
        },
      };
      if (tab === 'ingredients' && ingredients !== null) {
        body.ingredients = ingredients;
      }
      const saved = await adminApi.updateRecipe(recipe.id, body);
      onSave(saved.recipe);
    } catch (err) {
      setError(err?.response?.data?.error ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[20px] border overflow-hidden"
        style={{ background: '#fff', borderColor: 'var(--color-stone)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-stone)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
              Edit Recipe
            </h2>
            <p className="text-xs mt-0.5 line-clamp-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
              #{recipe.id} · {recipe.title}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f5f5f5]">
            <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b" style={{ borderColor: 'var(--color-stone)' }}>
          {[['metadata','Metadata'],['ingredients','Ingredients']].map(([val,lbl]) => (
            <button key={val} onClick={() => setTab(val)}
              className="px-5 py-2.5 text-xs font-bold border-b-2 transition-colors"
              style={{ fontFamily: 'Nunito, sans-serif', borderBottomColor: tab === val ? 'var(--color-leaf)' : 'transparent', color: tab === val ? 'var(--color-leaf)' : 'var(--color-text-muted)' }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'metadata' ? (
            <div className="space-y-1">
              {/* Status */}
              <div className="mb-4 p-3 rounded-xl border" style={{ borderColor: isActive ? 'var(--color-stone)' : 'var(--color-berry)', background: isActive ? '#f9f9f9' : '#fff5f6' }}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div>
                    <p className="text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>Recipe Status</p>
                    <p className="text-[10px] mt-0.5" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                      {isActive ? 'Active — included in matching and search' : 'Inactive — excluded from all matching'}
                    </p>
                  </div>
                  <select
                    value={isActive ? 'active' : 'inactive'}
                    onChange={e => setIsActive(e.target.value === 'active')}
                    className="ml-auto border rounded-lg px-2 py-1 text-xs"
                    style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif' }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                {!isActive && (
                  <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    This recipe will not appear in search results or matching
                  </p>
                )}
              </div>

              {/* Timing */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[['prepTime','Prep (min)'],['cookTime','Cook (min)'],['servings','Servings']].map(([k,lbl]) => (
                  <div key={k}>
                    <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{lbl}</label>
                    <input type="number" min="0" value={meta[k]} onChange={e => setM(k, e.target.value)}
                      className="w-full border rounded-lg px-2 py-1 text-xs" style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
                  </div>
                ))}
              </div>

              {/* Skill / Cost / Complexity */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  ['skillLevel',    'Skill',      ['beginner','intermediate','advanced']],
                  ['estimatedCost', 'Cost',       COST_OPTIONS],
                  ['prepComplexity','Complexity', ['simple','moderate','complex']],
                ].map(([k,lbl,opts]) => (
                  <div key={k}>
                    <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{lbl}</label>
                    <select value={meta[k]} onChange={e => setM(k, e.target.value)}
                      className="w-full border rounded-lg px-2 py-1 text-xs" style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif' }}>
                      {opts.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Primary protein */}
              <div className="mb-3">
                <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>Primary Protein</label>
                <div className="flex flex-wrap gap-1">
                  {PROTEIN_OPTIONS.map(opt => (
                    <button key={opt ?? 'none'} type="button" onClick={() => setM('primaryProtein', opt)}
                      className="text-xs px-2 py-0.5 rounded-full border transition-colors"
                      style={{ fontFamily: 'Nunito, sans-serif', background: meta.primaryProtein === opt ? 'var(--color-bark)' : 'transparent', color: meta.primaryProtein === opt ? '#fff' : 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
                      {opt ?? 'none'}
                    </button>
                  ))}
                </div>
              </div>

              <MultiToggle label="Cuisine"  options={CUISINE_TYPES}  value={meta.cuisineType}        onChange={v => setM('cuisineType', v)} />
              <MultiToggle label="Occasion" options={MEAL_OCCASIONS}  value={meta.mealOccasion}       onChange={v => setM('mealOccasion', v)} />
              <MultiToggle label="Dietary"  options={DIETARY_OPTIONS} value={meta.dietarySuitability} onChange={v => setM('dietarySuitability', v)} />
              <MultiToggle label="Method"   options={COOKING_METHODS} value={meta.cookingMethod}      onChange={v => setM('cookingMethod', v)} />
            </div>
          ) : (
            ingLoading
              ? <div className="flex items-center justify-center py-12"><Loader className="w-6 h-6 animate-spin" style={{ color: 'var(--color-bark)' }} /></div>
              : <IngredientEditor ingredients={ingredients ?? []} onChange={setIngredients} />
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs" style={{ color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}>{error}</p>
          </div>
        )}
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--color-stone)' }}>
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-colors hover:bg-[#f5f5f5]"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ fontFamily: 'Nunito, sans-serif', background: 'var(--color-leaf)' }}>
            {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminRecipes() {
  const { user } = useAuth();

  const [recipes, setRecipes]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [search, setSearch]         = useState('');
  const [source, setSource]         = useState('');
  const [skill, setSkill]           = useState('');
  const [hasMetadata, setHasMetadata] = useState('');
  const [status, setStatus]         = useState('all');

  const [editing, setEditing]             = useState(null);
  const [deleting, setDeleting]           = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [togglingActive, setTogglingActive] = useState(null);

  const LIMIT = 50;

  const load = useCallback(async (pg = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: pg, limit: LIMIT };
      if (search)      params.search      = search;
      if (source)      params.source      = source;
      if (skill)       params.skill       = skill;
      if (hasMetadata) params.hasMetadata = hasMetadata;
      if (status !== 'all') params.status = status;

      const data = await adminApi.getRecipes(params);
      setRecipes(data.recipes ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
      setPage(pg);
    } catch (err) {
      setError(err?.response?.data?.error ?? err.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, search, source, skill, hasMetadata, status]);

  useEffect(() => { if (user) load(1); else setLoading(false); }, [user]);

  const handleSearch = (e) => { e.preventDefault(); load(1); };

  const handleToggleActive = async (r) => {
    setTogglingActive(r.id);
    try {
      const saved = await adminApi.updateRecipe(r.id, { is_active: !r.is_active });
      setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, ...saved.recipe } : x));
    } catch (err) {
      console.error('Toggle active failed:', err.message);
    } finally {
      setTogglingActive(null);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await adminApi.deleteRecipe(id);
      setRecipes(prev => prev.filter(r => r.id !== id));
      setTotal(prev => prev - 1);
    } catch (err) {
      console.error('Delete failed:', err.message);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const handleSaved = (updated) => {
    setRecipes(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
    setEditing(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-parchment)' }}>
        <p style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>Please sign in.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-leaf)' }}>
              <ChefHat className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>Recipe Manager</h1>
              <p className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>{total.toLocaleString()} recipes</p>
            </div>
          </div>
          <button onClick={() => load(page)} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4] disabled:opacity-50"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch}
          className="rounded-[20px] border p-4 mb-5"
          style={{ background: '#fff', borderColor: 'var(--color-stone)' }}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-bold mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Recipe title…"
                  className="w-full border rounded-xl pl-7 pr-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
              </div>
            </div>
            {[
              ['Source', source, setSource, SOURCES.map(s => ({ v: s.value, l: s.label }))],
              ['Skill',  skill,  setSkill,  SKILL_LEVELS.map(v => ({ v, l: v || 'Any' }))],
              ['Metadata', hasMetadata, setHasMetadata, [{v:'',l:'Any'},{v:'true',l:'Enriched'},{v:'false',l:'Not enriched'}]],
              ['Status',   status,      setStatus,      [{v:'all',l:'All'},{v:'active',l:'Active'},{v:'inactive',l:'Inactive'}]],
            ].map(([lbl, val, setter, opts]) => (
              <div key={lbl} className="min-w-[110px]">
                <label className="block text-xs font-bold mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{lbl}</label>
                <select value={val} onChange={e => setter(e.target.value)}
                  className="w-full border rounded-xl px-2 py-1.5 text-xs"
                  style={{ borderColor: 'var(--color-stone)', fontFamily: 'Nunito, sans-serif' }}>
                  {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
            <button type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white"
              style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}>
              <Filter className="w-3.5 h-3.5" /> Filter
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-xl p-4 text-sm border mb-5 flex items-center gap-2"
            style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--color-bark)' }} />
          </div>
        ) : (
          <>
            <div className="rounded-[20px] border overflow-hidden" style={{ borderColor: 'var(--color-stone)' }}>
              {/* Table header */}
              <div className="grid text-xs font-bold px-4 py-2.5"
                style={{ gridTemplateColumns: '48px 1fr 100px 80px 80px 70px 80px', gap: '8px', background: 'var(--color-mist)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                <span>ID</span><span>Recipe</span><span>Source</span>
                <span>Cuisine</span><span>Skill</span><span>Status</span><span className="text-right">Actions</span>
              </div>

              {recipes.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>No recipes found</div>
              ) : recipes.map(r => (
                <div key={r.id}
                  className="grid items-center px-4 py-2.5 border-t"
                  style={{ gridTemplateColumns: '48px 1fr 100px 80px 80px 70px 80px', gap: '8px', borderColor: 'var(--color-stone)', background: r.is_active === false ? '#fff8f8' : r.metadata ? '#fff' : '#fffbf0' }}>

                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>{r.id}</span>

                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ fontFamily: 'Nunito, sans-serif', color: r.is_active === false ? 'var(--color-text-muted)' : 'var(--color-bark)', textDecoration: r.is_active === false ? 'line-through' : 'none' }}>
                      {r.title}
                    </p>
                    {r.metadata?.mealOccasion?.length > 0 && (
                      <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>{r.metadata.mealOccasion.join(' · ')}</p>
                    )}
                  </div>

                  <span className="text-[10px] truncate" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>{r.source}</span>
                  <span className="text-[10px] truncate" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{r.metadata?.cuisineType?.[0] ?? '—'}</span>
                  <span>{r.metadata?.skillLevel ? <SkillBadge level={r.metadata.skillLevel} /> : <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>—</span>}</span>

                  {/* Status toggle */}
                  <button
                    onClick={() => handleToggleActive(r)}
                    disabled={togglingActive === r.id}
                    title={r.is_active === false ? 'Click to activate' : 'Click to deactivate'}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50"
                    style={{
                      fontFamily: 'Nunito, sans-serif',
                      background:  r.is_active === false ? '#fff5f6' : '#d4edd4',
                      color:       r.is_active === false ? 'var(--color-berry)' : 'var(--color-text-green)',
                      borderColor: r.is_active === false ? '#fca5a5' : 'var(--color-mist)',
                    }}>
                    {togglingActive === r.id
                      ? <Loader className="w-2.5 h-2.5 animate-spin" />
                      : r.is_active === false ? '✗ off' : '✓ on'}
                  </button>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditing(r)} className="p-1.5 rounded-lg hover:bg-[#D6EDD4]" title="Edit">
                      <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--color-leaf)' }} />
                    </button>
                    {confirmDelete === r.id ? (
                      <>
                        <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                          className="p-1 rounded-lg bg-red-100 hover:bg-red-200 transition-colors">
                          {deleting === r.id ? <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--color-berry)' }} /> : <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-berry)' }} />}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="p-1.5 rounded-lg hover:bg-[#f5f5f5]">
                          <X className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-100" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                  Page {page} of {pages} · {total.toLocaleString()} recipes
                </span>
                <div className="flex gap-2">
                  <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors hover:bg-[#D6EDD4] disabled:opacity-40"
                    style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <button onClick={() => load(page + 1)} disabled={page >= pages || loading}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors hover:bg-[#D6EDD4] disabled:opacity-40"
                    style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editing && <EditModal recipe={editing} onClose={() => setEditing(null)} onSave={handleSaved} />}
    </div>
  );
}
