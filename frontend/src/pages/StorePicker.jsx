import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UtensilsCrossed, RefreshCw, HelpCircle } from 'lucide-react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../services/api';

const STORES = [
  {
    id: 'woolworths',
    label: 'Woolworths',
    headerBg: '#007833',
    headerText: '#ffffff',
    lightBg: '#e8f5e9',
    borderColor: '#007833',
    tagline: 'The fresh food people',
    logoUrl: 'https://www.woolworths.com.au/favicon.ico',
  },
  {
    id: 'coles',
    label: 'Coles',
    headerBg: '#e31837',
    headerText: '#ffffff',
    lightBg: '#ffeaed',
    borderColor: '#e31837',
    tagline: 'Good food, great value',
    logoUrl: 'https://www.coles.com.au/favicon.ico',
  },
  {
    id: 'iga',
    label: 'IGA',
    headerBg: '#003da5',
    headerText: '#ffffff',
    lightBg: '#e8eeff',
    borderColor: '#003da5',
    tagline: 'Your local supermarket',
    logoUrl: 'https://www.iga.com.au/favicon.ico',
  },
];

export default function StorePicker() {
  const { deals, loading, selectedStore, setSelectedStore, startOnboarding } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const dealCountFor = (storeId) =>
    deals.filter((d) => d.store === storeId).length;

  const handleSelectStore = async (storeId) => {
    setSelectedStore(storeId);
    if (user) {
      usersApi.updatePreferences({ selected_store: storeId }).catch(() => {});
    }
    navigate(`/store/${storeId}`);
  };

  const handleContinue = () => {
    if (selectedStore) navigate(`/store/${selectedStore}`);
  };

  const selectedMeta = selectedStore
    ? STORES.find((s) => s.id === selectedStore)
    : null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--color-parchment)' }}
    >
      {/* ── Continue banner ─────────────────────────────────────────────── */}
      {selectedMeta && (
        <div
          className="w-full max-w-lg mb-8 rounded-[20px] p-4 flex items-center justify-between"
          style={{
            background: selectedMeta.lightBg,
            border: `1.5px solid ${selectedMeta.borderColor}`,
            boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)',
          }}
        >
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
          >
            Continuing with{' '}
            <span style={{ color: selectedMeta.headerBg }}>{selectedMeta.label}</span>
          </span>
          <button
            onClick={handleContinue}
            className="text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90 hover:-translate-y-px"
            style={{ background: selectedMeta.headerBg, fontFamily: 'Nunito, sans-serif' }}
          >
            Continue →
          </button>
        </div>
      )}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="text-center mb-10">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-[20px] mx-auto mb-4"
          style={{ background: 'var(--color-honey)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.15)' }}
        >
          <UtensilsCrossed className="w-9 h-9 text-white" />
        </div>
        <h1
          className="text-4xl mb-2"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
        >
          Deal to Dish
        </h1>
        <p
          className="text-lg max-w-sm mx-auto"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
        >
          Your weekly specials, matched to real recipes
        </p>
      </div>

      {/* ── Pick a store heading ─────────────────────────────────────────── */}
      <p
        className="font-bold mb-5 text-sm uppercase tracking-wider"
        style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
      >
        Choose your supermarket
      </p>

      {/* ── Store cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {STORES.map((store) => {
          const count = dealCountFor(store.id);
          const isSelected = selectedStore === store.id;

          return (
            <button
              key={store.id}
              onClick={() => handleSelectStore(store.id)}
              className="store-card rounded-[20px] overflow-hidden text-left focus:outline-none"
              style={{
                background: '#ffffff',
                border: isSelected
                  ? `2px solid ${store.headerBg}`
                  : `1.5px solid var(--color-stone)`,
                boxShadow: isSelected
                  ? `0 0 0 3px ${store.headerBg}25`
                  : '0 2px 12px rgba(92, 74, 53, 0.08)',
              }}
              aria-label={`Shop at ${store.label}`}
            >
              {/* Logo area */}
              <div
                className="flex items-center justify-center gap-3 px-4 py-5"
                style={{ background: store.headerBg }}
              >
                <img
                  src={store.logoUrl}
                  alt=""
                  className="w-8 h-8 object-contain rounded"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span
                  className="text-xl"
                  style={{ fontFamily: '"Fredoka One", sans-serif', color: store.headerText }}
                >
                  {store.label}
                </span>
                {isSelected && (
                  <span
                    className="ml-auto text-xs bg-white/25 px-2 py-0.5 rounded-full font-bold"
                    style={{ color: store.headerText, fontFamily: 'Nunito, sans-serif' }}
                  >
                    ✓
                  </span>
                )}
              </div>

              {/* Card body */}
              <div className="px-4 py-3" style={{ background: store.lightBg }}>
                <p
                  className="text-xs mb-2"
                  style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                >
                  {store.tagline}
                </p>
                {loading ? (
                  <div
                    className="flex items-center gap-2 text-sm"
                    style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading deals...</span>
                  </div>
                ) : (
                  <p
                    className="text-sm font-bold"
                    style={{ color: store.headerBg, fontFamily: 'Nunito, sans-serif' }}
                  >
                    {count > 0
                      ? `${count} deal${count !== 1 ? 's' : ''} this week`
                      : 'Check back soon'}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Change store link ────────────────────────────────────────────── */}
      {selectedStore && (
        <p
          className="mt-6 text-sm"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
        >
          Want a different store?{' '}
          <button
            onClick={() => setSelectedStore(null)}
            className="underline transition-colors hover:opacity-70"
            style={{ color: 'var(--color-bark)' }}
          >
            Clear selection
          </button>
        </p>
      )}

      {/* ── How it works (re-trigger onboarding) ──────────────────────── */}
      <button
        onClick={startOnboarding}
        className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors hover:opacity-70"
        style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
      >
        <HelpCircle className="w-4 h-4" />
        How it works
      </button>
    </div>
  );
}
