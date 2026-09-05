-- ============================================================
-- Fix: "structure of query does not match function result type"
-- when rejecting a school registration request.
--
-- Root cause: same pattern already seen (and fixed) in
-- 20260729010000_fix_update_school_subscription_overload.sql —
-- reject_school_registration / approve_school_registration were
-- each (re)created by more than one migration and/or edited
-- directly on the Supabase dashboard over time. Postgres identifies
-- a function by name + parameter types, so any drift in signature
-- creates a new *overload* sitting alongside the old one rather than
-- replacing it. If the live overload's RETURN QUERY row shape no
-- longer matches its own declared RETURNS TABLE (e.g. from a table
-- column that was retyped/renamed via the dashboard, or a stray
-- half-applied edit), every call to it fails with "structure of
-- query does not match function result type" — regardless of what
-- the checked-in migration files say, since those may not reflect
-- what's actually live in the database.
--
-- Fix:
--   1. Dynamically find and drop every existing overload of both
--      reject_school_registration and approve_school_registration,
--      whatever their signature.
--   2. Recreate exactly one canonical version of each, matching how
--      the approve-school-registration edge function actually calls
--      them. Every returned column is built from an explicitly
--      SELECTed + explicitly cast local variable rather than a bare
--      %ROWTYPE field, so a future drift in the underlying table's
--      column types can no longer silently break the function's
--      declared return shape.
-- ============================================================

-- ── 1. Drop every existing overload of both functions ──────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('reject_school_registration', 'approve_school_registration')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- ── 2a. Recreate a single canonical reject_school_registration ─────
CREATE FUNCTION public.reject_school_registration(
  _req_id UUID,
  _reviewed_by UUID,
  _rejection_reason TEXT
)
RETURNS TABLE (
  school_id UUID,
  admin_email TEXT,
  status TEXT,
  rejection_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email  TEXT;
  _status TEXT;
BEGIN
  SELECT email::TEXT, status::TEXT
  INTO _email, _status
  FROM public.school_registration_requests
  WHERE id = _req_id;

  IF _email IS NULL THEN
    RAISE EXCEPTION 'Registration request not found';
  END IF;

  IF _status != 'pending' THEN
    RAISE EXCEPTION 'Registration request is not pending (status: %)', _status;
  END IF;

  UPDATE public.school_registration_requests
  SET status = 'rejected',
      rejection_reason = _rejection_reason,
      reviewed_by = _reviewed_by,
      reviewed_at = NOW()
  WHERE id = _req_id;

  RETURN QUERY
  SELECT NULL::UUID, _email::TEXT, 'rejected'::TEXT, _rejection_reason::TEXT;
END;
$$;

-- ── 2b. Recreate a single canonical approve_school_registration ────
CREATE FUNCTION public.approve_school_registration(
  _req_id UUID,
  _reviewed_by UUID
)
RETURNS TABLE (
  school_id UUID,
  school_slug TEXT,
  admin_email TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req        public.school_registration_requests%ROWTYPE;
  _new_school public.schools%ROWTYPE;
  _new_slug   TEXT;
BEGIN
  SELECT * INTO _req FROM public.school_registration_requests WHERE id = _req_id;

  IF _req IS NULL THEN
    RAISE EXCEPTION 'Registration request not found';
  END IF;

  IF _req.status != 'pending' THEN
    RAISE EXCEPTION 'Registration request is not pending (status: %)', _req.status;
  END IF;

  _new_slug := public.generate_unique_slug(public.generate_school_slug(_req.school_name));

  INSERT INTO public.schools (name, slug, registration_status)
  VALUES (_req.school_name, _new_slug, 'active')
  RETURNING * INTO _new_school;

  UPDATE public.school_registration_requests
  SET status = 'approved',
      reviewed_by = _reviewed_by,
      reviewed_at = NOW()
  WHERE id = _req_id;

  RETURN QUERY
  SELECT _new_school.id, _new_slug::TEXT, _req.email::TEXT, 'approved'::TEXT;
END;
$$;

-- ── 3. Ensure the edge function's service-role caller can execute ──
GRANT EXECUTE ON FUNCTION public.reject_school_registration(UUID, UUID, TEXT)  TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_school_registration(UUID, UUID)        TO service_role;
