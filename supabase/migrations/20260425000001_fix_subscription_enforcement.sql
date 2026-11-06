-- ================================================================
-- MIGRATION: Fix subscription enforcement system
-- Fixes:
--   1. update_school_subscription now accepts an explicit _status
--      override so super-admin manual overrides actually persist
--   2. get_all_schools_with_subscription RPC returns stored status
--      (not recomputed) so overrides are visible in the dashboard
--   3. Adds missing subscription columns if not yet present
-- ================================================================

-- 1. Ensure columns exist (idempotent)
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('active','grace','restricted','suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS subscription_plan   TEXT NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expiry_date         DATE,
  ADD COLUMN IF NOT EXISTS last_payment_date   DATE,
  ADD COLUMN IF NOT EXISTS monthly_fee         NUMERIC(10,2) DEFAULT 0;

-- 2. Ensure subscriptions history table exists
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan              TEXT NOT NULL DEFAULT 'basic',
  status            public.subscription_status NOT NULL DEFAULT 'active',
  amount_paid       NUMERIC(10,2) DEFAULT 0,
  payment_reference TEXT,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date       DATE NOT NULL,
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_subscriptions_all" ON public.subscriptions;
CREATE POLICY "super_admin_subscriptions_all" ON public.subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text = 'super_admin'
    )
  );

-- 3. Helper: compute status purely from expiry date
--    Used when no manual override is set
CREATE OR REPLACE FUNCTION public.compute_subscription_status(p_expiry_date DATE)
RETURNS public.subscription_status
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE today DATE := CURRENT_DATE;
BEGIN
  IF p_expiry_date IS NULL THEN RETURN 'active'; END IF;
  IF today <= p_expiry_date          THEN RETURN 'active';
  ELSIF today <= p_expiry_date + 7   THEN RETURN 'grace';
  ELSIF today <= p_expiry_date + 14  THEN RETURN 'restricted';
  ELSE                                    RETURN 'suspended';
  END IF;
END; $$;

-- 4. FIXED: update_school_subscription
--    Now accepts _status so super-admin can override the computed value.
--    If _status is NULL, status is computed from _expiry_date automatically.
DROP FUNCTION IF EXISTS public.update_school_subscription(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_school_subscription(UUID, TEXT, public.subscription_status, DATE, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.update_school_subscription(
  _school_id          UUID,
  _plan               TEXT,
  _status             public.subscription_status,  -- explicit override; pass NULL to auto-compute
  _expiry_date        DATE,
  _last_payment_date  DATE    DEFAULT NULL,
  _notes              TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_final_status public.subscription_status;
BEGIN
  -- Only super_admins can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required';
  END IF;

  -- If super-admin passed an explicit status, use it.
  -- Otherwise compute from expiry date.
  IF _status IS NOT NULL THEN
    v_final_status := _status;
  ELSE
    v_final_status := public.compute_subscription_status(_expiry_date);
  END IF;

  UPDATE public.schools SET
    subscription_plan   = _plan,
    subscription_status = v_final_status,
    expiry_date         = _expiry_date,
    last_payment_date   = COALESCE(_last_payment_date, last_payment_date)
  WHERE id = _school_id;

  -- Record in history
  INSERT INTO public.subscriptions
    (school_id, plan, status, expiry_date, notes, created_by)
  VALUES
    (_school_id, _plan, v_final_status, _expiry_date, _notes, auth.uid());

  RETURN jsonb_build_object('status', v_final_status, 'expiry_date', _expiry_date);
END; $$;

-- 5. get_all_schools_with_subscription RPC
--    Returns stored subscription_status (respects manual overrides).
--    Also exposes computed_status so the UI can show both if needed.
DROP FUNCTION IF EXISTS public.get_all_schools_with_subscription();
CREATE OR REPLACE FUNCTION public.get_all_schools_with_subscription()
RETURNS TABLE (
  id                UUID,
  name              TEXT,
  slug              TEXT,
  logo_url          TEXT,
  subscription_plan TEXT,
  stored_status     TEXT,   -- what is actually stored (respects override)
  computed_status   TEXT,   -- what date-math says (informational)
  expiry_date       DATE,
  last_payment_date DATE,
  days_until_expiry INTEGER,
  days_past_expiry  INTEGER,
  student_count     BIGINT,
  created_at        TIMESTAMPTZ
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
    s.subscription_status::TEXT                                         AS stored_status,
    public.compute_subscription_status(s.expiry_date)::TEXT             AS computed_status,
    s.expiry_date,
    s.last_payment_date,
    CASE WHEN s.expiry_date IS NOT NULL
         THEN (s.expiry_date - CURRENT_DATE)::INTEGER
         ELSE NULL
    END                                                                 AS days_until_expiry,
    CASE WHEN s.expiry_date IS NOT NULL AND s.expiry_date < CURRENT_DATE
         THEN (CURRENT_DATE - s.expiry_date)::INTEGER
         ELSE 0
    END                                                                 AS days_past_expiry,
    (SELECT COUNT(*) FROM public.user_roles ur
     WHERE ur.school_id = s.id AND ur.role::text = 'student')          AS student_count,
    s.created_at
  FROM public.schools s
  ORDER BY s.name;
END; $$;

-- 6. Daily cron refresh — only updates schools that have NOT been manually overridden.
--    We detect manual override by checking if stored_status differs from computed.
--    Schools that were manually set get a NULL expiry_date or a special flag.
--    Simplest safe approach: only auto-update schools where status matches computed.
CREATE OR REPLACE FUNCTION public.refresh_subscription_statuses()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE updated INTEGER;
BEGIN
  UPDATE public.schools
  SET subscription_status = public.compute_subscription_status(expiry_date)
  WHERE
    expiry_date IS NOT NULL
    -- Only overwrite if current stored status equals what date-math produces
    -- (i.e. don't clobber manual overrides)
    AND subscription_status = public.compute_subscription_status(expiry_date);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END; $$;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_schools_sub_status  ON public.schools(subscription_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school ON public.subscriptions(school_id, created_at DESC);
