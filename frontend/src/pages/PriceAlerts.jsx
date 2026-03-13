import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Loader, X } from 'lucide-react';
import PremiumGate from '../components/PremiumGate';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';
import { premiumApi } from '../services/api';

const STORE_OPTIONS = [
  { value: '',           label: 'Any store' },
  { value: 'woolworths', label: 'Woolworths' },
  { value: 'coles',      label: 'Coles' },
  { value: 'iga',        label: 'IGA' },
];

const STORE_COLORS = {
  woolworths: '#007833',
  coles:      '#e31837',
  iga:        '#003da5',
};

function AlertCard({ alert, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await premiumApi.deletePriceAlert(alert.id);
      onDelete(alert.id);
    } catch (err) {
      console.error('Delete alert failed:', err.message);
      setDeleting(false);
    }
  };

  return (
    <div
      className="flex items-center gap-3 p-4 rounded-[16px] border"
      style={{ background: '#ffffff', borderColor: 'var(--color-stone)' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: alert.store ? STORE_COLORS[alert.store] : 'var(--color-leaf)' }}
      >
        <Bell className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
          {alert.product_name}
        </p>
        <p className="text-xs" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
          Alert when under <strong style={{ color: 'var(--color-text-green)' }}>${Number(alert.target_price).toFixed(2)}</strong>
          {alert.store && <span> · {STORE_OPTIONS.find(s => s.value === alert.store)?.label ?? alert.store}</span>}
        </p>
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-2 rounded-lg transition-colors hover:bg-[#FBDFC3]"
        style={{ color: 'var(--color-berry)' }}
        aria-label="Delete alert"
      >
        {deleting ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function PriceAlerts() {
  const { isPremium, premiumLoading } = usePremium();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [productName, setProductName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [store, setStore] = useState('');

  useEffect(() => {
    if (!user || !isPremium) { setLoading(false); return; }
    premiumApi.getPriceAlerts()
      .then(data => setAlerts(data.alerts ?? []))
      .catch(err => console.error('Load alerts failed:', err.message))
      .finally(() => setLoading(false));
  }, [user, isPremium]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!productName.trim() || !targetPrice) return;
    setSaving(true);
    try {
      const data = await premiumApi.createPriceAlert(productName.trim(), parseFloat(targetPrice), store || null);
      setAlerts(prev => [data.alert, ...prev]);
      setProductName('');
      setTargetPrice('');
      setStore('');
      setShowForm(false);
    } catch (err) {
      console.error('Create alert failed:', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-honey)' }}>
              <Bell className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
              Price Alerts
            </h1>
          </div>
          {isPremium && (
            <button
              onClick={() => setShowForm(s => !s)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Cancel' : 'New Alert'}
            </button>
          )}
        </div>

        {premiumLoading ? null : !isPremium ? (
          <PremiumGate feature="Price alerts" />
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--color-honey)' }} />
          </div>
        ) : (
          <>
            {/* Info banner */}
            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm border"
              style={{ background: '#fffbf0', borderColor: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
            >
              <strong>Coming soon:</strong> Alerts will notify you when ingredients drop below your target price during the weekly deal refresh.
            </div>

            {/* Create form */}
            {showForm && (
              <form
                onSubmit={handleCreate}
                className="rounded-[16px] border p-4 mb-5"
                style={{ background: '#ffffff', borderColor: 'var(--color-stone)' }}
              >
                <h3 className="text-base font-bold mb-3" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                  New Price Alert
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                      Product name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Chicken breast"
                      value={productName}
                      onChange={e => setProductName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ border: '1.5px solid var(--color-stone)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                        Alert when price is under ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="e.g. 8.00"
                        value={targetPrice}
                        onChange={e => setTargetPrice(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ border: '1.5px solid var(--color-stone)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-bold block mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
                        Store
                      </label>
                      <select
                        value={store}
                        onChange={e => setStore(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ border: '1.5px solid var(--color-stone)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}
                      >
                        {STORE_OPTIONS.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}
                >
                  {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Create Alert'}
                </button>
              </form>
            )}

            {/* Alert list */}
            {alerts.length === 0 ? (
              <div className="text-center py-20" style={{ fontFamily: 'Nunito, sans-serif' }}>
                <p className="text-5xl mb-4">🔔</p>
                <p className="text-lg font-bold mb-2" style={{ color: 'var(--color-bark)' }}>No price alerts yet</p>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Set an alert and we'll notify you when ingredients go on sale.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map(alert => (
                  <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
