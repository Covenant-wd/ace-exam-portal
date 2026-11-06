-- ================================================================
-- MIGRATION: Add manual amount_paid to subscription management
-- Super admin can now enter the exact amount paid per school.
-- amount_paid is stored both on the schools row (latest payment)
-- and in the subscriptions history table (full audit trail).
-- ================================================================

-- 1. Add last_amount_paid column to schools (stores most recent payment)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS last_amount_paid NUMERIC(12,2) DEFAULT 0;

-- 2. Add payment_reference column to schools if missing
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- 3. Ensure subscriptions history table has amount_paid
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS amount_paid       NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- 4. Replace update_school_subscription with new signature including amount
DROP FUNCTION IF EXISTS public.update_school_subscription(UUID, TEXT, public.subscription_status, DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.update_school_subscription(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_school_subscription(
  _school_id          UUID,
  _plan               TEXT,
  _status             public.subscription_status,
  _expiry_date        DATE,
  _last_payment_date  DATE             DEFAULT NULL,
  _amount_paid        NUMERIC(12,2)    DEFAULT 0,
  _payment_reference  TEXT             DEFAULT NULL,
  _notes              TEXT             DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    v_final_status := _status;
  ELSE
    v_final_status := public.compute_subscription_status(_expiry_date);
  END IF;

  UPDATE public.schools SET
    subscription_plan   = _plan,
    subscription_status = v_final_status,
    expiry_date         = _expiry_date,
    last_payment_date   = COALESCE(_last_payment_date, CASE WHEN _amount_paid > 0 THEN CURRENT_DATE ELSE last_payment_date END),
    last_amount_paid    = CASE WHEN _amount_paid > 0 THEN _amount_paid ELSE last_amount_paid END,
    payment_reference   = CASE WHEN _payment_reference IS NOT NULL THEN _payment_reference ELSE payment_reference END
  WHERE id = _school_id;

  -- Always record every change in history
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
    'status',     v_final_status,
    'expiry_date', _expiry_date,
    'amount_paid', _amount_paid
  );
END; $$;

-- 5. Update get_all_schools_with_subscription to include amount columns
DROP FUNCTION IF EXISTS public.get_all_schools_with_subscription();
CREATE OR REPLACE FUNCTION public.get_all_schools_with_subscription()
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
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
