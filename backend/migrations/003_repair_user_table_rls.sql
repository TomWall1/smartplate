-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Symptom: "Could not add. Please try again." when tapping Add to list in the
-- mobile app. Also silently empty favourites, pantry, meal plans and price
-- alerts — a read returns zero rows instead of an error, so those screens look
-- empty rather than broken.
--
-- Cause: RLS is ENABLED on these tables but NO policy was ever created. With
-- RLS on and no policy, Postgres denies everything: SELECT returns nothing and
-- INSERT/UPDATE/DELETE fail. 002 repaired public.users the same way but fixed
-- only that one table; addPremiumTables.js creates the tables and no policies.
--
-- Why the backend still works: the pipeline talks to Postgres through
-- DATABASE_URL as the table owner, which bypasses RLS. Only the routes that
-- act as the signed-in user (authService.clientForToken) are affected — that
-- is favourites, pantry, meal plans, shopping lists and price alerts.
--
-- Deliberately NOT covered, because no user-token code path touches them and
-- server-only is the correct posture:
--   match_feedback       written by routes/feedback.js via the pg pool
--   subscription_events  written by routes/subscriptions.js as service role
--
-- Idempotent — safe to re-run. Postgres has no CREATE POLICY IF NOT EXISTS,
-- hence DROP-then-CREATE. Looped rather than written out 20 times: the five
-- tables take an identical owner-only policy keyed on user_id.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'favorite_recipes',
    'meal_plans',
    'price_alerts',
    'shopping_lists',
    'user_pantries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "Owner can read"   ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Owner can insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Owner can update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Owner can delete" ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY "Owner can read" ON public.%I FOR SELECT
         TO authenticated USING (auth.uid() = user_id)', t);

    EXECUTE format(
      'CREATE POLICY "Owner can insert" ON public.%I FOR INSERT
         TO authenticated WITH CHECK (auth.uid() = user_id)', t);

    -- All five routes upsert, and ON CONFLICT DO UPDATE validates the
    -- post-update row against WITH CHECK, so UPDATE needs both clauses.
    EXECUTE format(
      'CREATE POLICY "Owner can update" ON public.%I FOR UPDATE
         TO authenticated USING (auth.uid() = user_id)
         WITH CHECK (auth.uid() = user_id)', t);

    EXECUTE format(
      'CREATE POLICY "Owner can delete" ON public.%I FOR DELETE
         TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;

-- Record that this file has been applied, so the boot-time check in
-- database/schemaMigrations.js stops listing it as outstanding.
INSERT INTO schema_migrations (name) VALUES ('003_repair_user_table_rls')
ON CONFLICT (name) DO NOTHING;
