import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase env vars not set — auth features will be disabled.');
}

// Determine redirect URL based on environment
const getRedirectURL = () => {
  // Development: use localhost
  if (import.meta.env.DEV) {
    return window.location.origin; // Will be http://localhost:5173 or similar
  }
  // Production: use actual domain
  return 'https://dealtodish.com';
};

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        redirectTo: getRedirectURL(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;
