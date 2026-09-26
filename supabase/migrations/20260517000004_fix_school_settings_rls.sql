-- ================================================================
-- FIX: school_settings admin policy missing WITH CHECK clause
--
-- Root cause of "Failed to upload logo" for newly-added schools:
--
-- The "Admins can manage settings" policy was defined as:
--   FOR ALL USING (has_role(uid, 'admin'))
-- with NO WITH CHECK clause.
--
-- In PostgreSQL RLS:
--   - USING  → filters which existing rows are visible (SELECT/UPDATE/DELETE)
--   - WITH CHECK → approves incoming row data for writes (INSERT/UPDATE)
--
-- When WITH CHECK is omitted on a FOR ALL policy, INSERT and UPDATE
-- operations are blocked silently — they return 0 rows affected and
-- no error is raised to the client. This is why:
--   1. The storage upload succeeds (storage policies have both USING + WITH CHECK)
--   2. The subsequent upsert of the public URL into school_settings silently
--      fails → the mutation throws, and the UI shows "Failed to upload logo"
--
-- The same missing-WITH CHECK pattern existed on the storage UPDATE policy
-- (documented and fixed in migration 20260222061501). This migration applies
-- the same fix to the school_settings table policy.
--
-- Fix: recreate the admin policy with an explicit WITH CHECK clause.
-- ================================================================

DROP POLICY IF EXISTS "Admins can manage settings" ON public.school_settings;

CREATE POLICY "Admins can manage settings"
  ON public.school_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
