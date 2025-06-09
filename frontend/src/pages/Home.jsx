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
          className="inline-flex items-center space-x-2 px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50"
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
            brandColor="bg-green-600"
          />
          <StoreSection
            title="Coles"
            deals={colesDeals}
            logo="https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Coles_logo.svg/320px-Coles_logo.svg.png"
            storeUrl="https://www.coles.com.au"
            brandColor="bg-red-600"
          />
        </div>
      )}

      {!loading && deals.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">No deals available at the moment.</p>
          <button
            onClick={onRefreshDeals}
            className="mt-4 text-primary-500 hover:text-primary-600"
          >
            Try refreshing
          </button>
        </div>
      )}
    </div>
  );
};

const StoreSection = ({ title, deals, logo, storeUrl, brandColor }) => (
  <div className="bg-white rounded-lg shadow-sm border p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center space-x-3">
        <img 
          src={logo} 
          alt={`${title} logo`}
          className="h-8 w-auto object-contain"
          onError={(e) => {
            // Fallback to text if logo fails to load
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'block';
          }}
        />
        <h2 
          className={`text-xl font-semibold text-white px-3 py-1 rounded ${brandColor}`}
          style={{ display: 'none' }}
        >
          {title}
        </h2>
        <span className="text-sm text-gray-500">({deals.length} deals)</span>
      </div>
      
      <a 
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-400 hover:text-gray-600 transition-colors"
        title={`Visit ${title} website`}
      >
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
    
    <div className="space-y-3">
      {deals.slice(0, 12).map((deal, index) => (
        <DealCard key={index} deal={deal} />
      ))}
      {deals.length > 12 && (
        <div className="text-center pt-3">
          <p className="text-sm text-gray-500">
            +{deals.length - 12} more deals
          </p>
          <a 
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:text-primary-600 text-sm font-medium"
          >
            View all on {title} →
          </a>
        </div>
      )}
    </div>
  </div>
);

export default Home;