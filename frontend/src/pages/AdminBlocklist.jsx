import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Loader, Users, BookOpen, Ban, BarChart2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';

export default function AdminBlocklist() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [rules, setRules]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [deleting, setDeleting] = useState(null);

  // New rule form
  const [ingPattern, setIngPattern]   = useState('');
  const [prodPatterns, setProdPatterns] = useState('');
  const [reason, setReason]           = useState('');
  const [adding, setAdding]           = useState(false);
  const [addError, setAddError]       = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getBlocklist();
      setRules(data.blocklist ?? []);
    } catch (err) {
      setError(err?.response?.status === 403 ? 'Admin access required' : err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); else setLoading(false); }, [user]);

  const addRule = async (e) => {
    e.preventDefault();
    if (!ingPattern.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const patterns = prodPatterns.split(',').map(s => s.trim()).filter(Boolean);
      const data = await adminApi.addBlocklistRule({
        ingredient_pattern:      ingPattern.trim().toLowerCase(),
        blocked_product_patterns: patterns,
        reason: reason.trim() || null,
      });
      setRules(prev => [data.rule, ...prev]);
      setIngPattern('');
      setProdPatterns('');
      setReason('');
    } catch (err) {
      setAddError(err?.response?.data?.error || err.message);
    } finally {
      setAdding(false);
    }
  };

  const deleteRule = async (id) => {
    setDeleting(id);
    try {
      await adminApi.deleteBlocklistRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-parchment)' }}>
      <p style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>Please sign in.</p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-bark)' }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>Admin Dashboard</h1>
            <p className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>{user.email}</p>
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
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border"
            style={{ fontFamily: 'Nunito, sans-serif', background: 'var(--color-bark)', color: '#fff', borderColor: 'var(--color-bark)' }}>
            <Ban className="w-4 h-4" /> Blocklist
          </button>
          <button onClick={() => navigate('/admin/feedback')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-[#D6EDD4]"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)', borderColor: 'var(--color-stone)', background: '#fff' }}>
            <BarChart2 className="w-4 h-4" /> Feedback
          </button>
        </div>

        {/* Add rule form */}
        <div className="rounded-[20px] border p-5 mb-6" style={{ background: '#fff', borderColor: 'var(--color-stone)' }}>
          <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
            Add blocklist rule
          </h2>
          <p className="text-xs mb-3" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
            Prevents an ingredient pattern from matching specific product patterns. Use lowercase.
          </p>
          <form onSubmit={addRule} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                  Ingredient pattern *
                </label>
                <input
                  value={ingPattern} onChange={e => setIngPattern(e.target.value)}
                  placeholder="e.g. chicken stock cube"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{ fontFamily: 'Nunito, sans-serif', borderColor: 'var(--color-stone)', color: 'var(--color-bark)' }}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                  Blocked product patterns (comma-separated)
                </label>
                <input
                  value={prodPatterns} onChange={e => setProdPatterns(e.target.value)}
                  placeholder="e.g. chicken breast, rspca chicken"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{ fontFamily: 'Nunito, sans-serif', borderColor: 'var(--color-stone)', color: 'var(--color-bark)' }}
                />
              </div>
            </div>
            <input
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
              style={{ fontFamily: 'Nunito, sans-serif', borderColor: 'var(--color-stone)', color: 'var(--color-bark)' }}
            />
            {addError && <p className="text-xs text-red-500" style={{ fontFamily: 'Nunito, sans-serif' }}>{addError}</p>}
            <button type="submit" disabled={adding || !ingPattern.trim()}
              className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ fontFamily: 'Nunito, sans-serif', background: 'var(--color-leaf)', color: '#fff' }}>
              {adding ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add rule
            </button>
          </form>
        </div>

        {/* Rules list */}
        {error ? (
          <div className="rounded-xl p-4 text-center" style={{ background: '#fee2e2', color: '#b91c1c', fontFamily: 'Nunito, sans-serif' }}>{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-12"><Loader className="w-6 h-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} /></div>
        ) : rules.length === 0 ? (
          <p className="text-center py-8" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>No blocklist rules yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>{rules.length} rule{rules.length !== 1 ? 's' : ''}</p>
            {rules.map(rule => (
              <div key={rule.id} className="rounded-[16px] border p-4 flex items-start justify-between gap-3"
                style={{ background: '#fff', borderColor: 'var(--color-stone)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                    Ingredient: <code className="bg-gray-100 px-1 rounded text-xs">{rule.ingredient_pattern}</code>
                  </p>
                  {rule.blocked_product_patterns?.length > 0 && (
                    <p className="text-xs mt-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                      Blocks: {rule.blocked_product_patterns.map(p => (
                        <code key={p} className="bg-red-50 text-red-700 px-1 rounded text-xs mr-1">{p}</code>
                      ))}
                    </p>
                  )}
                  {rule.reason && (
                    <p className="text-xs mt-1 italic" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>{rule.reason}</p>
                  )}
                  <p className="text-xs mt-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                    Added {new Date(rule.created_at).toLocaleDateString()} by {rule.created_by || 'admin'}
                  </p>
                </div>
                <button onClick={() => deleteRule(rule.id)} disabled={deleting === rule.id}
                  className="p-2 rounded-xl border transition-all hover:bg-red-50 disabled:opacity-50 flex-shrink-0"
                  style={{ borderColor: 'var(--color-stone)' }}>
                  {deleting === rule.id ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
