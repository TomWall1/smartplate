import React, { useState, useEffect } from 'react';
import { Shield, Loader, Users, BookOpen, Ban, BarChart2, RefreshCw, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';

export default function AdminFeedbackDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [processing, setProc]   = useState(false);
  const [processMsg, setProcMsg]= useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await adminApi.getFeedback();
      setData(d);
    } catch (err) {
      setError(err?.response?.status === 403 ? 'Admin access required' : err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); else setLoading(false); }, [user]);

  const process = async () => {
    setProc(true);
    setProcMsg(null);
    try {
      const r = await adminApi.processFeedback();
      setProcMsg(r.message);
      await load();
    } catch (err) {
      setProcMsg(err?.response?.data?.error || err.message);
    } finally {
      setProc(false);
    }
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-parchment)' }}>
      <p style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>Please sign in.</p>
    </div>
  );

  const feedback = data?.feedback ?? [];
  const summary  = data?.summary  ?? [];

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
              <h1 className="text-2xl" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>Admin Dashboard</h1>
              <p className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>{user.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4] disabled:opacity-50"
              style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={process} disabled={processing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ fontFamily: 'Nunito, sans-serif', background: 'var(--color-leaf)', color: '#fff' }}>
              {processing ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Auto-block (3+ reports)
            </button>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => navigate('/admin')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4]"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)', background: '#fff' }}>
            <Users className="w-4 h-4" /> Users
          </button>
          <button onClick={() => navigate('/admin/recipes')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4]"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)', background: '#fff' }}>
            <BookOpen className="w-4 h-4" /> Recipes
          </button>
          <button onClick={() => navigate('/admin/blocklist')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4]"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)', background: '#fff' }}>
            <Ban className="w-4 h-4" /> Blocklist
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border"
            style={{ fontFamily: 'Nunito, sans-serif', background: 'var(--color-bark)', color: '#fff', borderColor: 'var(--color-bark)' }}>
            <BarChart2 className="w-4 h-4" /> Feedback
          </button>
        </div>

        {processMsg && (
          <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: '#D6EDD4', color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
            {processMsg}
          </div>
        )}

        {error ? (
          <div className="rounded-xl p-4 text-center" style={{ background: '#fee2e2', color: '#b91c1c', fontFamily: 'Nunito, sans-serif' }}>{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-12"><Loader className="w-6 h-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} /></div>
        ) : (
          <div className="flex flex-col gap-6">

            {/* Summary — most reported */}
            {summary.length > 0 && (
              <div>
                <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                  Most reported bad matches
                </h2>
                <div className="rounded-[20px] border overflow-hidden" style={{ borderColor: 'var(--color-stone)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--color-mist)' }}>
                        {['Ingredient', 'Product', 'Incorrect', 'Correct'].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-xs font-bold"
                            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((s, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--color-stone)', background: '#fff' }}>
                          <td className="px-4 py-2 text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{s.ingredient_name}</td>
                          <td className="px-4 py-2 text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{s.product_name}</td>
                          <td className="px-4 py-2 text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: '#b91c1c' }}>{s.incorrect}</td>
                          <td className="px-4 py-2 text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: '#15803d' }}>{s.correct}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent feedback */}
            <div>
              <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                Recent feedback ({feedback.length})
              </h2>
              {feedback.length === 0 ? (
                <p className="text-center py-6" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                  No feedback yet. Add the "Wrong match" button to recipe pages to collect feedback.
                </p>
              ) : (
                <div className="rounded-[20px] border overflow-hidden" style={{ borderColor: 'var(--color-stone)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--color-mist)' }}>
                        {['Date', 'Recipe', 'Ingredient', 'Product', 'Type', 'Reason'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-xs font-bold"
                            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.map(f => (
                        <tr key={f.id} style={{ borderTop: '1px solid var(--color-stone)', background: '#fff' }}>
                          <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                            {new Date(f.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-xs max-w-[120px] truncate" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                            {f.recipe_title || '—'}
                          </td>
                          <td className="px-3 py-2 text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{f.ingredient_name}</td>
                          <td className="px-3 py-2 text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>{f.product_name}</td>
                          <td className="px-3 py-2 text-xs">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: f.feedback_type === 'incorrect' ? '#fee2e2' : '#D6EDD4', color: f.feedback_type === 'incorrect' ? '#b91c1c' : '#15803d', fontFamily: 'Nunito, sans-serif' }}>
                              {f.feedback_type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs max-w-[200px] truncate" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                            {f.reason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
