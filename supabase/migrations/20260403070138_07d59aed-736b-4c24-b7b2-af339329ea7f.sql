CREATE OR REPLACE FUNCTION public.create_school_user(
  _email text,
  _password text,
  _full_name text,
  _role text,
  _school_id uuid DEFAULT NULL::uuid,
  _username text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'auth', 'public'
AS $function$
DECLARE
  _user_id   uuid;
  _encrypted text;
  _now       timestamptz := now();
  _first_name text;
  _last_name text;
BEGIN
  SELECT id INTO _user_id FROM auth.users WHERE email = lower(trim(_email));
  IF _user_id IS NOT NULL THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  _user_id := gen_random_uuid();
  _encrypted := crypt(_password, gen_salt('bf'));
  _first_name := split_part(trim(_full_name), ' ', 1);
  _last_name := NULLIF(TRIM(SUBSTRING(trim(_full_name) FROM POSITION(' ' IN trim(_full_name)) + 1)), '');

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
    user_id,
    full_name,
    first_name,
    last_name,
    username,
    school_id,
    email
  ) VALUES (
    _user_id,
    _full_name,
    COALESCE(_first_name, ''),
    COALESCE(_last_name, ''),
    NULLIF(_username, ''),
    _school_id,
    lower(trim(_email))
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    username = EXCLUDED.username,
    school_id = EXCLUDED.school_id,
    email = EXCLUDED.email;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id;

  INSERT INTO public.user_roles (
    user_id,
    role,
    school_id
  ) VALUES (
    _user_id,
    _role::app_role,
    _school_id
  );

  RETURN _user_id;
END;
$function$;