-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Repairs the RLS policies and signup trigger from 001. Symptom when they are
-- missing: GET /api/users/profile returns 500 and Render logs
--   [users/profile] upsert error: new row violates row-level security policy
-- because RLS is enabled on public.users but no INSERT policy matches, so a
-- first-time OAuth user can neither be found nor created.
--
-- Idempotent — safe to re-run. Postgres has no CREATE POLICY IF NOT EXISTS,
-- hence the DROP-then-CREATE.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"   ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- WITH CHECK matters here as well as USING: the profile route upserts, and an
-- ON CONFLICT DO UPDATE validates the post-update row against WITH CHECK.
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create the profile row on signup. SECURITY DEFINER, so it bypasses RLS
-- and covers every provider (password, Google, Apple) before the app asks.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill anyone who signed up while the trigger was missing.
INSERT INTO public.users (id, email)
SELECT au.id, au.email
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL AND au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;
