import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, User, RefreshCw, AlertCircle, MapPin, Loader2, Users, Crown, LogOut } from 'lucide-react';
import { useApp } from '../App';
import { recipesApi, usersApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { STORE_COLORS } from '../constants/colors';

// NOTE: dietary / meal-type / allergen preference cards were removed — they
// saved fields the app never read (or matched tags the recipe library doesn't
// have), which only confused users. Recipe filtering lives on the Recipes
// page, where it works. The profile holds durable account facts only.

const STORE_OPTIONS = [
  { id: 'woolworths', label: 'Woolworths' },
  { id: 'coles',      label: 'Coles' },
  { id: 'iga',        label: 'IGA' },
];

const HOUSEHOLD_OPTIONS = [1, 2, 3, 4, 5, 6];

const AU_STATES = [
  { id: 'nsw', label: 'NSW', full: 'New South Wales' },
  { id: 'vic', label: 'VIC', full: 'Victoria' },
  { id: 'qld', label: 'QLD', full: 'Queensland' },
  { id: 'wa',  label: 'WA',  full: 'Western Australia' },
  { id: 'sa',  label: 'SA',  full: 'South Australia' },
  { id: 'tas', label: 'TAS', full: 'Tasmania' },
  { id: 'act', label: 'ACT', full: 'Australian Capital Territory' },
  { id: 'nt',  label: 'NT',  full: 'Northern Territory' },
];

const cardStyle = {
  background: 'var(--color-surface)',
  border: '1.5px solid var(--color-stone)',
  borderRadius: '12px',
  boxShadow: '0 2px 12px rgba(42, 36, 31, 0.08)',
  padding: '24px',
};


// Small transient "Saved" badge shared by the cards
function SavedBadge({ status }) {
  if (status === 'saving') {
    return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />;
  }
  if (status === 'saved') {
    return (
      <span
        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)' }}
      >
        <Check className="w-3 h-3" /> Saved
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ background: '#FEE2E2', color: '#DC2626' }}
      >
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return null;
}

