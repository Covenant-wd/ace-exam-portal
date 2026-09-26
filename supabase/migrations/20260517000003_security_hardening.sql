-- ================================================================
-- SECURITY HARDENING MIGRATION
-- Fixes all 5 areas identified in the security audit:
--   1. create_school_user  — add caller role check
--   2. get_user_emails_by_ids  — restrict to admin/super_admin
--   3. get_email_by_user_id   — restrict to admin/super_admin
--   4. get_school_students_only — restrict to admin/super_admin
-- (Fix 5: HTTP security headers are in vercel.json — separate file)
-- (Fix for send-email rate limiting is in the edge function — separate file)
-- All statements are fully idempotent and non-destructive.
-- ================================================================


-- ================================================================
-- FIX 1: create_school_user — add caller role check
--
-- This SECURITY DEFINER function writes directly into auth.users.
-- Previously it had no internal caller check — it relied entirely
-- on the Edge Function to gate access. Any authenticated user who
-- discovered the RPC could call it directly to create arbitrary
-- accounts. Now it verifies the caller is a super_admin or admin
-- before doing anything.
-- ================================================================
CREATE OR REPLACE FUNCTION public.create_school_user(
  _email      text,
  _password   text,
  _full_name  text,
  _role       text,
  _school_id  uuid DEFAULT NULL::uuid,
  _username   text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'auth', 'public'
AS $function$
DECLARE
  _user_id    uuid;
  _encrypted  text;
  _now        timestamptz := now();
  _first_name text;
  _last_name  text;
  _caller_role text;
BEGIN
  -- ── Caller must be super_admin or admin ───────────────────────
  SELECT role::text INTO _caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin')
  LIMIT 1;

  IF _caller_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: super_admin or admin role required';
  END IF;

  -- ── Admins can only create users within their own school ──────
  IF _caller_role = 'admin' THEN
    IF _school_id IS NULL OR
       _school_id != public.get_user_school_id(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied: admins can only create users in their own school';
    END IF;
    -- Admins cannot promote anyone to super_admin or outreach_officer
    IF _role IN ('super_admin', 'outreach_officer') THEN
      RAISE EXCEPTION 'Access denied: admins cannot assign the % role', _role;
    END IF;
  END IF;

  -- ── Duplicate email check ─────────────────────────────────────
  SELECT id INTO _user_id FROM auth.users WHERE email = lower(trim(_email));
  IF _user_id IS NOT NULL THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  -- ── Create the user ───────────────────────────────────────────
  _user_id    := gen_random_uuid();
  _encrypted  := crypt(_password, gen_salt('bf'));
  _first_name := split_part(trim(_full_name), ' ', 1);
  _last_name  := NULLIF(TRIM(SUBSTRING(trim(_full_name) FROM POSITION(' ' IN trim(_full_name)) + 1)), '');

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
    phone_change, phone_change_token, phone_change_sent_at,
    email_change_token_current, email_change_confirm_status, banned_until,
    reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at
  ) VALUES (
    _user_id, '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated', lower(trim(_email)), _encrypted,
    _now, NULL, '', NULL, '', NULL, '', '', NULL, NULL,
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('full_name', _full_name, 'school_id', COALESCE(_school_id::text, '')),
    false, _now, _now, NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), _user_id,
    jsonb_build_object('sub', _user_id::text, 'email', lower(trim(_email)), 'email_verified', true, 'provider', 'email'),
    'email', lower(trim(_email)), _now, _now, _now
  );

  INSERT INTO public.profiles (
    user_id, full_name, first_name, last_name, username, school_id, email
  ) VALUES (
    _user_id, _full_name,
    COALESCE(_first_name, ''),
    COALESCE(_last_name, ''),
    NULLIF(_username, ''),
    _school_id,
    lower(trim(_email))
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    username   = EXCLUDED.username,
    school_id  = EXCLUDED.school_id,
    email      = EXCLUDED.email;

  DELETE FROM public.user_roles WHERE user_id = _user_id;

  INSERT INTO public.user_roles (user_id, role, school_id)
  VALUES (_user_id, _role::app_role, _school_id);

  RETURN _user_id;
END;
$function$;


-- ================================================================
-- FIX 2: get_user_emails_by_ids — restrict to admin/super_admin
--
-- Previously any authenticated user could call this RPC and get
-- back email addresses for any list of user IDs. It is only ever
-- legitimately needed by admins sending bulk notifications.
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_user_emails_by_ids(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  -- Only admins and super_admins may resolve email addresses
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin or super_admin role required';
  END IF;

  RETURN QUERY
  SELECT u.id AS user_id, LOWER(u.email) AS email
  FROM auth.users u
  WHERE u.id = ANY(_user_ids)
    AND u.email IS NOT NULL
    AND u.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_emails_by_ids(uuid[]) TO authenticated;


-- ================================================================
-- FIX 3: get_email_by_user_id — restrict to admin/super_admin
--
-- Same exposure as above but for a single-user lookup.
-- Used when recording a fee payment to notify the student.
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_email_by_user_id(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin or super_admin role required';
  END IF;

  RETURN (
    SELECT LOWER(u.email)
    FROM auth.users u
    WHERE u.id = _user_id
      AND u.email IS NOT NULL
      AND u.deleted_at IS NULL
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_user_id(uuid) TO authenticated;


-- ================================================================
-- FIX 4: get_school_students_only — restrict to admin/super_admin
--
-- Returns all student user_ids for a school, used when sending
-- exam-published notifications. Previously any authenticated user
-- could enumerate all students in any school.
-- ================================================================
DROP FUNCTION IF EXISTS public.get_school_students_only(uuid);

CREATE OR REPLACE FUNCTION public.get_school_students_only(_school_id uuid)
RETURNS TABLE(user_id uuid, class_id uuid, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND role IN ('admin', 'super_admin', 'instructor')
      AND (
        role = 'super_admin'
        OR school_id = _school_id
      )
  ) THEN
    RAISE EXCEPTION 'Access denied: admin, instructor or super_admin role required';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.class_id, p.full_name
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'student'
    AND ur.school_id = _school_id
    AND p.school_id = _school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_students_only(uuid) TO authenticated;
