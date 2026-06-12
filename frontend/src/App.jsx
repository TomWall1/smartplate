import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import StorePicker from './pages/StorePicker';
import StorePage from './pages/StorePage';
import Recipes from './pages/Recipes';
import RecipeDetail from './pages/RecipeDetail';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import Favorites from './pages/Favorites';
import MealPlanner from './pages/MealPlanner';
import ShoppingList from './pages/ShoppingList';
import PriceAlerts from './pages/PriceAlerts';
import PantryMatcher from './pages/PantryMatcher';
import Premium from './pages/Premium';
import Admin from './pages/Admin';
import AdminRecipes from './pages/AdminRecipes';
import AdminBlocklist from './pages/AdminBlocklist';
import AdminFeedbackDashboard from './pages/AdminFeedbackDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PremiumProvider } from './context/PremiumContext';
import { dealsApi, recipesApi, healthApi, usersApi } from './services/api';
import { filterFoodDeals } from './utils/dealFilters';
import { WifiOff } from 'lucide-react';
import Onboarding, { useOnboarding } from './components/Onboarding';
import { useWarmupFetch } from './hooks/useWarmupFetch';

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
  mealTypes: [],
  maxPrepTime: '',
  excludeIngredients: [],
};

// ── Inner app (has access to AuthContext) ─────────────────────────────────────
function AppInner() {
  const { user } = useAuth();

  const [deals, setDeals] = useState([]);
  const [weeklyRecipes, setWeeklyRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState('unknown');
  const { showOnboarding, startOnboarding, dismissOnboarding } = useOnboarding();

  const [selectedStore, setSelectedStoreState] = useState(() =>
    loadFromStorage('smartplate-store', null)
  );

  const [preferences, setPreferencesState] = useState(() =>
    loadFromStorage('smartplate-preferences', DEFAULT_PREFERENCES)
  );

  const [userState, setUserStateLocal] = useState(() =>
    loadFromStorage('smartplate-state', 'nsw')
  );

  const [householdSize, setHouseholdSizeLocal] = useState(() =>
    loadFromStorage('smartplate-household', null)
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

  // setUserState: persist locally + save to backend when logged in
  const setUserState = (state) => {
    setUserStateLocal(state);
    saveToStorage('smartplate-state', state);
    if (user) {
      usersApi.updateState(state).catch(() => {
        // Silently ignore — local state is already updated
      });
    }
  };

  // setHouseholdSize: persist locally + save to backend when logged in
  const setHouseholdSize = (size) => {
    setHouseholdSizeLocal(size);
    if (size === null) {
      localStorage.removeItem('smartplate-household');
    } else {
      saveToStorage('smartplate-household', size);
    }
    if (user) {
      usersApi.updatePreferences({ household_size: size }).catch(() => {});
    }
  };

  // setDefaultStore: the account-level store (same selected_store field the
  // picker saves) — set from the Profile page; the picker auto-forwards to it
  const setDefaultStore = (storeId) => {
    setSelectedStore(storeId);
    if (user) {
      usersApi.updatePreferences({ selected_store: storeId }).catch(() => {});
    }
  };

  // ── Sync user profile from Supabase when auth state changes ───────────────
  useEffect(() => {
    if (!user) return;

    usersApi.getProfile()
      .then((profile) => {
        // Apply saved store (Supabase wins over localStorage)
        if (profile.selected_store) {
          setSelectedStoreState(profile.selected_store);
          saveToStorage('smartplate-store', profile.selected_store);
        }
        // Apply saved state (Supabase wins over localStorage)
        if (profile.state) {
          setUserStateLocal(profile.state);
          saveToStorage('smartplate-state', profile.state);
        }
        // Apply saved household size (Supabase wins over localStorage)
        if (profile.household_size) {
          setHouseholdSizeLocal(profile.household_size);
          saveToStorage('smartplate-household', profile.household_size);
        }
        // Merge saved dietary/excluded preferences into existing prefs
        if (profile.dietary_restrictions?.length || profile.excluded_ingredients?.length) {
          setPreferencesState((prev) => {
            const merged = {
              ...prev,
              dietary:           profile.dietary_restrictions ?? prev.dietary,
              excludeIngredients: profile.excluded_ingredients ?? prev.excludeIngredients,
            };
            saveToStorage('smartplate-preferences', merged);
            return merged;
          });
        }
      })
      .catch(() => {
        // Profile fetch failed — silently fall back to localStorage values
      });
  }, [user]);

  // ── Deals + weekly recipes fetch ──────────────────────────────────────────
  // 503-warmup retry/countdown mechanics live in useWarmupFetch (shared with
  // StorePage). This callback owns only the data handling.
  const fetchDealsAndRecipes = React.useCallback(async () => {
    const currentState = loadFromStorage('smartplate-state', 'nsw');
    const dealsData = await dealsApi.getCurrentDeals(currentState);
    const dealList = Array.isArray(dealsData) ? dealsData : (dealsData?.deals ?? []);
    setDeals(filterFoodDeals(dealList));

    try {
      const ingredients = dealList.map((d) => d.name);
      const recipesData = await recipesApi.getRecipeSuggestions(ingredients, {}, [], currentState);
      const recipeList = Array.isArray(recipesData) ? recipesData : (recipesData?.recipes ?? []);
      setWeeklyRecipes(recipeList);
    } catch (recipeErr) {
      console.warn('Could not load weekly recipes:', recipeErr.message);
    }
  }, []);

  const {
    run: runDealsFetch,
    loading: dealsLoading,
    error: fetchError,
    countdown: retryCountdown,
  } = useWarmupFetch(fetchDealsAndRecipes);

  // Preserve the context's historical error vocabulary
  const warmingUp = fetchError?.type === 'warming';
  const apiError =
    fetchError?.type === 'server' ? 'server'
    : fetchError?.type === 'request' ? 'network'
    : null;

  // ── On mount: health check + deals + weekly recipes ───────────────────────
  useEffect(() => {
    healthApi.checkHealth()
      .then(() => setApiStatus('connected'))
      .catch(() => setApiStatus('disconnected'));

    runDealsFetch(0).finally(() => setLoading(false));
  }, [runDealsFetch]);

  // Refetch deals + recipes when the user switches state (skip initial mount —
  // the mount effect above already fetched with the stored state)
  const skipFirstStateFetch = React.useRef(true);
  useEffect(() => {
    if (skipFirstStateFetch.current) {
      skipFirstStateFetch.current = false;
      return;
    }
    runDealsFetch(0);
  }, [userState, runDealsFetch]);

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
    userState,
    setUserState,
    householdSize,
    setHouseholdSize,
    setDefaultStore,
    apiStatus,
    loading,
    dealsLoading,
    apiError,
    warmingUp,
    retryCountdown,
    retryFetch: () => runDealsFetch(0),
    startOnboarding,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Router>
        {apiStatus === 'disconnected' && (
          <div
            className="flex items-center justify-center gap-2 border-b py-1.5 px-4 text-xs"
            style={{ background: 'var(--color-peach)', borderColor: 'var(--color-honey)', color: 'var(--color-bark)' }}
          >
            <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>API not connected — some features may be unavailable</span>
          </div>
        )}

        {warmingUp && (
          <div
            className="flex items-center justify-center gap-2 border-b py-2 px-4 text-xs"
            style={{ background: 'var(--color-mist)', borderColor: 'var(--color-leaf)', color: 'var(--color-bark)' }}
          >
            <span className="inline-block w-3 h-3 border-2 rounded-full animate-spin flex-shrink-0" style={{ borderColor: 'var(--color-leaf)', borderTopColor: 'transparent' }} />
            <span style={{ fontFamily: 'Nunito, sans-serif' }}>
              Getting this week's specials ready — usually takes about 30 seconds on first load
              {retryCountdown > 0 && (
                <span style={{ color: 'var(--color-text-muted)' }}> · trying again in {retryCountdown}s</span>
              )}
            </span>
          </div>
        )}

        <Navigation />

        <main style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
          <Routes>
            <Route path="/" element={<StorePicker />} />
            <Route path="/store/:store" element={<StorePage />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/recipes/:id" element={<RecipeDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/meal-planner" element={<MealPlanner />} />
            <Route path="/shopping-list" element={<ShoppingList />} />
            <Route path="/price-alerts" element={<PriceAlerts />} />
            <Route path="/pantry" element={<PantryMatcher />} />
            <Route path="/premium" element={<Premium />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/recipes" element={<AdminRecipes />} />
            <Route path="/admin/blocklist" element={<AdminBlocklist />} />
            <Route path="/admin/feedback" element={<AdminFeedbackDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {showOnboarding && <Onboarding onDismiss={dismissOnboarding} />}
      </Router>
    </AppContext.Provider>
  );
}

// ── Root App — AuthProvider + PremiumProvider wrap everything ────────────────
export default function App() {
  return (
    <AuthProvider>
      <PremiumProvider>
        <AppInner />
      </PremiumProvider>
    </AuthProvider>
  );
}
