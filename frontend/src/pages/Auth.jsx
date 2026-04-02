import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { UtensilsCrossed, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode]         = useState('signin'); // signin | signup | forgot | reset
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [loading, setLoading]   = useState(false);

  const { signIn, signUp, signInWithGoogle, resetPassword, updatePassword, isRecoveryMode } = useAuth();
  const navigate = useNavigate();

  // When Supabase redirects back with recovery token, switch to reset mode
  useEffect(() => {
    if (isRecoveryMode) setMode('reset');
  }, [isRecoveryMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setMessage('Account created! Check your email to confirm your address, then sign in.');
        setMode('signin');
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setMessage('If that email exists, a reset link has been sent. Check your inbox.');
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        await updatePassword(password);
        setMessage('Password updated! You can now sign in.');
        setMode('signin');
      } else {
        await signIn(email, password);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  const inputStyle = {
    background: '#ffffff',
    border: '1.5px solid var(--color-stone)',
    borderRadius: '12px',
    padding: '12px 12px 12px 40px',
    fontFamily: 'Nunito, sans-serif',
    fontSize: '16px',
    color: 'var(--color-bark)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const handleInputFocus = (e) => {
    e.target.style.borderColor = 'var(--color-leaf)';
    e.target.style.boxShadow = '0 0 0 3px rgba(125, 184, 122, 0.15)';
  };
  const handleInputBlur = (e) => {
    e.target.style.borderColor = 'var(--color-stone)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--color-parchment)' }}
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-honey)', boxShadow: '0 2px 12px rgba(92, 74, 53, 0.15)' }}
        >
          <UtensilsCrossed className="w-6 h-6 text-white" />
        </div>
        <span
          className="text-2xl"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
        >
          Deal to Dish
        </span>
      </Link>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-[20px] p-8"
        style={{
          background: '#ffffff',
          border: '1.5px solid var(--color-stone)',
          boxShadow: '0 2px 12px rgba(92, 74, 53, 0.08)',
        }}
      >
        <h1
          className="text-xl mb-1"
          style={{ fontFamily: '"Fredoka One", sans-serif', color: 'var(--color-bark)' }}
        >
          {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create an account' : mode === 'forgot' ? 'Reset your password' : 'Set new password'}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
          {mode === 'signin'  ? 'Sign in to save your store and preferences.'
          : mode === 'signup' ? 'Save your store and preferences across devices.'
          : mode === 'forgot' ? "Enter your email and we'll send you a reset link."
          :                     'Enter and confirm your new password.'}
        </p>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm mb-4 border"
            style={{ background: 'var(--color-peach)', borderColor: 'var(--color-berry)', color: 'var(--color-berry)', fontFamily: 'Nunito, sans-serif' }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success message */}
        {message && (
          <div
            className="rounded-xl px-3 py-2.5 text-sm mb-4 border"
            style={{ background: 'var(--color-mist)', borderColor: 'var(--color-leaf)', color: 'var(--color-text-green)', fontFamily: 'Nunito, sans-serif' }}
          >
            {message}
          </div>
        )}

        {/* Google OAuth — only for signin/signup */}
        {(mode === 'signin' || mode === 'signup') && <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors mb-4 disabled:opacity-60"
          style={{
            border: '1.5px solid var(--color-stone)',
            color: 'var(--color-bark)',
            background: '#ffffff',
            fontFamily: 'Nunito, sans-serif',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-blush)'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>}

        {(mode === 'signin' || mode === 'signup') && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: 'var(--color-stone)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-stone)' }} />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email field — shown for signin, signup, forgot */}
          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          )}

          {/* Password field — shown for signin, signup, reset */}
          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold" style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
                    className="text-xs font-semibold hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          )}

          {/* Confirm password — only for reset mode */}
          {mode === 'reset' && (
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-bark)', fontFamily: 'Nunito, sans-serif' }}>
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-60 mt-1 hover:opacity-90 hover:-translate-y-px"
            style={{ background: 'var(--color-leaf)', fontFamily: 'Nunito, sans-serif' }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signin'  ? 'Sign in'
            : mode === 'signup' ? 'Create account'
            : mode === 'forgot' ? 'Send reset link'
            :                     'Update password'}
          </button>
        </form>

        <p className="text-center text-sm mt-5" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
          {mode === 'forgot' || mode === 'reset' ? (
            <button
              onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
              className="font-bold underline transition-opacity hover:opacity-70"
              style={{ color: 'var(--color-leaf)' }}
            >
              ← Back to sign in
            </button>
          ) : (
            <>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }}
                className="font-bold underline transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-leaf)' }}
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </>
          )}
        </p>
      </div>

      <p className="mt-6 text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'Nunito, sans-serif' }}>
        <Link to="/" className="hover:underline">← Back to home</Link>
      </p>
    </div>
  );
}
