import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UtensilsCrossed, Home, BookOpen, User, Wifi, WifiOff, LogIn, LogOut } from 'lucide-react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';

const STORE_META = {
  woolworths: { label: 'Woolworths', color: '#007833' },
  coles:      { label: 'Coles',      color: '#e31837' },
  iga:        { label: 'IGA',        color: '#003da5' },
};

const Navigation = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { selectedStore, apiStatus } = useApp();
  const { user, signOut } = useAuth();

  const storeMeta  = selectedStore ? STORE_META[selectedStore] : null;
  const dealsLabel = storeMeta ? storeMeta.label : 'Home';
  const dealsPath  = storeMeta ? `/store/${selectedStore}` : '/';

  const isDealsActive   = location.pathname === '/' || location.pathname.startsWith('/store/');
  const isRecipesActive = location.pathname.startsWith('/recipes');
  const isProfileActive = location.pathname === '/profile';

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const StatusDot = () => {
    if (apiStatus === 'connected') {
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-green)' }}>
          <Wifi className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Live</span>
        </span>
      );
    }
    if (apiStatus === 'disconnected') {
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-honey)' }}>
          <WifiOff className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Offline</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--color-stone)', borderTopColor: 'var(--color-text-muted)' }}
        />
      </span>
    );
  };

  const activeLinkStyle = (isActive, storeColor) => ({
    color: isActive ? (storeColor || 'var(--color-leaf)') : 'var(--color-text-muted)',
    fontWeight: isActive ? 700 : 600,
    fontFamily: 'Nunito, sans-serif',
  });

  return (
    <>
      {/* ── Desktop top bar ──────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-30 border-b shadow-sm"
        style={{ background: 'var(--color-parchment)', borderColor: 'var(--color-stone)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-honey)' }}
              >
                <UtensilsCrossed className="w-5 h-5 text-white" />
              </div>
              <span
                className="text-xl"
                style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
              >
                Deals to Dish
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              <Link
                to={dealsPath}
                className="px-4 py-2 rounded-xl text-sm transition-colors hover:bg-[#D6EDD4]"
                style={activeLinkStyle(isDealsActive, storeMeta?.color)}
              >
                {dealsLabel}
              </Link>
              <Link
                to="/recipes"
                className="px-4 py-2 rounded-xl text-sm transition-colors hover:bg-[#D6EDD4]"
                style={activeLinkStyle(isRecipesActive)}
              >
                Recipes
              </Link>
              <Link
                to="/profile"
                className="px-4 py-2 rounded-xl text-sm transition-colors hover:bg-[#D6EDD4]"
                style={activeLinkStyle(isProfileActive)}
              >
                Profile
              </Link>
            </div>

            {/* Right side: status + auth */}
            <div className="hidden md:flex items-center gap-3">
              <StatusDot />
              {user ? (
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs max-w-[160px] truncate"
                    style={{ color: 'var(--color-text-muted)' }}
                    title={user.email}
                  >
                    {user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors hover:bg-[#D6EDD4]"
                    style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 hover:-translate-y-px"
                  style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom bar ────────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t"
        style={{
          background: 'var(--color-parchment)',
          borderColor: 'var(--color-stone)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-stretch">
          <Link
            to={dealsPath}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
            style={{ color: isDealsActive ? (storeMeta?.color || 'var(--color-leaf)') : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
          >
            <Home className="w-5 h-5" />
            <span>{dealsLabel}</span>
          </Link>

          <Link
            to="/recipes"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
            style={{ color: isRecipesActive ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
          >
            <BookOpen className="w-5 h-5" />
            <span>Recipes</span>
          </Link>

          <Link
            to="/profile"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
            style={{ color: isProfileActive ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </Link>

          {user ? (
            <button
              onClick={handleSignOut}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              <LogOut className="w-5 h-5" />
              <span>Sign out</span>
            </button>
          ) : (
            <Link
              to="/auth"
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
              style={{ color: location.pathname === '/auth' ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              <LogIn className="w-5 h-5" />
              <span>Login</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  );
};

export default Navigation;
