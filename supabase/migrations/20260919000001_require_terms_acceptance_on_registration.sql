-- ============================================================
-- Require Terms & Privacy acceptance on school registration
--
-- 1. Record WHEN a school accepted and WHICH version of the legal text.
-- 2. Enforce it in the database: the public (anon / authenticated) INSERT
--    policy now rejects any registration that lacks an acceptance record,
--    so the requirement can't be bypassed by calling the API directly.
--
-- Notes:
--   • Existing rows are untouched (columns are nullable; the check only
--     applies to new INSERTs made through the public API).
--   • Inserts made with the service role (edge functions) bypass RLS and
--     are not affected.
--   • Run this BEFORE deploying the updated SchoolRegistration.tsx.
--   • Postgres OR-combines permissive policies, so a leftover INSERT policy
--     (e.g. created by hand in the Supabase dashboard) would silently defeat
--     the check. We therefore drop EVERY existing INSERT policy on this table
--     by looking them up in pg_policies, then create the single canonical one.
-- ============================================================

ALTER TABLE public.school_registration_requests
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legal_version TEXT;

COMMENT ON COLUMN public.school_registration_requests.terms_accepted_at IS
  'When the registrant accepted the Terms and Conditions and Privacy Policy.';
COMMENT ON COLUMN public.school_registration_requests.legal_version IS
  'Version stamp (see src/lib/legalContent.ts) of the legal text that was accepted.';

-- Drop every existing INSERT policy, whatever it is named
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'school_registration_requests'
      AND cmd        = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.school_registration_requests', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Schools can insert their registration"
  ON public.school_registration_requests
  FOR INSERT
  WITH CHECK (
    terms_accepted_at IS NOT NULL
    AND legal_version IS NOT NULL
    AND length(btrim(legal_version)) > 0
  );

-- Heads-up only: a FOR ALL policy would also permit INSERTs and could bypass the
-- check above. None are expected; if any exist they are listed in the migration output.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'school_registration_requests'
      AND cmd        = 'ALL'
  LOOP
    RAISE NOTICE 'Review policy "%" (roles: %): a FOR ALL policy also allows INSERT.', pol.policyname, pol.roles;
  END LOOP;
END $$;
