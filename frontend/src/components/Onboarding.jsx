import React, { useState, useEffect } from 'react';
import { ShoppingCart, ChefHat, UserPlus, X, ArrowRight, HelpCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'dtd_onboarded';

const STEPS = [
  {
    icon: ShoppingCart,
    iconBg: 'var(--color-leaf)',
    title: 'Pick your supermarket',
    body: "Choose Woolworths, Coles, or IGA to see this week's specials near you.",
    image: null,
  },
  {
    icon: ChefHat,
    iconBg: 'var(--color-honey)',
    title: 'Deals become dishes',
    body: "We match what's on sale to real recipes — so you cook what's cheapest this week.",
    image: 'recipe-preview',
  },
  {
    icon: UserPlus,
    iconBg: 'var(--color-berry)',
    title: 'Make it yours',
    body: 'Sign in to save your dietary preferences and get personalised picks every week.',
    image: null,
  },
];

function RecipePreviewCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden mx-auto"
      style={{
        background: '#fff',
        border: '1.5px solid var(--color-stone)',
        boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)',
        maxWidth: 260,
      }}
    >
      <div
        className="h-28 flex items-center justify-center text-4xl"
        style={{ background: 'var(--color-mist)' }}
      >
        🍛
      </div>
      <div className="p-3">
        <div
          className="text-sm mb-1.5"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
        >
          One-Pan Chicken Curry
        </div>
        <div className="flex gap-1 mb-2">
          {['Chicken Thigh', 'Coconut Milk'].map((tag) => (
            <span
              key={tag}
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--color-mist)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
            >
              {tag}
            </span>
          ))}
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--color-peach)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
        >
          Save $4.20/meal
        </span>
      </div>
    </div>
  );
}

export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      // private browsing — skip onboarding
    }
  }, []);

  const start = () => setShow(true);
  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
  };

  return { showOnboarding: show, startOnboarding: start, dismissOnboarding: dismiss };
}

export default function Onboarding({ onDismiss }) {
  const [step, setStep] = useState(0);
  const { signInWithGoogle } = useAuth();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    onDismiss();
  };

  const handleGoogle = async () => {
    finish();
    try { await signInWithGoogle(); } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(92, 74, 53, 0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) finish(); }}
    >
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: 'var(--color-parchment)',
          boxShadow: '0 -4px 30px rgba(92, 74, 53, 0.15)',
        }}
      >
        {/* Skip / close */}
        <button
          onClick={finish}
          className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center transition-colors hover:bg-[#D6EDD4] z-10"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Skip onboarding"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="px-6 pt-8 pb-6 text-center">
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 24 : 8,
                  height: 8,
                  background: i === step ? 'var(--color-leaf)' : 'var(--color-stone)',
                }}
              />
            ))}
          </div>

          {/* Icon */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: current.iconBg }}
          >
            <Icon className="w-7 h-7 text-white" />
          </div>

          {/* Title */}
          <h2
            className="text-2xl mb-2"
            style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
          >
            {current.title}
          </h2>

          {/* Body */}
          <p
            className="text-sm mb-5 max-w-xs mx-auto leading-relaxed"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--color-text-muted)' }}
          >
            {current.body}
          </p>

          {/* Recipe preview for step 2 */}
          {current.image === 'recipe-preview' && (
            <div className="mb-5">
              <RecipePreviewCard />
            </div>
          )}

          {/* Google sign-in on last step */}
          {isLast && (
            <button
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-px mb-3"
              style={{
                background: '#ffffff',
                border: '1.5px solid var(--color-stone)',
                color: 'var(--color-bark)',
                fontFamily: 'Nunito, sans-serif',
                boxShadow: '0 1px 4px rgba(92, 74, 53, 0.08)',
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3">
            <button
              onClick={finish}
              className="flex-1 px-4 py-3.5 rounded-xl text-sm font-bold transition-colors"
              style={{
                background: 'transparent',
                color: 'var(--color-text-muted)',
                fontFamily: 'Nunito, sans-serif',
              }}
            >
              Skip
            </button>
            {!isLast && (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-px"
                style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {isLast && (
              <button
                onClick={finish}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-px"
                style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
              >
                Get started
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HowItWorksLink({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:opacity-70"
      style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}
    >
      <HelpCircle className="w-3.5 h-3.5" />
      How it works
    </button>
  );
}
