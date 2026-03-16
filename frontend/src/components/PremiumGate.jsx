import React from 'react';
import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps a premium feature. Shows an upsell panel for non-premium users.
 * @param {string} feature  - Feature name shown in the upsell message.
 * @param {React.ReactNode} children - Content to render for premium users.
 */
export default function PremiumGate({ feature, children }) {
  const { isPremium, premiumLoading } = usePremium();
  const { user } = useAuth();

  if (premiumLoading) return null;
  if (isPremium) return children;

  return (
    <div
      className="rounded-[20px] p-8 text-center border"
      style={{
        background: '#fffbf0',
        borderColor: 'var(--color-honey)',
        fontFamily: 'Nunito, sans-serif',
      }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'var(--color-peach)' }}
      >
        <Crown className="w-7 h-7" style={{ color: 'var(--color-honey)' }} />
      </div>
      <h3
        className="text-xl mb-2"
        style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
      >
        Premium Feature
      </h3>
      <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--color-text-muted)' }}>
        {feature ? `${feature} is` : 'This feature is'} available with SmartPlate Premium
        for just <strong style={{ color: 'var(--color-bark)' }}>$9.99/month</strong>.
      </p>
      {user ? (
        <Link
          to="/premium"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-px shadow-sm"
          style={{ background: 'var(--color-honey)' }}
        >
          <Crown className="w-4 h-4" />
          View Premium Plans
        </Link>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/auth"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: 'var(--color-leaf)' }}
          >
            Sign in
          </Link>
          <Link
            to="/premium"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 border"
            style={{ color: 'var(--color-honey)', borderColor: 'var(--color-honey)', background: 'transparent' }}
          >
            <Crown className="w-4 h-4" />
            Learn more
          </Link>
        </div>
      )}
    </div>
  );
}
