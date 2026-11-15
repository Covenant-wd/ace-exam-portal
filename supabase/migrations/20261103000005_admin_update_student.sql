-- supabase/migrations/20261103000005_admin_update_student.sql
-- ================================================================
-- RELIABLE STUDENT EDITING FOR ADMINS
--
-- PROBLEM
--   Editing a student called update_school_user(), a database function
--   that is NOT defined in any migration in this project (the generated
--   types even list a different, older signature). Edits could be
--   silently ignored while the screen still showed the new values.
--
-- FIX
--   A known, version-controlled function that:
--     * only lets an admin of the SAME school (or a super_admin) edit;
--     * updates login email, password, username and every profile field;
--     * raises a clear error on any problem (never fails silently).
--
-- Fully idempotent.
-- ================================================================
CREATE OR REPLACE FUNCTION public.admin_update_student(
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
  _school_id  uuid;
  _new_email  text;
  _old_email  text;
  _new_user   text;
  _dupe       uuid;
  _rows       integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The target must be a student, and we need its school.
  SELECT p.school_id INTO _school_id
  FROM public.profiles p
  JOIN public.user_roles ur
    ON ur.user_id = p.user_id AND ur.role = 'student'::public.app_role
  WHERE p.user_id = _user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  -- Caller: super_admin, or an admin of the student's own school.
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.get_user_school_id(auth.uid()) = _school_id
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: you can only edit students in your own school';
  END IF;

  IF COALESCE(TRIM(_first_name), '') = '' OR COALESCE(TRIM(_last_name), '') = '' THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;

  IF _class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.classes c WHERE c.id = _class_id AND c.school_id = _school_id
  ) THEN
    RAISE EXCEPTION 'That class does not belong to this school';
  END IF;

  -- Username (globally unique)
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

  -- Login email (optional — blank means "leave unchanged")
  _new_email := NULLIF(lower(trim(COALESCE(_email, ''))), '');
  SELECT email INTO _old_email FROM auth.users WHERE id = _user_id;

  IF _new_email IS NOT NULL AND _new_email IS DISTINCT FROM lower(COALESCE(_old_email, '')) THEN
    SELECT id INTO _dupe FROM auth.users WHERE lower(email) = _new_email AND id <> _user_id;
    IF _dupe IS NOT NULL THEN
      RAISE EXCEPTION 'An account with this email already exists';
    END IF;

    UPDATE auth.users SET email = _new_email, updated_at = now() WHERE id = _user_id;
    UPDATE auth.identities
       SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(_new_email)),
           provider_id   = _new_email,
           updated_at    = now()
     WHERE user_id = _user_id AND provider = 'email';
  END IF;

  -- Password (optional — blank means "leave unchanged")
  IF COALESCE(_password, '') <> '' THEN
    UPDATE auth.users
       SET encrypted_password = crypt(_password, gen_salt('bf')),
           updated_at = now()
     WHERE id = _user_id;
  END IF;

  -- Profile
  UPDATE public.profiles SET
    first_name       = TRIM(_first_name),
    middle_name      = COALESCE(TRIM(_middle_name), ''),
    last_name        = TRIM(_last_name),
    full_name        = TRIM(_first_name)
                       || CASE WHEN COALESCE(TRIM(_middle_name), '') <> '' THEN ' ' || TRIM(_middle_name) ELSE '' END
                       || ' ' || TRIM(_last_name),
    username         = _new_user,
    email            = COALESCE(_new_email, email),
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

GRANT EXECUTE ON FUNCTION public.admin_update_student(
  uuid, text, text, text, text, text, text, uuid, date, text, text, text, text, text[], text
) TO authenticated;
