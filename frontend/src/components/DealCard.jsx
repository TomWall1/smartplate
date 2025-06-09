import React from 'react';
import { TrendingDown } from 'lucide-react';

const DealCard = ({ deal }) => {
  const discountPercentage = deal.originalPrice 
    ? Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100)
    : 0;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex-1">
        <h3 className="font-medium text-gray-900">{deal.name}</h3>
        <p className="text-sm text-gray-600">{deal.category}</p>
      </div>
      
      <div className="text-right">
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
          <div className="flex items-center text-green-600 text-xs">
            <TrendingDown className="w-3 h-3 mr-1" />
            {discountPercentage}% off
          </div>
        )}
      </div>
    </div>
  );
};

export default DealCard;