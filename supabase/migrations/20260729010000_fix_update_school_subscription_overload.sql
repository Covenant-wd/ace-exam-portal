-- ============================================================
-- Fix: "Could not choose the best candidate function between:
--   public.update_school_subscription(..., _status => public.subscription_status, ...),
--   public.update_school_subscription(..., _status => text, ...)"
--
-- Root cause: earlier migrations (20260425000001, 20260425000002,
-- 20260620143344) each ran their own DROP FUNCTION IF EXISTS with a
-- signature that no longer matched what was actually in the database
-- by the time they ran (params were added/removed over time — plan,
-- status type, expiry, last_payment_date, amount_paid, payment_reference,
-- notes). Because each DROP silently matched nothing, the CREATE OR
-- REPLACE that followed it created a brand-new *overload* instead of
-- replacing the existing function (Postgres identifies a function by
-- name + parameter types, so a different signature = a different
-- function). Over time this left multiple overloads of
-- update_school_subscription sitting in the database side by side —
-- including one where _status is typed public.subscription_status and
-- one where it's typed TEXT. When the frontend calls the RPC with a
-- plain string for _status (it does `String(status)`), Postgres can't
-- tell which overload to use, and the call fails outright.
--
-- Fix:
--   1. Dynamically find and drop every existing overload of
--      update_school_subscription, whatever its signature — this
--      cleans up any undocumented overload too, not just the ones
--      we can see in migration history.
--   2. Recreate exactly one canonical version matching how the
--      frontend actually calls it (SuperAdminDashboard.tsx), with
--      _status accepted as TEXT (frontend already sends a stringified
--      value) and cast to the enum internally.
--   3. Restore get_all_schools_with_subscription() to include
--      last_amount_paid / payment_reference — the 20260620143344
--      migration replaced this function with an older, simpler
--      version that silently dropped these two columns, which the
--      Super Admin dashboard still reads (school.last_amount_paid,
--      school.payment_reference).
-- ============================================================

-- ── 1. Drop every existing overload of update_school_subscription ──
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_school_subscription'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- ── 2. Recreate a single canonical version ──────────────────────────
CREATE FUNCTION public.update_school_subscription(
  _school_id          UUID,
  _plan               TEXT,
  _status             TEXT             DEFAULT NULL,  -- pass NULL to auto-compute from _expiry_date
  _expiry_date        DATE             DEFAULT NULL,
  _last_payment_date  DATE             DEFAULT NULL,
  _amount_paid        NUMERIC(12,2)    DEFAULT 0,
  _payment_reference  TEXT             DEFAULT NULL,
  _notes              TEXT             DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_final_status public.subscription_status;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required';
  END IF;

  IF _status IS NOT NULL THEN
    v_final_status := _status::public.subscription_status;
  ELSE
    v_final_status := public.compute_subscription_status(_expiry_date);
  END IF;

  UPDATE public.schools SET
    subscription_plan   = _plan,
    subscription_status = v_final_status,
    expiry_date          = COALESCE(_expiry_date, expiry_date),
    last_payment_date    = COALESCE(_last_payment_date, CASE WHEN _amount_paid > 0 THEN CURRENT_DATE ELSE last_payment_date END),
    last_amount_paid     = CASE WHEN _amount_paid > 0 THEN _amount_paid ELSE last_amount_paid END,
    payment_reference    = CASE WHEN _payment_reference IS NOT NULL THEN _payment_reference ELSE payment_reference END
  WHERE id = _school_id;

  INSERT INTO public.subscriptions
    (school_id, plan, status, amount_paid, payment_reference, payment_date, expiry_date, notes, created_by)
  VALUES
    (_school_id, _plan, v_final_status,
     COALESCE(_amount_paid, 0),
     _payment_reference,
     COALESCE(_last_payment_date, CURRENT_DATE),
     _expiry_date,
     _notes,
     auth.uid());

  RETURN jsonb_build_object(
    'status',      v_final_status,
    'expiry_date', _expiry_date,
    'amount_paid', _amount_paid
  );
END; $$;

-- ── 3. Restore last_amount_paid / payment_reference on the read side ─
DROP FUNCTION IF EXISTS public.get_all_schools_with_subscription();
CREATE FUNCTION public.get_all_schools_with_subscription()
RETURNS TABLE (
  id                  UUID,
  name                TEXT,
  slug                TEXT,
  logo_url            TEXT,
  subscription_plan   TEXT,
  stored_status       TEXT,
  computed_status     TEXT,
  expiry_date         DATE,
  last_payment_date   DATE,
  last_amount_paid    NUMERIC,
  payment_reference   TEXT,
  days_until_expiry   INTEGER,
  days_past_expiry    INTEGER,
  student_count       BIGINT,
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.slug,
    s.logo_url,
    s.subscription_plan,
    s.subscription_status::TEXT                                          AS stored_status,
    public.compute_subscription_status(s.expiry_date)::TEXT              AS computed_status,
    s.expiry_date,
    s.last_payment_date,
    COALESCE(s.last_amount_paid, 0)                                      AS last_amount_paid,
    s.payment_reference,
    CASE WHEN s.expiry_date IS NOT NULL
         THEN (s.expiry_date - CURRENT_DATE)::INTEGER ELSE NULL
    END                                                                  AS days_until_expiry,
    CASE WHEN s.expiry_date IS NOT NULL AND s.expiry_date < CURRENT_DATE
         THEN (CURRENT_DATE - s.expiry_date)::INTEGER ELSE 0
    END                                                                  AS days_past_expiry,
    (SELECT COUNT(*) FROM public.user_roles ur
     WHERE ur.school_id = s.id AND ur.role::text = 'student')           AS student_count,
    s.created_at
  FROM public.schools s
  ORDER BY s.name;
END; $$;
