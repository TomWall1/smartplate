import React from 'react';
import { Link } from 'react-router-dom';
import { Crown, Heart, Calendar, ShoppingCart, Bell, Sparkles, Check, Star, ChefHat, Refrigerator } from 'lucide-react';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  {
    icon: ChefHat,
    color: '#7DB87A',
    title: '150 AI-Matched Recipes Weekly',
    desc: '3× more recipes than the free tier. Every recipe matched to this week\'s specials so you always cook with deals.',
  },
  {
    icon: Refrigerator,
    color: '#7DB87A',
    title: 'What I Have at Home',
    desc: 'Tell us what\'s in your fridge and we\'ll find recipes you can make right now — with deals on what\'s missing.',
  },
  {
    icon: Sparkles,
    color: '#D4667A',
    title: 'Personalised Recommendations',
    desc: 'AI-powered recipe suggestions tailored to your dietary preferences, cooking time, and household size.',
  },
  {
    icon: Heart,
    color: '#D4667A',
    title: 'Save Favourite Recipes',
    desc: 'Build your personal recipe collection. Save recipes you love and access them any time.',
  },
  {
    icon: Calendar,
    color: '#F4A94E',
    title: 'Weekly Meal Planner',
    desc: 'Plan your breakfasts, lunches and dinners for the week. Never wonder "what\'s for dinner?" again.',
  },
  {
    icon: ShoppingCart,
    color: '#F4A94E',
    title: 'Smart Shopping Lists',
    desc: 'Auto-generate combined shopping lists from your meal plan. Organised by aisle category.',
  },
  {
    icon: Bell,
    color: '#F4A94E',
    title: 'Price Alerts',
    desc: 'Set alerts for ingredients and get notified when they drop below your target price.',
  },
];

const FREE_FEATURES = [
  { text: '50 recipes weekly', free: true },
  { text: 'Store-specific browsing', free: true },
  { text: 'Deal filtering and search', free: true },
  { text: 'Recipe details and instructions', free: true },
  { text: 'Ingredient-to-deal matching', free: true },
];

const PREMIUM_FEATURES = [
  { text: '150 AI-matched recipes weekly (3× more)', premium: true },
  { text: 'What I Have at Home pantry matcher', premium: true },
  { text: 'Personalised AI recommendations', premium: true },
  { text: 'Save favourite recipes', premium: true },
  { text: 'Weekly meal planner', premium: true },
  { text: 'Smart shopping lists', premium: true },
  { text: 'Price alerts', premium: true },
];

export default function Premium() {
  const { isPremium, premiumSince } = usePremium();
  const { user } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-parchment)' }}>
      {/* Hero */}
      <div
        className="py-16 px-4 text-center"
        style={{ background: 'linear-gradient(135deg, #7DB87A 0%, #5C4A35 100%)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'rgba(244,169,78,0.25)' }}
        >
          <Crown className="w-8 h-8" style={{ color: '#F4A94E' }} />
        </div>
        <h1
          className="text-3xl sm:text-4xl text-white mb-3"
          style={{ fontFamily: '"Fredoka One", sans-serif' }}
        >
          SmartPlate Premium
        </h1>
        <p className="text-white/80 text-sm sm:text-base max-w-md mx-auto" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Get more from your grocery deals. Personalised recipes, meal planning, and smart shopping — all in one place.
        </p>

        {isPremium ? (
          <div
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff', fontFamily: 'Nunito, sans-serif' }}
          >
            <Star className="w-4 h-4" fill="currentColor" />
            Premium unlocked by admin
            {premiumSince && (
              <span className="font-normal opacity-80">
                · since {new Date(premiumSince).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-6">
            <div
              className="inline-flex items-center gap-1 px-5 py-2.5 rounded-xl text-white font-bold text-lg mb-2"
              style={{ background: '#F4A94E', fontFamily: '"Fredoka One", sans-serif' }}
            >
              $9.99 / month
            </div>
            <p className="text-white/60 text-xs" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Coming soon: Payment integration via Stripe
            </p>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {/* Premium features */}
        <h2
          className="text-2xl text-center mb-8"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
        >
          Everything included
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="rounded-[20px] p-5 border"
                style={{ background: '#ffffff', borderColor: 'var(--color-stone)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${f.color}22` }}
                >
                  <Icon className="w-5 h-5" style={{ color: f.color }} />
                </div>
                <h3 className="text-base font-bold mb-1" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                  {f.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Comparison table */}
        <h2
          className="text-2xl text-center mb-6"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
        >
          Free vs Premium
        </h2>
        <div
          className="rounded-[20px] overflow-hidden border mb-10"
          style={{ borderColor: 'var(--color-stone)' }}
        >
          <div className="grid grid-cols-3 text-sm font-bold text-center py-3"
            style={{ background: 'var(--color-mist)', fontFamily: 'Nunito, sans-serif', color: 'var(--color-bark)' }}>
            <div className="px-4">Feature</div>
            <div>Free</div>
            <div style={{ color: 'var(--color-honey)' }}>Premium</div>
          </div>
          {[...FREE_FEATURES, ...PREMIUM_FEATURES].map((item, i) => (
            <div
              key={i}
              className={`grid grid-cols-3 text-sm py-3 border-t text-center items-center ${item.premium ? 'font-semibold' : ''}`}
              style={{
                borderColor: 'var(--color-stone)',
                background: item.premium ? '#fffbf0' : '#ffffff',
                fontFamily: 'Nunito, sans-serif',
                color: 'var(--color-bark)',
              }}
            >
              <div className="px-4 text-left">{item.text}</div>
              <div>
                {item.free ? (
                  <Check className="w-4 h-4 mx-auto" style={{ color: 'var(--color-leaf)' }} />
                ) : (
                  <span style={{ color: 'var(--color-stone)' }}>—</span>
                )}
              </div>
              <div>
                <Check className="w-4 h-4 mx-auto" style={{ color: item.premium ? 'var(--color-honey)' : 'var(--color-leaf)' }} />
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        {!isPremium && (
          <div className="text-center">
            <div
              className="inline-block rounded-[20px] border p-6 mb-6"
              style={{ background: '#fffbf0', borderColor: 'var(--color-honey)' }}
            >
              <Crown className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-honey)' }} />
              <p className="text-lg font-bold mb-1" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
                Payment integration coming soon
              </p>
              <p className="text-sm mb-4" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}>
                We're working on Stripe integration. In the meantime, premium access is granted manually by the admin.
              </p>
              {!user ? (
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
                >
                  Sign up to get notified
                </Link>
              ) : (
                <p className="text-sm font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-green)' }}>
                  ✓ You're signed in as {user.email}
                </p>
              )}
            </div>
          </div>
        )}

        {isPremium && (
          <div className="text-center space-y-4">
            <p className="text-lg font-bold" style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}>
              You have Premium access! Start exploring:
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/recipes" className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}>
                <Sparkles className="w-4 h-4" /> Personalise Recipes
              </Link>
              <Link to="/favorites" className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#D4667A', fontFamily: 'Nunito, sans-serif' }}>
                <Heart className="w-4 h-4" /> Favourites
              </Link>
              <Link to="/meal-planner" className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}>
                <Calendar className="w-4 h-4" /> Meal Planner
              </Link>
              <Link to="/shopping-list" className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--color-honey)', fontFamily: 'Nunito, sans-serif' }}>
                <ShoppingCart className="w-4 h-4" /> Shopping List
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
