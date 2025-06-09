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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div 
      className="deal-card flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-white cursor-pointer group border border-transparent hover:border-gray-200 hover:shadow-md interactive-element focus:ring-2 focus:ring-primary-300"
      onClick={handleClick}
      onKeyPress={handleKeyPress}
      tabIndex={0}
      role="button"
      aria-label={`View ${deal.name} - $${deal.price.toFixed(2)} at ${deal.store}`}
      title="Click to view product online"
    >
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <h3 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
            {deal.name}
          </h3>
          <ExternalLink className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        <div className="flex items-center space-x-2 mt-1">
          <span className={`text-xs px-2 py-1 rounded-full ${
            deal.category === 'Meat' ? 'bg-red-100 text-red-700' :
            deal.category === 'Seafood' ? 'bg-blue-100 text-blue-700' :
            deal.category === 'Vegetables' ? 'bg-green-100 text-green-700' :
            deal.category === 'Fruit' ? 'bg-orange-100 text-orange-700' :
            deal.category === 'Dairy' ? 'bg-yellow-100 text-yellow-700' :
            deal.category === 'Pantry' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {deal.category}
          </span>
          
          {deal.unit && (
            <span className="text-xs text-gray-500">{deal.unit}</span>
          )}
        </div>
        
        {deal.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{deal.description}</p>
        )}
        
        {deal.validUntil && (
          <div className="text-xs text-gray-400 mt-1">
            Valid until {new Date(deal.validUntil).toLocaleDateString('en-AU', { 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        )}
      </div>
      
      <div className="text-right ml-4 flex flex-col items-end">
        <div className="flex items-center space-x-2 mb-1">
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
          <div className="discount-badge inline-flex items-center bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">
            <TrendingDown className="w-3 h-3 mr-1" />
            {discountPercentage}% off
          </div>
        )}
        
        {/* Store indicator */}
        <div className={`mt-2 w-3 h-3 rounded-full ${
          deal.store === 'woolworths' ? 'woolworths-green' :
          deal.store === 'coles' ? 'coles-red' :
          'bg-gray-400'
        }`} title={deal.store}></div>
      </div>
      
      {/* Click indicator */}
      <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <MousePointer className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
};

export default DealCard;