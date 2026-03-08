import React from 'react';
import { TrendingDown, ExternalLink } from 'lucide-react';

// Category → style guide colour mapping
const CATEGORY_STYLE = {
  Meat:      { bg: 'var(--color-peach)',     color: 'var(--color-bark)' },
  Seafood:   { bg: 'var(--color-sky)',       color: '#1a4a5a' },
  Vegetables:{ bg: 'var(--color-mist)',      color: 'var(--color-text-green)' },
  Fruit:     { bg: 'var(--color-peach)',     color: 'var(--color-bark)' },
  Dairy:     { bg: 'var(--color-cream)',     color: 'var(--color-bark)' },
  Pantry:    { bg: 'var(--color-blush)',     color: 'var(--color-bark)' },
};

const DEFAULT_CATEGORY_STYLE = { bg: 'var(--color-mist)', color: 'var(--color-text-green)' };

const DealCard = ({ deal }) => {
  const discountPercentage = deal.originalPrice
    ? Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100)
    : deal.discountPercentage || 0;

  const catStyle = CATEGORY_STYLE[deal.category] ?? DEFAULT_CATEGORY_STYLE;

  const handleClick = () => {
    if (deal.productUrl && deal.productUrl !== '#') {
      window.open(deal.productUrl, '_blank', 'noopener,noreferrer');
    } else {
      const searchQuery = encodeURIComponent(deal.name);
      let searchUrl;
      if (deal.store === 'woolworths') {
        searchUrl = `https://www.woolworths.com.au/shop/search/products?searchTerm=${searchQuery}`;
      } else if (deal.store === 'coles') {
        searchUrl = `https://www.coles.com.au/search?q=${searchQuery}`;
      } else if (deal.store === 'iga') {
        searchUrl = `https://www.iga.com.au/search/?q=${searchQuery}`;
      } else {
        searchUrl = `https://www.google.com/search?q=${searchQuery}+${deal.store}+supermarket`;
      }
      window.open(searchUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="deal-card flex items-center justify-between p-3 rounded-[20px] cursor-pointer group"
      style={{
        background: '#ffffff',
        border: '1.5px solid var(--color-stone)',
        boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)',
      }}
      onClick={handleClick}
      onKeyPress={handleKeyPress}
      tabIndex={0}
      role="button"
      aria-label={`View ${deal.name} - $${deal.price.toFixed(2)} at ${deal.store}`}
      title="Click to view product online"
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3
            className="font-bold leading-snug"
            style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif', fontSize: '14px' }}
          >
            {deal.name}
          </h3>
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {deal.category && (
            <span
              className="text-xs font-bold px-3 py-0.5 rounded-full"
              style={{ background: catStyle.bg, color: catStyle.color, fontFamily: 'Nunito, sans-serif' }}
            >
              {deal.category}
            </span>
          )}
          {deal.unit && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
              {deal.unit}
            </span>
          )}
        </div>

        {deal.description && (
          <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
            {deal.description}
          </p>
        )}

        {deal.validUntil && (
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
            Valid until {new Date(deal.validUntil).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      <div className="text-right ml-4 flex flex-col items-end gap-1">
        <div className="flex items-baseline gap-2">
          <span
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
          >
            ${deal.price.toFixed(2)}
          </span>
          {deal.originalPrice && (
            <span className="text-sm line-through" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
              ${deal.originalPrice.toFixed(2)}
            </span>
          )}
        </div>

        {discountPercentage > 0 && (
          <span
            className="discount-badge inline-flex items-center gap-1 text-xs font-bold px-3 py-0.5 rounded-full text-white"
            style={{ background: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
          >
            <TrendingDown className="w-3 h-3" />
            {discountPercentage}% off
          </span>
        )}

        {/* Store dot */}
        <div
          className={`w-2.5 h-2.5 rounded-full mt-1 ${
            deal.store === 'woolworths' ? 'woolworths-green' :
            deal.store === 'coles' ? 'coles-red' :
            deal.store === 'iga' ? 'iga-blue' : ''
          }`}
          style={!['woolworths', 'coles', 'iga'].includes(deal.store) ? { background: 'var(--color-stone)' } : {}}
          title={deal.store}
        />
      </div>
    </div>
  );
};

export default DealCard;
