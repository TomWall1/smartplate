import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import StorePicker from './pages/StorePicker';
import StorePage from './pages/StorePage';
import Recipes from './pages/Recipes';
import RecipeDetail from './pages/RecipeDetail';
import Profile from './pages/Profile';
import { dealsApi, recipesApi, healthApi } from './services/api';
import { WifiOff } from 'lucide-react';

// ── App Context ───────────────────────────────────────────────────────────────
export const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppContext.Provider');
  return ctx;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

const DEFAULT_PREFERENCES = {
  dietary: [],
  dislikes: [],
  pantryItems: [],
  mealTypes: ['quick', 'family-friendly'],
  maxPrepTime: '',
  excludeIngredients: [],
};

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [deals, setDeals] = useState([]);
  const [weeklyRecipes, setWeeklyRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState('unknown');

  const [selectedStore, setSelectedStoreState] = useState(() =>
    loadFromStorage('smartplate-store', null)
  );

  const [preferences, setPreferencesState] = useState(() =>
    loadFromStorage('smartplate-preferences', DEFAULT_PREFERENCES)
  );

  // Wrapped setters that also persist to localStorage
  const setSelectedStore = (store) => {
    setSelectedStoreState(store);
    if (store === null) {
      localStorage.removeItem('smartplate-store');
    } else {
      saveToStorage('smartplate-store', store);
    }
  };

  const setPreferences = (prefs) => {
    setPreferencesState(prefs);
    saveToStorage('smartplate-preferences', prefs);
  };

  // ── On mount: health check + deals + weekly recipes ───────────────────────
  useEffect(() => {
    const init = async () => {
      // Health check (non-blocking)
      healthApi.checkHealth()
        .then(() => setApiStatus('connected'))
        .catch(() => setApiStatus('disconnected'));

      // Load deals
      try {
        const dealsData = await dealsApi.getCurrentDeals();
        const dealList = Array.isArray(dealsData) ? dealsData : (dealsData?.deals ?? []);
        setDeals(dealList);

        // Load weekly recipes using deal ingredients
        try {
          const ingredients = dealList.map((d) => d.name);
          const recipesData = await recipesApi.getRecipeSuggestions(ingredients, {}, []);
          const recipeList = Array.isArray(recipesData) ? recipesData : (recipesData?.recipes ?? []);
          setWeeklyRecipes(recipeList);
        } catch (recipeErr) {
          console.warn('Could not load weekly recipes:', recipeErr.message);
        }
      } catch (dealErr) {
        console.warn('Could not load deals:', dealErr.message);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────
  const contextValue = {
    deals,
    setDeals,
    weeklyRecipes,
    setWeeklyRecipes,
    selectedStore,
    setSelectedStore,
    preferences,
    setPreferences,
    apiStatus,
    loading,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Router>
        {/* Thin disconnected banner */}
        {apiStatus === 'disconnected' && (
          <div className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 py-1.5 px-4 text-xs text-amber-800">
            <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>API not connected — some features may be unavailable</span>
          </div>
        )}

        <Navigation />

        <main style={{ paddingBottom: '80px' }}>
          <Routes>
            <Route path="/" element={<StorePicker />} />
            <Route path="/store/:store" element={<StorePage />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/recipes/:id" element={<RecipeDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </Router>
    </AppContext.Provider>
  );
}

export default App;
