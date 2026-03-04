import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UtensilsCrossed, ShoppingBag, RefreshCw } from 'lucide-react';
import { useApp } from '../App';

const STORES = [
  {
    id: 'woolworths',
    label: 'Woolworths',
    headerBg: '#007833',
    headerText: '#ffffff',
    lightBg: '#e8f5e9',
    borderColor: '#007833',
    tagline: 'The fresh food people',
    logoUrl: 'https://logo.clearbit.com/woolworths.com.au',
  },
  {
    id: 'coles',
    label: 'Coles',
    headerBg: '#e31837',
    headerText: '#ffffff',
    lightBg: '#ffeaed',
    borderColor: '#e31837',
    tagline: 'Good food, great value',
    logoUrl: 'https://logo.clearbit.com/coles.com.au',
  },
  {
    id: 'iga',
    label: 'IGA',
    headerBg: '#003da5',
    headerText: '#ffffff',
    lightBg: '#e8eeff',
    borderColor: '#003da5',
    tagline: 'Your local supermarket',
    logoUrl: 'https://logo.clearbit.com/iga.com.au',
  },
];

export default function StorePicker() {
  const { deals, loading, selectedStore, setSelectedStore } = useApp();
  const navigate = useNavigate();

  const dealCountFor = (storeId) =>
    deals.filter((d) => d.store === storeId).length;

  const handleSelectStore = (storeId) => {
    setSelectedStore(storeId);
    navigate(`/store/${storeId}`);
  };

  const handleContinue = () => {
    if (selectedStore) navigate(`/store/${selectedStore}`);
  };

  const selectedMeta = selectedStore
    ? STORES.find((s) => s.id === selectedStore)
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-white">
      {/* ── Continue banner ─────────────────────────────────────────────── */}
      {selectedMeta && (
        <div
          className="w-full max-w-lg mb-8 rounded-2xl p-4 flex items-center justify-between shadow-sm"
          style={{ background: selectedMeta.lightBg, border: `1.5px solid ${selectedMeta.borderColor}` }}
        >
          <span className="text-sm font-medium text-stone-700">
            Continuing with{' '}
            <span style={{ color: selectedMeta.headerBg }} className="font-bold">
              {selectedMeta.label}
            </span>
          </span>
          <button
            onClick={handleContinue}
            className="text-sm font-semibold px-4 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ background: selectedMeta.headerBg }}
          >
            Continue →
          </button>
        </div>
      )}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mx-auto mb-4 shadow-md">
          <UtensilsCrossed className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-stone-900 mb-2 tracking-tight">Deals to Dish</h1>
        <p className="text-stone-500 text-lg max-w-sm mx-auto">
          Your weekly specials, matched to real recipes
        </p>
      </div>

      {/* ── Pick a store heading ─────────────────────────────────────────── */}
      <p className="text-stone-600 font-medium mb-5 text-sm uppercase tracking-wider">
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
              className="store-card bg-white rounded-2xl overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                border: isSelected
                  ? `2px solid ${store.headerBg}`
                  : '2px solid #e5e7eb',
                boxShadow: isSelected
                  ? `0 0 0 2px ${store.headerBg}30`
                  : undefined,
              }}
              aria-label={`Shop at ${store.label}`}
            >
              {/* Logo area */}
              <div
                className="flex items-center justify-center px-4 py-5"
                style={{ background: store.headerBg }}
              >
                <img
                  src={store.logoUrl}
                  alt={store.label}
                  className="h-10 object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.querySelector('.logo-fallback').style.display = 'flex';
                  }}
                />
                <span
                  className="logo-fallback items-center gap-2 font-bold text-xl"
                  style={{ display: 'none', color: store.headerText }}
                >
                  <ShoppingBag className="w-6 h-6 opacity-80" />
                  {store.label}
                </span>
                {isSelected && (
                  <span className="ml-auto text-xs bg-white/25 px-2 py-0.5 rounded-full font-medium"
                    style={{ color: store.headerText }}>
                    Selected
                  </span>
                )}
              </div>

              {/* Card body */}
              <div className="px-4 py-3" style={{ background: store.lightBg }}>
                <p className="text-xs text-stone-500 mb-2">{store.tagline}</p>
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading deals...</span>
                  </div>
                ) : (
                  <p className="text-sm font-semibold" style={{ color: store.headerBg }}>
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
        <p className="mt-6 text-sm text-stone-400">
          Want a different store?{' '}
          <button
            onClick={() => setSelectedStore(null)}
            className="underline text-stone-500 hover:text-stone-700 transition-colors"
          >
            Clear selection
          </button>
        </p>
      )}
    </div>
  );
}
