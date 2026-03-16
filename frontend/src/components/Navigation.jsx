import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UtensilsCrossed, Home, BookOpen, User, LogIn, LogOut, Heart, Calendar, ShoppingCart, Crown, Bell, Shield, MapPin, ChefHat, Refrigerator, ChevronDown } from 'lucide-react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';

const STORE_META = {
  woolworths: { label: 'Woolworths', color: '#007833' },
  coles:      { label: 'Coles',      color: '#e31837' },
  iga:        { label: 'IGA',        color: '#003da5' },
};

function Dropdown({ open, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 rounded-2xl border shadow-lg z-50 min-w-[180px] overflow-hidden"
      style={{ background: 'var(--color-parchment)', borderColor: 'var(--color-stone)', boxShadow: '0 4px 20px rgba(92,74,53,0.12)' }}
    >
      {children}
    </div>
  );
}

function DropdownLink({ to, onClick, icon: Icon, children, active }) {
  const base = "flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[#D6EDD4]";
  const style = {
    fontFamily: 'Nunito, sans-serif',
    color: active ? 'var(--color-leaf)' : 'var(--color-bark)',
  };
  if (to) {
    return (
      <Link to={to} className={base} style={style} onClick={onClick}>
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? 'var(--color-leaf)' : 'var(--color-text-muted)' }} />}
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`${base} w-full text-left`} style={style}>
      {Icon && <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />}
      {children}
    </button>
  );
}

