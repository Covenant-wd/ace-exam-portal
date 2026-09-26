-- supabase/migrations/20260901000001_optional_email_student_registration.sql
-- ================================================================
-- MAKE EMAIL OPTIONAL FOR STUDENT (AND OTHER) REGISTRATION
--
-- Students already authenticate via username, not email — SchoolLogin
-- resolves a username to its internal auth email via
-- get_email_by_username(), then signs in with that email under the
-- hood. So the email column only needs to exist for Supabase Auth's
-- bookkeeping; it was never required for how students actually log in.
--
-- This migration lets create_school_user() accept a NULL/blank
-- _email. When omitted, the caller must supply a _username, and we
-- generate an internal, unique placeholder address purely so
-- auth.users has something to store — it is never a real, reachable
-- mailbox and is never shown to the student in the UI.
--
-- Fully idempotent — re-creates the function in place.
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
  _user_id      uuid;
  _encrypted    text;
  _now          timestamptz := now();
  _first_name   text;
  _last_name    text;
  _caller_role  text;
  _final_email  text;
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

  -- ── Resolve the email to store ─────────────────────────────────
  -- Email is now optional at registration time. When omitted, a
  -- username is required instead (that's what the student will log
  -- in with), and we generate a unique internal placeholder address
  -- so Supabase Auth still has a value to store.
  IF _email IS NULL OR TRIM(_email) = '' THEN
    IF _username IS NULL OR TRIM(_username) = '' THEN
      RAISE EXCEPTION 'Either an email or a username is required';
    END IF;
    _final_email := lower(regexp_replace(TRIM(_username), '[^a-zA-Z0-9]', '', 'g'))
                    || '.' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
                    || '@no-email.academiahq.pro';
  ELSE
    _final_email := lower(trim(_email));
  END IF;

  -- ── Duplicate email check ─────────────────────────────────────
  SELECT id INTO _user_id FROM auth.users WHERE email = _final_email;
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
    'authenticated', 'authenticated', _final_email, _encrypted,
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
    jsonb_build_object('sub', _user_id::text, 'email', _final_email, 'email_verified', true, 'provider', 'email'),
    'email', _final_email, _now, _now, _now
  );

  INSERT INTO public.profiles (
    user_id, full_name, first_name, last_name, username, school_id, email
  ) VALUES (
    _user_id, _full_name,
    COALESCE(_first_name, ''),
    COALESCE(_last_name, ''),
    NULLIF(_username, ''),
    _school_id,
    _final_email
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
