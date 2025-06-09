import React from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import DealCard from '../components/DealCard';

const Home = ({ deals, loading, onRefreshDeals, apiStatus }) => {
  const woolworthsDeals = deals.filter(deal => deal.store === 'woolworths');
  const colesDeals = deals.filter(deal => deal.store === 'coles');

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          This Week's Supermarket Deals
        </h1>
        <p className="text-gray-600 mb-6">
          Find recipes that make the most of this week's discounted ingredients
        </p>
        <button
          onClick={onRefreshDeals}
          disabled={loading}
          className="btn-primary inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Deals</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading latest deals...</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <StoreSection
            title="Woolworths"
            deals={woolworthsDeals}
            logo="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Woolworths_logo.svg/320px-Woolworths_logo.svg.png"
            storeUrl="https://www.woolworths.com.au"
            brandColor="woolworths-green"
            storeName="woolworths"
          />
          <StoreSection
            title="Coles"
            deals={colesDeals}
            logo="https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Coles_logo.svg/320px-Coles_logo.svg.png"
            storeUrl="https://www.coles.com.au"
            brandColor="coles-red"
            storeName="coles"
          />
        </div>
      )}

      {!loading && deals.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🛒</div>
          <p className="text-gray-600 text-lg mb-4">No deals available at the moment.</p>
          <button
            onClick={onRefreshDeals}
            className="btn-secondary"
          >
            Try refreshing
          </button>
        </div>
      )}
      
      {/* Total savings summary */}
      {!loading && deals.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            💰 Potential Weekly Savings
          </h3>
          <div className="flex justify-center space-x-8">
            <div>
              <p className="text-2xl font-bold text-green-600">
                ${deals.reduce((total, deal) => total + ((deal.originalPrice || 0) - deal.price), 0).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">Total savings available</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{deals.length}</p>
              <p className="text-sm text-gray-600">Deals this week</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StoreSection = ({ title, deals, logo, storeUrl, brandColor, storeName }) => (
  <div className={`store-section ${storeName} bg-white rounded-lg shadow-sm border p-6 interactive-element hover:shadow-md`}>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center space-x-3">
        <img 
          src={logo} 
          alt={`${title} logo`}
          className="store-logo h-8 w-auto object-contain"
          onError={(e) => {
            // Fallback to text if logo fails to load
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        <div 
          className={`hidden items-center text-white px-3 py-1 rounded font-semibold text-sm ${brandColor}`}
        >
          {title}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">({deals.length} deals)</span>
          {deals.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
              {Math.round(deals.reduce((avg, deal) => {
                const discount = deal.originalPrice ? 
                  ((deal.originalPrice - deal.price) / deal.originalPrice) * 100 : 
                  deal.discountPercentage || 0;
                return avg + discount;
              }, 0) / deals.length)}% avg savings
            </span>
          )}
        </div>
      </div>
      
      <a 
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded"
        title={`Visit ${title} website`}
      >
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
    
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {deals.slice(0, 12).map((deal, index) => (
        <DealCard key={`${deal.name}-${index}`} deal={deal} />
      ))}
      
      {deals.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-3xl mb-2">📦</div>
          <p>No deals available from {title}</p>
        </div>
      )}
      
      {deals.length > 12 && (
        <div className="text-center pt-3 border-t border-gray-100">
          <p className="text-sm text-gray-500 mb-2">
            +{deals.length - 12} more deals available
          </p>
          <a 
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-primary-500 hover:text-primary-600 text-sm font-medium transition-colors"
          >
            View all on {title}
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </div>
      )}
    </div>
  </div>
);

export default Home;