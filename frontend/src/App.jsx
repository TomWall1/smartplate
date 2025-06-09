import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Recipes from './pages/Recipes';
import Profile from './pages/Profile';
import Navigation from './components/Navigation';
import { dealsApi, healthApi } from './services/api';

function App() {
  const [preferences, setPreferences] = useState({
    dietary: [],
    dislikes: [],
    pantryItems: [],
    mealTypes: ['quick', 'family-friendly']
  });

  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState('unknown');
  const [error, setError] = useState(null);

  useEffect(() => {
    // Load initial data
    checkApiHealth();
    loadDeals();
    loadPreferences();
  }, []);

  const checkApiHealth = async () => {
    try {
      await healthApi.checkHealth();
      setApiStatus('connected');
      console.log('Backend API is connected');
    } catch (error) {
      setApiStatus('disconnected');
      console.warn('Backend API is not available, using frontend-only mode');
    }
  };

  const loadDeals = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const dealsData = await dealsApi.getCurrentDeals();
      setDeals(dealsData);
      console.log(`Loaded ${dealsData.length} deals from API`);
    } catch (error) {
      console.error('Error loading deals:', error);
      setError('Failed to load deals from server');
      
      // Fallback to mock data for demonstration
      const mockDeals = [
        { name: "Atlantic Salmon", category: "Seafood", price: 12.99, originalPrice: 18.99, store: "woolworths" },
        { name: "Chicken Breast", category: "Meat", price: 8.99, originalPrice: 12.99, store: "woolworths" },
        { name: "Baby Spinach", category: "Vegetables", price: 2.50, originalPrice: 3.99, store: "coles" },
        { name: "Greek Yogurt", category: "Dairy", price: 4.50, originalPrice: 6.99, store: "coles" },
        { name: "Avocados", category: "Vegetables", price: 1.99, originalPrice: 2.99, store: "woolworths" }
      ];
      setDeals(mockDeals);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeals = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (apiStatus === 'connected') {
        await dealsApi.refreshDeals();
        const dealsData = await dealsApi.getCurrentDeals();
        setDeals(dealsData);
        console.log('Deals refreshed from API');
      } else {
        // Simulate refresh with mock data
        await new Promise(resolve => setTimeout(resolve, 1000));
        await loadDeals();
      }
    } catch (error) {
      console.error('Error refreshing deals:', error);
      setError('Failed to refresh deals');
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = () => {
    const saved = localStorage.getItem('smartplate-preferences');
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }
  };

  const updatePreferences = (newPreferences) => {
    setPreferences(newPreferences);
    localStorage.setItem('smartplate-preferences', JSON.stringify(newPreferences));
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation apiStatus={apiStatus} />
        
        {/* API Status Banner */}
        {apiStatus === 'disconnected' && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Backend API is not connected. Running in demo mode with sample data.
                  {' '}
                  <button 
                    onClick={checkApiHealth}
                    className="font-medium underline hover:text-yellow-600"
                  >
                    Retry connection
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  {error}
                  {' '}
                  <button 
                    onClick={() => setError(null)}
                    className="font-medium underline hover:text-red-600"
                  >
                    Dismiss
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route 
              path="/" 
              element={
                <Home 
                  deals={deals} 
                  loading={loading}
                  onRefreshDeals={refreshDeals}
                  apiStatus={apiStatus}
                />
              } 
            />
            <Route 
              path="/recipes" 
              element={
                <Recipes 
                  deals={deals}
                  preferences={preferences}
                  apiStatus={apiStatus}
                />
              } 
            />
            <Route 
              path="/profile" 
              element={
                <Profile 
                  preferences={preferences}
                  onUpdatePreferences={updatePreferences}
                />
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;