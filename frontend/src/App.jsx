import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Recipes from './pages/Recipes';
import Profile from './pages/Profile';
import Navigation from './components/Navigation';

function App() {
  const [preferences, setPreferences] = useState({
    dietary: [],
    dislikes: [],
    pantryItems: [],
    mealTypes: ['quick', 'family-friendly']
  });

  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial data
    loadDeals();
    loadPreferences();
  }, []);

  const loadDeals = async () => {
    try {
      setLoading(true);
      // For now, use mock data until backend is ready
      const mockDeals = [
        { name: "Atlantic Salmon", category: "Seafood", price: 12.99, originalPrice: 18.99, store: "woolworths" },
        { name: "Chicken Breast", category: "Meat", price: 8.99, originalPrice: 12.99, store: "woolworths" },
        { name: "Baby Spinach", category: "Vegetables", price: 2.50, originalPrice: 3.99, store: "coles" },
        { name: "Greek Yogurt", category: "Dairy", price: 4.50, originalPrice: 6.99, store: "coles" },
        { name: "Avocados", category: "Vegetables", price: 1.99, originalPrice: 2.99, store: "woolworths" }
      ];
      setDeals(mockDeals);
    } catch (error) {
      console.error('Error loading deals:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = () => {
    const saved = localStorage.getItem('smartplate-preferences');
    if (saved) {
      setPreferences(JSON.parse(saved));
    }
  };

  const updatePreferences = (newPreferences) => {
    setPreferences(newPreferences);
    localStorage.setItem('smartplate-preferences', JSON.stringify(newPreferences));
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route 
              path="/" 
              element={
                <Home 
                  deals={deals} 
                  loading={loading}
                  onRefreshDeals={loadDeals}
                />
              } 
            />
            <Route 
              path="/recipes" 
              element={
                <Recipes 
                  deals={deals}
                  preferences={preferences}
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