export default function Profile() {
  const { userState, setUserState, householdSize, setHouseholdSize, selectedStore, setDefaultStore } = useApp();
  const { user, signOut } = useAuth();
  const { isPremium, premiumSince } = usePremium();
  const navigate = useNavigate();

  const [regenStatus, setRegenStatus] = useState('idle');
  const [regenResult, setRegenResult] = useState(null);

  // State selector
  const [stateStatus, setStateStatus] = useState('idle'); // idle | saving | saved | error
  const stateTimerRef = useRef(null);

  // Store + household selectors share the same transient-status pattern
  const [storeStatus, setStoreStatus] = useState('idle');
  const storeTimerRef = useRef(null);
  const [householdStatus, setHouseholdStatus] = useState('idle');
  const householdTimerRef = useRef(null);

  const flashStatus = (setStatus, timerRef) => {
    setStatus('saved');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('idle'), 2500);
  };

  const handleStoreChange = (storeId) => {
    if (storeId === selectedStore) return;
    setDefaultStore(storeId);
    flashStatus(setStoreStatus, storeTimerRef);
  };

  const handleHouseholdChange = (size) => {
    const next = size === householdSize ? null : size; // tap again to clear
    setHouseholdSize(next);
    flashStatus(setHouseholdStatus, householdTimerRef);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { state: { choose: true } });
  };

  const handleRegenerate = async () => {
    setRegenStatus('loading');
    setRegenResult(null);
    try {
      const data = await recipesApi.generateWeekly();
      setRegenResult({ recipeCount: data.recipeCount });
      setRegenStatus('success');
    } catch (err) {
      setRegenResult({ error: err.message || 'Generation failed' });
      setRegenStatus('error');
    }
  };

  const handleStateChange = async (stateId) => {
    if (stateId === userState) return;
    setStateStatus('saving');
    try {
      if (user) {
        await usersApi.updateState(stateId);
      }
      setUserState(stateId);
      setStateStatus('saved');
      clearTimeout(stateTimerRef.current);
      stateTimerRef.current = setTimeout(() => setStateStatus('idle'), 2500);
    } catch {
      setStateStatus('error');
      clearTimeout(stateTimerRef.current);
      stateTimerRef.current = setTimeout(() => setStateStatus('idle'), 3000);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-[12px] flex items-center justify-center"
            style={{ background: 'var(--color-brand)', boxShadow: '0 2px 12px rgba(42, 36, 31, 0.1)' }}
          >
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-bark)', fontSize: '24px' }}>
              Your Profile
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
              Tell us where you shop so your deals and recipes match your local catalogue.
            </p>
          </div>
        </div>

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2
                style={{ fontFamily: 'var(--font-display)', color: 'var(--color-bark)', fontSize: '18px' }}
              >
                Your Location
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
                We'll show you deals from supermarkets in your state.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <SavedBadge status={stateStatus} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {AU_STATES.map(({ id, label, full }) => {
              const isSelected = userState === id;
              return (
                <button
                  key={id}
                  onClick={() => handleStateChange(id)}
                  disabled={stateStatus === 'saving'}
                  title={full}
                  className="flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border-2 transition-all font-semibold disabled:opacity-50"
                  style={{
                    borderColor:  isSelected ? 'var(--color-leaf)' : 'var(--color-stone)',
                    background:   isSelected ? 'var(--color-leaf)' : '#ffffff',
                    color:        isSelected ? '#ffffff' : 'var(--color-bark)',
                    fontFamily:   'var(--font-ui)',
                    boxShadow:    isSelected ? '0 2px 8px rgba(125, 184, 122, 0.35)' : 'none',
                    transform:    isSelected ? 'translateY(-1px)' : 'none',
                  }}
                >
                  <span className="text-base font-extrabold leading-none">{label}</span>
                </button>
              );
            })}
          </div>

          {!user && (
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
              <MapPin className="w-3 h-3 inline mr-0.5 -mt-0.5" />
              Sign in to save your location between sessions.
            </p>
          )}
        </section>

        {/* ── My Store ─────────────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-bark)', fontSize: '18px' }}>
                My Store
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
                You'll land straight on this store's deals whenever you open the app.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <SavedBadge status={storeStatus} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {STORE_OPTIONS.map(({ id, label }) => {
              const isSelected = selectedStore === id;
              const brand = STORE_COLORS[id];
              return (
                <button
                  key={id}
                  onClick={() => handleStoreChange(id)}
                  className="flex items-center justify-center py-3 rounded-xl border-2 transition-all font-bold text-sm"
                  style={{
                    borderColor: isSelected ? brand.bg : 'var(--color-stone)',
                    background:  isSelected ? brand.bg : '#ffffff',
                    color:       isSelected ? brand.text : 'var(--color-bark)',
                    fontFamily:  'var(--font-ui)',
                    boxShadow:   isSelected ? `0 2px 8px ${brand.bg}55` : 'none',
                    transform:   isSelected ? 'translateY(-1px)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {!user && selectedStore && (
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
              Sign in to save your store to your account.
            </p>
          )}
        </section>

        {/* ── Household size ───────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-bark)', fontSize: '18px' }}>
                <Users className="w-4 h-4 inline mr-1.5 -mt-1" />
                Cooking for how many?
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
                We'll show recipe costs scaled to your household. Tap again to clear.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <SavedBadge status={householdStatus} />
            </div>
          </div>

          <div className="grid grid-cols-6 gap-2">
            {HOUSEHOLD_OPTIONS.map((n) => {
              const isSelected = householdSize === n;
              return (
                <button
                  key={n}
                  onClick={() => handleHouseholdChange(n)}
                  className="flex items-center justify-center py-3 rounded-xl border-2 transition-all font-extrabold"
                  style={{
                    borderColor: isSelected ? 'var(--color-leaf)' : 'var(--color-stone)',
                    background:  isSelected ? 'var(--color-leaf)' : '#ffffff',
                    color:       isSelected ? '#ffffff' : 'var(--color-bark)',
                    fontFamily:  'var(--font-ui)',
                    boxShadow:   isSelected ? '0 2px 8px rgba(125, 184, 122, 0.35)' : 'none',
                  }}
                >
                  {n === 6 ? '6+' : n}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Account & Plan ───────────────────────────────────────────────── */}
        <section style={cardStyle}>
          <h2 className="mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-bark)', fontSize: '18px' }}>
            Account &amp; Plan
          </h2>

          {user ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--color-bark)', fontFamily: 'var(--font-ui)' }}>
                    {user.email}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
                    {isPremium && premiumSince
                      ? `Premium member since ${new Date(premiumSince).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}`
                      : 'Free plan'}
                  </p>
                </div>
                <span
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{
                    background: isPremium ? 'var(--color-honey)' : 'var(--color-mist)',
                    color:      isPremium ? '#ffffff' : 'var(--color-text-green)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  <Crown className="w-3.5 h-3.5" />
                  {isPremium ? 'Premium' : 'Free'}
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {!isPremium && (
                  <button
                    onClick={() => navigate('/premium')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
                    style={{ background: 'var(--color-brand)', fontFamily: 'var(--font-ui)' }}
                  >
                    <Crown className="w-4 h-4" />
                    Upgrade to Premium
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 border-2"
                  style={{ borderColor: 'var(--color-stone)', color: 'var(--color-bark)', background: 'var(--color-surface)', fontFamily: 'var(--font-ui)' }}
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
                Sign in to save your store, location and household across devices — and to use favourites and meal planning.
              </p>
              <button
                onClick={() => navigate('/auth')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
                style={{ background: 'var(--color-leaf)', fontFamily: 'var(--font-ui)' }}
              >
                <User className="w-4 h-4" />
                Sign in / Create account
              </button>
            </div>
          )}
        </section>

        {/* ── Admin: Regenerate Recipes ─────────────────────────────────────── */}
        <section style={cardStyle}>
          <h2
            className="mb-1"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-bark)', fontSize: '18px' }}
          >
            Recipe Library
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}>
            Fetch the latest supermarket specials and regenerate this week's matched recipes.
            This takes 2–3 minutes.
          </p>

          {regenStatus === 'success' && (
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4 border"
              style={{ background: 'var(--color-mist)', borderColor: 'var(--color-leaf)', color: 'var(--color-text-green)', fontFamily: 'var(--font-ui)' }}
            >
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Done. {regenResult?.recipeCount ?? '?'} recipes generated.</span>
            </div>
          )}

          {regenStatus === 'error' && (
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4 border"
              style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'var(--font-ui)' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{regenResult?.error || 'Generation failed. Check the server logs.'}</span>
            </div>
          )}

          <button
            onClick={handleRegenerate}
            disabled={regenStatus === 'loading'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 hover:-translate-y-px shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-bark)', color: '#ffffff', fontFamily: 'var(--font-ui)' }}
          >
            <RefreshCw className={`w-4 h-4 ${regenStatus === 'loading' ? 'animate-spin' : ''}`} />
            {regenStatus === 'loading' ? 'Generating… (2–3 min)' : 'Regenerate Recipes'}
          </button>
        </section>
      </div>
    </div>
  );
}
