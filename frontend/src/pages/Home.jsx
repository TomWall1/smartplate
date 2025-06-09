import React from 'react';
import { RefreshCw, Store } from 'lucide-react';
import DealCard from '../components/DealCard';

const Home = ({ deals, loading, onRefreshDeals }) => {
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
            color="bg-green-500"
          />
          <StoreSection
            title="Coles"
            deals={colesDeals}
            color="bg-red-500"
          />
        </div>
      )}
    </div>
  );
};

const StoreSection = ({ title, deals, color }) => (
  <div className="bg-white rounded-lg shadow-sm border p-6">
    <div className="flex items-center space-x-2 mb-4">
      <div className={`w-4 h-4 ${color} rounded`}></div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <span className="text-sm text-gray-500">({deals.length} deals)</span>
    </div>
    
    <div className="space-y-3">
      {deals.slice(0, 10).map((deal, index) => (
        <DealCard key={index} deal={deal} />
      ))}
      {deals.length > 10 && (
        <p className="text-sm text-gray-500 text-center">
          +{deals.length - 10} more deals
        </p>
      )}
    </div>
  </div>
);

export default Home;