const Navigation = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { selectedStore, userState } = useApp();
  const { user, signOut } = useAuth();
  const { isPremium } = usePremium();

  const [premiumOpen, setPremiumOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  const isAdmin    = user && adminEmail && user.email === adminEmail;

  const storeMeta  = selectedStore ? STORE_META[selectedStore] : null;
  const dealsLabel = storeMeta ? storeMeta.label : 'Home';
  const dealsPath  = storeMeta ? `/store/${selectedStore}` : '/';

  const isDealsActive     = location.pathname === '/' || location.pathname.startsWith('/store/');
  const isRecipesActive   = location.pathname.startsWith('/recipes');
  const isProfileActive   = location.pathname === '/profile';
  const isFavoritesActive = location.pathname === '/favorites';
  const isPlannerActive   = location.pathname === '/meal-planner';
  const isListActive      = location.pathname === '/shopping-list';
  const isAlertsActive    = location.pathname === '/price-alerts';
  const isPantryActive    = location.pathname === '/pantry';
  const isPremiumActive   = location.pathname === '/premium';
  const isAdminActive     = location.pathname.startsWith('/admin');

  const isPremiumDropActive = isFavoritesActive || isPlannerActive || isListActive || isAlertsActive || isPantryActive;

  const handleSignOut = async () => {
    setAccountOpen(false);
    await signOut();
    navigate('/', { replace: true });
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

              {/* Premium dropdown (if subscribed) or Upgrade link */}
              {isPremium ? (
                <div className="relative">
                  <button
                    onClick={() => { setPremiumOpen(o => !o); setAccountOpen(false); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors hover:bg-[#D6EDD4]"
                    style={{
                      fontFamily: 'Nunito, sans-serif',
                      color: isPremiumDropActive ? 'var(--color-leaf)' : 'var(--color-text-muted)',
                      fontWeight: isPremiumDropActive ? 700 : 600,
                    }}
                  >
                    <Crown className="w-3.5 h-3.5" style={{ color: 'var(--color-honey)' }} />
                    Premium
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <Dropdown open={premiumOpen} onClose={() => setPremiumOpen(false)}>
                    <DropdownLink to="/favorites" onClick={() => setPremiumOpen(false)} icon={Heart} active={isFavoritesActive}>Favourites</DropdownLink>
                    <DropdownLink to="/meal-planner" onClick={() => setPremiumOpen(false)} icon={Calendar} active={isPlannerActive}>Meal Plan</DropdownLink>
                    <DropdownLink to="/shopping-list" onClick={() => setPremiumOpen(false)} icon={ShoppingCart} active={isListActive}>Shopping List</DropdownLink>
                    <DropdownLink to="/price-alerts" onClick={() => setPremiumOpen(false)} icon={Bell} active={isAlertsActive}>Price Alerts</DropdownLink>
                    <DropdownLink to="/pantry" onClick={() => setPremiumOpen(false)} icon={Refrigerator} active={isPantryActive}>What I Have</DropdownLink>
                  </Dropdown>
                </div>
              ) : (
                <Link
                  to="/premium"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors hover:bg-[#FBDFC3]"
                  style={activeLinkStyle(isPremiumActive)}
                >
                  <Crown className="w-3.5 h-3.5" style={{ color: 'var(--color-honey)' }} />
                  Premium
                </Link>
              )}
            </div>

            {/* Right side: state pill + Account dropdown */}
            <div className="hidden md:flex items-center gap-3">
              {userState && (
                <Link
                  to="/profile"
                  title="Change your state"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-colors hover:bg-[#D6EDD4]"
                  style={{ color: 'var(--color-text-green)', background: 'var(--color-mist)', fontFamily: 'Nunito, sans-serif' }}
                >
                  <MapPin className="w-3 h-3" />
                  {userState.toUpperCase()}
                </Link>
              )}

              {user ? (
                <div className="relative">
                  <button
                    onClick={() => { setAccountOpen(o => !o); setPremiumOpen(false); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors hover:bg-[#D6EDD4]"
                    style={{
                      fontFamily: 'Nunito, sans-serif',
                      color: isProfileActive || isAdminActive ? 'var(--color-leaf)' : 'var(--color-text-muted)',
                      fontWeight: isProfileActive || isAdminActive ? 700 : 600,
                    }}
                  >
                    <User className="w-4 h-4" />
                    Account
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <Dropdown open={accountOpen} onClose={() => setAccountOpen(false)}>
                    <DropdownLink to="/profile" onClick={() => setAccountOpen(false)} icon={User} active={isProfileActive}>Profile</DropdownLink>
                    {isAdmin && (
                      <DropdownLink to="/admin" onClick={() => setAccountOpen(false)} icon={Shield} active={isAdminActive}>Admin</DropdownLink>
                    )}
                    <div style={{ borderTop: '1px solid var(--color-stone)', margin: '4px 0' }} />
                    <DropdownLink onClick={handleSignOut} icon={LogOut}>Sign out</DropdownLink>
                  </Dropdown>
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t overflow-x-auto"
        style={{
          background: 'var(--color-parchment)',
          borderColor: 'var(--color-stone)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-stretch min-w-max w-full">
          <Link
            to={dealsPath}
            className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
            style={{ color: isDealsActive ? (storeMeta?.color || 'var(--color-leaf)') : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
          >
            <Home className="w-5 h-5" />
            <span>{storeMeta ? storeMeta.label.slice(0, 4) : 'Home'}</span>
          </Link>

          <Link
            to="/recipes"
            className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
            style={{ color: isRecipesActive ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
          >
            <BookOpen className="w-5 h-5" />
            <span>Recipes</span>
          </Link>

          {isPremium && (
            <>
              <Link
                to="/favorites"
                className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
                style={{ color: isFavoritesActive ? 'var(--color-berry)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
              >
                <Heart className="w-5 h-5" />
                <span>Saved</span>
              </Link>
              <Link
                to="/shopping-list"
                className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
                style={{ color: isListActive ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
              >
                <ShoppingCart className="w-5 h-5" />
                <span>List</span>
              </Link>
              <Link
                to="/price-alerts"
                className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
                style={{ color: isAlertsActive ? 'var(--color-honey)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
              >
                <Bell className="w-5 h-5" />
                <span>Alerts</span>
              </Link>
              <Link
                to="/pantry"
                className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
                style={{ color: isPantryActive ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
              >
                <Refrigerator className="w-5 h-5" />
                <span>Pantry</span>
              </Link>
            </>
          )}

          {!isPremium && (
            <Link
              to="/premium"
              className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
              style={{ color: isPremiumActive ? 'var(--color-honey)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              <Crown className="w-5 h-5" />
              <span>Premium</span>
            </Link>
          )}

          {isAdmin && (
            <Link
              to="/admin"
              className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
              style={{ color: isAdminActive ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              <Shield className="w-5 h-5" />
              <span>Admin</span>
            </Link>
          )}

          <Link
            to="/profile"
            className="flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors"
            style={{ color: isProfileActive ? 'var(--color-leaf)' : 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
          >
            <div className="relative">
              <User className="w-5 h-5" />
              {userState && (
                <span
                  className="absolute -top-1.5 -right-2.5 text-[9px] font-extrabold leading-none px-1 py-0.5 rounded-full"
                  style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)' }}
                >
                  {userState.toUpperCase()}
                </span>
              )}
            </div>
            <span>Profile</span>
          </Link>
        </div>
      </nav>
    </>
  );
};

export default Navigation;
