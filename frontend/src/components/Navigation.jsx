import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UtensilsCrossed, Home, BookOpen, User, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../App';

// Store display metadata
const STORE_META = {
  woolworths: { label: 'Woolworths', color: '#007833' },
  coles:      { label: 'Coles',      color: '#e31837' },
  iga:        { label: 'IGA',        color: '#003da5' },
};

const Navigation = () => {
  const location = useLocation();
  const { selectedStore, apiStatus } = useApp();

  // Determine the "Deals" label and color
  const storeMeta = selectedStore ? STORE_META[selectedStore] : null;
  const dealsLabel = storeMeta ? storeMeta.label : 'Home';
  const dealsPath  = storeMeta ? `/store/${selectedStore}` : '/';

  // Is the current path the deals/home path?
  const isDealsActive =
    location.pathname === '/' ||
    location.pathname.startsWith('/store/');

  const isRecipesActive = location.pathname.startsWith('/recipes');
  const isProfileActive = location.pathname === '/profile';

  // ── API status dot ────────────────────────────────────────────────────────
  const StatusDot = () => {
    if (apiStatus === 'connected') {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Wifi className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Live</span>
        </span>
      );
    }
    if (apiStatus === 'disconnected') {
      return (
        <span className="flex items-center gap-1 text-xs text-amber-600">
          <WifiOff className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Offline</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-stone-400">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-stone-300 border-t-stone-500 animate-spin" />
      </span>
    );
  };

  return (
    <>
      {/* ── Desktop / tablet top bar ─────────────────────────────────────── */}
      <nav className="bg-white border-b border-stone-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-stone-800 tracking-tight">
                SmartPlate
              </span>
            </Link>

            {/* Desktop nav links — hidden on mobile */}
            <div className="hidden md:flex items-center gap-1">
              {/* Deals / Home link */}
              <Link
                to={dealsPath}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isDealsActive
                    ? 'font-bold underline underline-offset-4'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
                style={isDealsActive && storeMeta ? { color: storeMeta.color } : {}}
              >
                {dealsLabel}
              </Link>

              <Link
                to="/recipes"
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isRecipesActive
                    ? 'font-bold underline underline-offset-4 text-amber-600'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                Recipes
              </Link>

              <Link
                to="/profile"
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isProfileActive
                    ? 'font-bold underline underline-offset-4 text-amber-600'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                Profile
              </Link>
            </div>

            {/* Status dot */}
            <div className="hidden md:flex items-center">
              <StatusDot />
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom fixed bar ──────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-stone-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch">
          {/* Home / Deals */}
          <Link
            to={dealsPath}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              isDealsActive ? 'text-amber-600' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Home className="w-5 h-5" />
            <span
              style={isDealsActive && storeMeta ? { color: storeMeta.color } : {}}
              className={isDealsActive && !storeMeta ? 'text-amber-600' : ''}
            >
              {dealsLabel}
            </span>
          </Link>

          {/* Recipes */}
          <Link
            to="/recipes"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              isRecipesActive ? 'text-amber-600' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span>Recipes</span>
          </Link>

          {/* Profile */}
          <Link
            to="/profile"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              isProfileActive ? 'text-amber-600' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </Link>
        </div>
      </nav>
    </>
  );
};

export default Navigation;
