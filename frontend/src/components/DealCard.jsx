import React from 'react';
import { TrendingDown, ExternalLink, MousePointer } from 'lucide-react';

const DealCard = ({ deal }) => {
  const discountPercentage = deal.originalPrice 
    ? Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100)
    : deal.discountPercentage || 0;

  const handleClick = () => {
    if (deal.productUrl && deal.productUrl !== '#') {
      window.open(deal.productUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Generate search URL for the store if no direct product URL
      const searchQuery = encodeURIComponent(deal.name);
      let searchUrl;
      
      if (deal.store === 'woolworths') {
        searchUrl = `https://www.woolworths.com.au/shop/search/products?searchTerm=${searchQuery}`;
      } else if (deal.store === 'coles') {
        searchUrl = `https://www.coles.com.au/search?q=${searchQuery}`;
      } else {
        // Generic Google search as ultimate fallback
        searchUrl = `https://www.google.com/search?q=${searchQuery}+${deal.store}+supermarket`;
      }
      
      window.open(searchUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all cursor-pointer group border border-transparent hover:border-gray-200 hover:shadow-sm"
      onClick={handleClick}
      title="Click to view product"
    >
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <h3 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
            {deal.name}
          </h3>
          <ExternalLink className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex items-center space-x-2 mt-1">
          <p className="text-sm text-gray-600">{deal.category}</p>
          {deal.unit && (
            <>
              <span className="text-gray-300">•</span>
              <p className="text-xs text-gray-500">{deal.unit}</p>
            </>
          )}
        </div>
        {deal.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{deal.description}</p>
        )}
      </div>
      
      <div className="text-right ml-4">
        <div className="flex items-center space-x-2">
          <span className="text-lg font-bold text-green-600">
            ${deal.price.toFixed(2)}
          </span>
          {deal.originalPrice && (
            <span className="text-sm text-gray-500 line-through">
              ${deal.originalPrice.toFixed(2)}
            </span>
          )}
        </div>
        {discountPercentage > 0 && (
          <div className="flex items-center justify-end text-green-600 text-xs mt-1">
            <TrendingDown className="w-3 h-3 mr-1" />
            <span className="font-medium">{discountPercentage}% off</span>
          </div>
        )}
        {deal.validUntil && (
          <div className="text-xs text-gray-400 mt-1">
            Until {new Date(deal.validUntil).toLocaleDateString('en-AU', { 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        )}
      </div>
      
      {/* Click indicator */}
      <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <MousePointer className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
};

export default DealCard;