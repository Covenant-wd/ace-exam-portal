-- ============================================================
-- Migration: Self-Service School Registration System
-- Purpose: Allow schools to self-register and require super admin approval
-- ============================================================

-- ── 1. EXTEND SCHOOLS TABLE ─────────────────────────────────────────────────────
-- Add registration status to track school onboarding state

DO $$
BEGIN
  -- Check if registration_status column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'registration_status'
  ) THEN
    ALTER TABLE schools ADD COLUMN registration_status VARCHAR(20) DEFAULT 'active';
    ALTER TABLE schools ADD CONSTRAINT schools_registration_status_check
      CHECK (registration_status IN ('active', 'pending', 'rejected', 'suspended'));
  END IF;
END $$;

-- ── 2. CREATE SCHOOL REGISTRATION REQUESTS TABLE ─────────────────────────────────
-- Stores all school registration requests awaiting approval

CREATE TABLE IF NOT EXISTS public.school_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  school_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  website VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

ALTER TABLE public.school_registration_requests ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_school_reqs_status ON public.school_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_school_reqs_email ON public.school_registration_requests(email);
CREATE INDEX IF NOT EXISTS idx_school_reqs_created_at ON public.school_registration_requests(created_at DESC);

-- ── 3. CREATE SCHOOL ADMINS MAPPING TABLE ────────────────────────────────────────
-- Maps schools to their admin users (a school can have multiple admins over time)

CREATE TABLE IF NOT EXISTS public.school_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, user_id)
);

ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_school_admins_school_id ON public.school_admins(school_id);
CREATE INDEX IF NOT EXISTS idx_school_admins_user_id ON public.school_admins(user_id);

-- ── 4. UPDATE TRIGGER FOR school_registration_requests ───────────────────────────
-- Auto-update the updated_at timestamp

DROP TRIGGER IF EXISTS update_school_reqs_updated_at ON public.school_registration_requests;
CREATE TRIGGER update_school_reqs_updated_at
  BEFORE UPDATE ON public.school_registration_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 5. ROW LEVEL SECURITY POLICIES ──────────────────────────────────────────────

-- school_registration_requests policies
DROP POLICY IF EXISTS "Only super admin can view all requests" ON public.school_registration_requests;
DROP POLICY IF EXISTS "Schools can insert their registration" ON public.school_registration_requests;
DROP POLICY IF EXISTS "Schools can view their own request" ON public.school_registration_requests;
DROP POLICY IF EXISTS "Only super admin can update requests" ON public.school_registration_requests;

CREATE POLICY "Only super admin can view all requests"
  ON public.school_registration_requests
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Schools can insert their registration"
  ON public.school_registration_requests
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Schools can view their own request"
  ON public.school_registration_requests
  FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Only super admin can update requests"
  ON public.school_registration_requests
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- school_admins policies
DROP POLICY IF EXISTS "Admins can view their school admin record" ON public.school_admins;
DROP POLICY IF EXISTS "Super admin can view all admin mappings" ON public.school_admins;
DROP POLICY IF EXISTS "System can insert admin mappings" ON public.school_admins;

CREATE POLICY "Admins can view their school admin record"
  ON public.school_admins
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    public.has_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.school_admins sa
        WHERE sa.school_id = school_admins.school_id
        AND sa.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Super admin can view all admin mappings"
  ON public.school_admins
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "System can insert admin mappings"
  ON public.school_admins
  FOR INSERT
  WITH CHECK (true);

-- ── 6. HELPER FUNCTION: Generate URL-safe slug from school name ──────────────────

CREATE OR REPLACE FUNCTION public.generate_school_slug(_school_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _slug TEXT;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  _slug := LOWER(TRIM(_school_name));
  _slug := REGEXP_REPLACE(_slug, '[^a-z0-9\-]', '', 'g');
  _slug := REGEXP_REPLACE(_slug, '-+', '-', 'g');
  _slug := TRIM(_slug, '-');
  
  -- Ensure minimum length
  IF LENGTH(_slug) = 0 THEN
    _slug := 'school-' || TO_CHAR(NOW(), 'YYMMDDHHmmss');
  END IF;
  
  RETURN _slug;
END;
$$;

-- ── 7. HELPER FUNCTION: Ensure unique slug ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_unique_slug(_base_slug TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  _slug TEXT := _base_slug;
  _counter INT := 1;
BEGIN
  -- Keep appending counter until slug is unique
  WHILE EXISTS (SELECT 1 FROM public.schools WHERE slug = _slug) LOOP
    _slug := _base_slug || '-' || _counter;
    _counter := _counter + 1;
  END LOOP;
  
  RETURN _slug;
END;
$$;

-- ── 8. HELPER FUNCTION: Approve registration and create school ────────────────────
-- This is called from an Edge Function when super admin approves a request

CREATE OR REPLACE FUNCTION public.approve_school_registration(
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
  _req school_registration_requests%ROWTYPE;
  _new_school schools%ROWTYPE;
  _new_slug TEXT;
BEGIN
  -- Fetch the registration request
  SELECT * INTO _req FROM school_registration_requests WHERE id = _req_id;
  
  IF _req IS NULL THEN
    RAISE EXCEPTION 'Registration request not found';
  END IF;
  
  IF _req.status != 'pending' THEN
    RAISE EXCEPTION 'Registration request is not pending (status: %)', _req.status;
  END IF;
  
  -- Generate unique slug for the school
  _new_slug := public.generate_unique_slug(public.generate_school_slug(_req.school_name));
  
  -- Create the school
  INSERT INTO schools (name, slug, registration_status)
  VALUES (_req.school_name, _new_slug, 'active')
  RETURNING * INTO _new_school;
  
  -- Update the registration request to approved
  UPDATE school_registration_requests
  SET status = 'approved',
      reviewed_by = _reviewed_by,
      reviewed_at = NOW()
  WHERE id = _req_id;
  
  -- Return result for notification/logging
  RETURN QUERY
  SELECT _new_school.id, _new_slug, _req.email, 'approved'::TEXT;
END;
$$;

-- ── 9. HELPER FUNCTION: Reject registration ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_school_registration(
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
  _req school_registration_requests%ROWTYPE;
BEGIN
  -- Fetch the registration request
  SELECT * INTO _req FROM school_registration_requests WHERE id = _req_id;
  
  IF _req IS NULL THEN
    RAISE EXCEPTION 'Registration request not found';
  END IF;
  
  IF _req.status != 'pending' THEN
    RAISE EXCEPTION 'Registration request is not pending (status: %)', _req.status;
  END IF;
  
  -- Update the registration request to rejected
  UPDATE school_registration_requests
  SET status = 'rejected',
      rejection_reason = _rejection_reason,
      reviewed_by = _reviewed_by,
      reviewed_at = NOW()
  WHERE id = _req_id;
  
  -- Return result for notification/logging
  RETURN QUERY
  SELECT NULL::UUID, _req.email, 'rejected'::TEXT, _rejection_reason;
END;
$$;

-- ── 10. SUMMARY ──────────────────────────────────────────────────────────────────
-- After this migration:
-- ✓ schools table has registration_status column
-- ✓ school_registration_requests table created for storing requests
-- ✓ school_admins table created for mapping schools to admins
-- ✓ RLS policies enforce data isolation and approval workflow
-- ✓ Helper functions for slug generation and approval workflow
-- ✓ Super admin can approve/reject school registrations
-- ────────────────────────────────────────────────────────────────────────────────
