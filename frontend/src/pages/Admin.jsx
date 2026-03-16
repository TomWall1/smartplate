import React, { useState, useEffect } from 'react';
import { Shield, Users, Crown, BarChart2, Loader, RefreshCw, Check, X, MapPin, BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';

function StatCard({ label, value, sub, color }) {
  return (
    <div
      className="rounded-[16px] border p-4 text-center"
      style={{ background: '#ffffff', borderColor: 'var(--color-stone)' }}
    >
      <p className="text-3xl font-bold mb-0.5" style={{ fontFamily: '"Fredoka One", sans-serif', color: color ?? 'var(--color-bark)' }}>
        {value}
      </p>
      <p className="text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers]     = useState([]);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [toggling, setToggling] = useState(null);
  const [filter, setFilter]   = useState('all'); // all | premium | free

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, statsData] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getStats(),
      ]);
      setUsers(usersData.users ?? []);
      setStats(statsData);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) setError('Access denied — admin only.');
      else if (status === 503) setError('Admin not configured. Set ADMIN_EMAIL and SUPABASE_SERVICE_ROLE_KEY.');
      else setError(err.message ?? 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); else setLoading(false); }, [user]);

  const handleToggle = async (userId) => {
    setToggling(userId);
    try {
      const data = await adminApi.togglePremium(userId);
      setUsers(prev => prev.map(u => u.id === userId ? data.user : u));
      if (stats) {
        const wasPremium = users.find(u => u.id === userId)?.is_premium;
        setStats(prev => ({
          ...prev,
          premiumUsers: prev.premiumUsers + (wasPremium ? -1 : 1),
          freeUsers:    prev.freeUsers    + (wasPremium ?  1 : -1),
        }));
      }
    } catch (err) {
      console.error('Toggle failed:', err.message);
    } finally {
      setToggling(null);
    }
  };

  const filteredUsers = users.filter(u => {
    if (filter === 'premium') return u.is_premium;
    if (filter === 'free')    return !u.is_premium;
    return true;
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-parchment)' }}>
        <p style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>Please sign in to access the admin panel.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-bark)' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                Admin Dashboard
              </h1>
              <p className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4] disabled:opacity-50"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 mb-6">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border"
            style={{ fontFamily: 'Nunito, sans-serif', background: 'var(--color-bark)', color: '#fff', borderColor: 'var(--color-bark)' }}
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => navigate('/admin/recipes')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4]"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)', background: '#fff' }}
          >
            <BookOpen className="w-4 h-4" />
            Recipes
          </button>
        </div>

        {error ? (
          <div
            className="rounded-xl p-4 text-sm border"
            style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
          >
            {error}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--color-bark)' }} />
          </div>
        ) : (
          <>
            {/* Stats */}
            {stats && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                  <StatCard label="Total Users"    value={stats.totalUsers}        color="var(--color-bark)" />
                  <StatCard label="Premium"        value={stats.premiumUsers}       color="var(--color-honey)" />
                  <StatCard label="Free"           value={stats.freeUsers}          color="var(--color-text-muted)" />
                  <StatCard label="Favourites"     value={stats.totalFavorites}     color="var(--color-berry)" />
                  <StatCard label="Meal Plans"     value={stats.totalMealPlans}     color="var(--color-leaf)" />
                  <StatCard label="Shopping Lists" value={stats.totalShoppingLists} color="var(--color-leaf)" />
                </div>

                {/* State Distribution */}
                {stats.stateDistribution?.length > 0 && (
                  <div
                    className="rounded-[20px] border p-4 mb-6"
                    style={{ background: '#ffffff', borderColor: 'var(--color-stone)' }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4" style={{ color: 'var(--color-leaf)' }} />
                      <h2 className="text-sm font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                        Users by State
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {stats.stateDistribution.map(({ state, count, pct }) => (
                        <div key={state} className="flex items-center gap-3">
                          <span
                            className="w-10 text-xs font-extrabold text-right flex-shrink-0"
                            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
                          >
                            {state}
                          </span>
                          <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--color-mist)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.max(pct, 2)}%`,
                                background: 'var(--color-leaf)',
                                opacity: 0.85,
                              }}
                            />
                          </div>
                          <span className="w-12 text-xs font-semibold flex-shrink-0" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                            {count} <span className="text-[10px]">({pct}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4">
              {[['all','All'], ['premium','Premium'], ['free','Free']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className="px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
                  style={{
                    fontFamily: 'Nunito, sans-serif',
                    background: filter === val ? 'var(--color-bark)' : 'var(--color-mist)',
                    color:      filter === val ? '#ffffff' : 'var(--color-bark)',
                  }}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto text-xs self-center" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* User table */}
            <div
              className="rounded-[20px] border overflow-hidden"
              style={{ borderColor: 'var(--color-stone)' }}
            >
              {/* Table header */}
              <div
                className="grid text-xs font-bold px-4 py-2.5"
                style={{
                  gridTemplateColumns: '1fr auto auto auto auto',
                  gap: '12px',
                  background: 'var(--color-mist)',
                  fontFamily: 'Nunito, sans-serif',
                  color: 'var(--color-bark)',
                }}
              >
                <span>Email</span>
                <span>State</span>
                <span>Store</span>
                <span>Since</span>
                <span>Premium</span>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                  No users found
                </div>
              ) : filteredUsers.map((u, i) => (
                <div
                  key={u.id}
                  className="grid items-center px-4 py-3 border-t"
                  style={{
                    gridTemplateColumns: '1fr auto auto auto auto',
                    gap: '12px',
                    borderColor: 'var(--color-stone)',
                    background: u.is_premium ? '#fffbf0' : '#ffffff',
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                      {u.email}
                    </p>
                    {u.is_premium && u.premium_since && (
                      <p className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-honey)' }}>
                        <Crown className="w-3 h-3 inline mr-0.5" />
                        Premium since {new Date(u.premium_since).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      fontFamily: 'Nunito, sans-serif',
                      background: u.state ? 'var(--color-mist)' : 'transparent',
                      color: u.state ? 'var(--color-text-green)' : 'var(--color-text-muted)',
                    }}
                  >
                    {u.state ? u.state.toUpperCase() : '—'}
                  </span>
                  <span className="text-xs capitalize" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                    {u.selected_store ?? '—'}
                  </span>
                  <span className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                  </span>
                  <button
                    onClick={() => handleToggle(u.id)}
                    disabled={toggling === u.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-50"
                    style={{
                      fontFamily: 'Nunito, sans-serif',
                      background: u.is_premium ? 'var(--color-honey)' : 'var(--color-mist)',
                      color:      u.is_premium ? '#ffffff' : 'var(--color-bark)',
                    }}
                  >
                    {toggling === u.id
                      ? <Loader className="w-3.5 h-3.5 animate-spin" />
                      : u.is_premium
                        ? <><Crown className="w-3.5 h-3.5" /> On</>
                        : <><X className="w-3.5 h-3.5" /> Off</>}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
