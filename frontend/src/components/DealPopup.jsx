import React, { useEffect, useRef } from 'react';
import { X, ExternalLink, Tag } from 'lucide-react';

const STORE_COLORS = {
  woolworths: '#007833',
  coles:      '#e31837',
  iga:        '#003da5',
};

function getStoreSearchUrl(ingredient, store) {
  const q = encodeURIComponent(ingredient);
  if (store === 'woolworths') return `https://www.woolworths.com.au/shop/search/products?searchTerm=${q}&isSpecial=true`;
  if (store === 'coles') return `https://www.coles.com.au/search?q=${q}&filter=specialsOnly`;
  if (store === 'iga') return `https://www.iga.com.au/search/?q=${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(ingredient + ' supermarket special')}`;
}

export default function DealPopup({ deal, anchorRef, onClose }) {
  const popupRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, anchorRef]);

  const storeColor = STORE_COLORS[deal.store] ?? 'var(--color-bark)';
  const storeName = deal.store
    ? deal.store.charAt(0).toUpperCase() + deal.store.slice(1)
    : 'Store';
  const searchUrl = getStoreSearchUrl(deal.ingredient, deal.store);

  const hasWasNow = deal.originalPrice && deal.price && deal.originalPrice !== deal.price;
  const discountLabel = deal.discountPercentage
    ? `${Math.round(deal.discountPercentage)}% off`
    : deal.saving
    ? `Save $${deal.saving.toFixed(2)}`
    : null;

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Deal details for ${deal.ingredient}`}
      className="absolute z-50 w-64 rounded-[20px] overflow-hidden"
      style={{
        top: '100%',
        left: 0,
        marginTop: '6px',
        background: '#ffffff',
        border: '1.5px solid var(--color-stone)',
        boxShadow: '0 6px 24px rgba(92, 74, 53, 0.15)',
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: storeColor }}
      >
        <span
          className="text-white text-xs font-bold uppercase tracking-wide"
          style={{ fontFamily: 'Nunito, sans-serif' }}
        >
          {storeName} Special
        </span>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white p-0.5 rounded transition-colors"
          aria-label="Close deal details"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-3 space-y-2">
        <p
          className="text-sm font-semibold leading-snug"
          style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
        >
          {deal.dealName}
        </p>

        <div className="flex items-baseline gap-2 flex-wrap">
          {deal.price != null && (
            <span
              className="text-xl font-bold"
              style={{ color: storeColor, fontFamily: 'Nunito, sans-serif' }}
            >
              ${Number(deal.price).toFixed(2)}
            </span>
          )}
          {hasWasNow && (
            <span
              className="text-sm line-through"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              ${Number(deal.originalPrice).toFixed(2)}
            </span>
          )}
          {discountLabel && (
            <span
              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
              style={{ background: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
            >
              <Tag className="w-3 h-3" />
              {discountLabel}
            </span>
          )}
        </div>

        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: storeColor, fontFamily: 'Nunito, sans-serif' }}
        >
          View at {storeName}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
