-- supabase/migrations/20261103000006_instructor_update_student_hardening.sql
-- ================================================================
-- Instructor student edits: same safety as the admin version.
--   * clear "username already taken" message (instead of a raw
--     database constraint error);
--   * raises if nothing was actually updated (never silent).
-- Replaces instructor_update_student() from
-- 20261103000001_instructor_student_management.sql. Idempotent.
-- ================================================================

CREATE OR REPLACE FUNCTION public.instructor_update_student(
  _user_id          uuid,
  _email            text,
  _password         text,
  _first_name       text,
  _middle_name      text,
  _last_name        text,
  _username         text,
  _class_id         uuid,
  _date_of_birth    date,
  _address          text,
  _parent_name      text,
  _nationality      text,
  _gender           text,
  _subjects_offered text[],
  _phone_number     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'auth', 'public'
AS $function$
DECLARE
  _new_email   text;
  _old_email   text;
  _dupe        uuid;
  _new_user    text;
  _rows        integer;
BEGIN
  PERFORM public._instructor_assert_student(_user_id);

  IF _class_id IS NULL OR NOT public.instructor_manages_class(auth.uid(), _class_id) THEN
    RAISE EXCEPTION 'You can only place students in classes assigned to you';
  END IF;

  IF COALESCE(TRIM(_first_name), '') = '' OR COALESCE(TRIM(_last_name), '') = '' THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;

  -- Username (globally unique) — give a clear message instead of a raw constraint error
  _new_user := NULLIF(TRIM(COALESCE(_username, '')), '');
  IF _new_user IS NOT NULL THEN
    SELECT p.user_id INTO _dupe
    FROM public.profiles p
    WHERE lower(p.username) = lower(_new_user) AND p.user_id <> _user_id
    LIMIT 1;
    IF _dupe IS NOT NULL THEN
      RAISE EXCEPTION 'That username is already taken';
    END IF;
  END IF;

  -- Email change (optional)
  _new_email := NULLIF(lower(trim(COALESCE(_email, ''))), '');
  SELECT email INTO _old_email FROM auth.users WHERE id = _user_id;

  IF _new_email IS NOT NULL AND _new_email IS DISTINCT FROM lower(COALESCE(_old_email, '')) THEN
    SELECT id INTO _dupe FROM auth.users WHERE email = _new_email AND id <> _user_id;
    IF _dupe IS NOT NULL THEN
      RAISE EXCEPTION 'An account with this email already exists';
    END IF;

    UPDATE auth.users SET email = _new_email, updated_at = now() WHERE id = _user_id;
    UPDATE auth.identities
       SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(_new_email)),
           provider_id   = _new_email,
           updated_at    = now()
     WHERE user_id = _user_id AND provider = 'email';
    UPDATE public.profiles SET email = _new_email WHERE user_id = _user_id;
  END IF;

  -- Password change (optional)
  IF COALESCE(_password, '') <> '' THEN
    UPDATE auth.users
       SET encrypted_password = crypt(_password, gen_salt('bf')),
           updated_at = now()
     WHERE id = _user_id;
  END IF;

  UPDATE public.profiles SET
    first_name       = TRIM(_first_name),
    middle_name      = COALESCE(_middle_name, ''),
    last_name        = TRIM(_last_name),
    full_name        = TRIM(_first_name)
                       || CASE WHEN COALESCE(TRIM(_middle_name), '') <> '' THEN ' ' || TRIM(_middle_name) ELSE '' END
                       || ' ' || TRIM(_last_name),
    username         = _new_user,
    class_id         = _class_id,
    date_of_birth    = _date_of_birth,
    address          = COALESCE(_address, ''),
    parent_name      = COALESCE(_parent_name, ''),
    nationality      = COALESCE(_nationality, ''),
    gender           = COALESCE(_gender, ''),
    subjects_offered = COALESCE(_subjects_offered, ARRAY[]::text[]),
    phone_number     = NULLIF(TRIM(COALESCE(_phone_number, '')), '')
  WHERE user_id = _user_id;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows = 0 THEN
    RAISE EXCEPTION 'Update failed: no student record was changed';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.instructor_update_student(
  uuid, text, text, text, text, text, text, uuid, date, text, text, text, text, text[], text
) TO authenticated;
