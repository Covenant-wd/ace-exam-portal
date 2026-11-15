-- supabase/migrations/20261103000001_instructor_student_management.sql
-- ================================================================
-- INSTRUCTOR STUDENT MANAGEMENT (class-scoped)
--
-- PROBLEM
--   An instructor with can_manage_students = true could open the
--   Students page but could not add students: the page called
--   create_school_user(), which only admits admin / super_admin, so
--   every attempt failed with "Access denied". Edit and delete had
--   the same gap (and the Edit path went through an unscoped edge
--   function).
--
-- FIX
--   Instructors who hold can_manage_students AND are assigned to a
--   class (instructor_classes OR class_instructors) may add, edit,
--   move and delete students of THAT class only. Everything is
--   enforced server-side in SECURITY DEFINER functions, so the UI
--   cannot be bypassed.
--
-- Fully idempotent.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. Helper: may this instructor manage students of this class?
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.instructor_manages_class(
  _instructor_id uuid,
  _class_id      uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _instructor_id IS NOT NULL
    AND _class_id IS NOT NULL
    -- must hold the permission flag
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = _instructor_id
        AND ip.can_manage_students = true
    )
    -- class must belong to the instructor's own school
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = _class_id
        AND c.school_id = public.get_user_school_id(_instructor_id)
    )
    -- and the instructor must be assigned to it (legacy OR new table)
    AND (
      EXISTS (
        SELECT 1 FROM public.instructor_classes ic
        WHERE ic.instructor_id = _instructor_id
          AND ic.class_id = _class_id
      )
      OR EXISTS (
        SELECT 1 FROM public.class_instructors ci
        WHERE ci.instructor_id = _instructor_id
          AND ci.class_id = _class_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.instructor_manages_class(uuid, uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 2. Internal guard: caller is an instructor allowed to touch this
--    existing student (same school + student's class is theirs).
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._instructor_assert_student(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _class_id  uuid;
  _school_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(auth.uid(), 'instructor'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied: instructor role required';
  END IF;

  SELECT p.class_id, p.school_id
    INTO _class_id, _school_id
  FROM public.profiles p
  JOIN public.user_roles ur
    ON ur.user_id = p.user_id AND ur.role = 'student'::public.app_role
  WHERE p.user_id = _user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF _school_id IS DISTINCT FROM public.get_user_school_id(auth.uid()) THEN
    RAISE EXCEPTION 'Student does not belong to your school';
  END IF;

  IF NOT public.instructor_manages_class(auth.uid(), _class_id) THEN
    RAISE EXCEPTION 'You can only manage students in the classes assigned to you';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._instructor_assert_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._instructor_assert_student(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 3. Core user creation (no caller check) + keep create_school_user
--    as the admin-gated wrapper with identical behaviour.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._create_school_user_core(
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
  _final_email  text;
BEGIN
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

  SELECT id INTO _user_id FROM auth.users WHERE email = _final_email;
  IF _user_id IS NOT NULL THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

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
  VALUES (_user_id, _role::public.app_role, _school_id);

  RETURN _user_id;
END;
$function$;

-- Internal only — never callable straight from the client.
REVOKE ALL ON FUNCTION public._create_school_user_core(text, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;


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
  _caller_role text;
BEGIN
  SELECT role::text INTO _caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin')
  LIMIT 1;

  IF _caller_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: super_admin or admin role required';
  END IF;

  IF _caller_role = 'admin' THEN
    IF _school_id IS NULL OR
       _school_id != public.get_user_school_id(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied: admins can only create users in their own school';
    END IF;
    IF _role IN ('super_admin', 'outreach_officer') THEN
      RAISE EXCEPTION 'Access denied: admins cannot assign the % role', _role;
    END IF;
  END IF;

  RETURN public._create_school_user_core(_email, _password, _full_name, _role, _school_id, _username);
END;
$function$;


-- ────────────────────────────────────────────────────────────────
-- 4. ADD a student into one of the instructor's own classes
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.instructor_create_student(
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
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'auth', 'public'
AS $function$
DECLARE
  _school_id uuid;
  _full_name text;
  _new_id    uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(auth.uid(), 'instructor'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied: instructor role required';
  END IF;

  IF _class_id IS NULL THEN
    RAISE EXCEPTION 'Please choose a class for the new student';
  END IF;

  IF NOT public.instructor_manages_class(auth.uid(), _class_id) THEN
    RAISE EXCEPTION 'You can only add students to classes assigned to you';
  END IF;

  IF COALESCE(TRIM(_first_name), '') = '' OR COALESCE(TRIM(_last_name), '') = '' THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;

  IF COALESCE(_password, '') = '' THEN
    RAISE EXCEPTION 'Password is required for new students';
  END IF;

  _school_id := public.get_user_school_id(auth.uid());
  _full_name := TRIM(_first_name) || ' ' || TRIM(_last_name);

  _new_id := public._create_school_user_core(
    _email, _password, _full_name, 'student', _school_id, _username
  );

  UPDATE public.profiles SET
    first_name       = TRIM(_first_name),
    middle_name      = COALESCE(_middle_name, ''),
    last_name        = TRIM(_last_name),
    full_name        = TRIM(_first_name)
                       || CASE WHEN COALESCE(TRIM(_middle_name), '') <> '' THEN ' ' || TRIM(_middle_name) ELSE '' END
                       || ' ' || TRIM(_last_name),
    class_id         = _class_id,
    date_of_birth    = _date_of_birth,
    address          = COALESCE(_address, ''),
    parent_name      = COALESCE(_parent_name, ''),
    nationality      = COALESCE(_nationality, ''),
    gender           = COALESCE(_gender, ''),
    subjects_offered = COALESCE(_subjects_offered, ARRAY[]::text[]),
    phone_number     = NULLIF(TRIM(COALESCE(_phone_number, '')), '')
  WHERE user_id = _new_id;

  RETURN _new_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.instructor_create_student(
  text, text, text, text, text, text, uuid, date, text, text, text, text, text[], text
) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 5. EDIT a student (current class AND any new class must be theirs)
-- ────────────────────────────────────────────────────────────────
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
BEGIN
  PERFORM public._instructor_assert_student(_user_id);

  IF _class_id IS NULL OR NOT public.instructor_manages_class(auth.uid(), _class_id) THEN
    RAISE EXCEPTION 'You can only place students in classes assigned to you';
  END IF;

  IF COALESCE(TRIM(_first_name), '') = '' OR COALESCE(TRIM(_last_name), '') = '' THEN
    RAISE EXCEPTION 'First name and last name are required';
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
    username         = NULLIF(TRIM(COALESCE(_username, '')), ''),
    class_id         = _class_id,
    date_of_birth    = _date_of_birth,
    address          = COALESCE(_address, ''),
    parent_name      = COALESCE(_parent_name, ''),
    nationality      = COALESCE(_nationality, ''),
    gender           = COALESCE(_gender, ''),
    subjects_offered = COALESCE(_subjects_offered, ARRAY[]::text[]),
    phone_number     = NULLIF(TRIM(COALESCE(_phone_number, '')), '')
  WHERE user_id = _user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.instructor_update_student(
  uuid, text, text, text, text, text, text, uuid, date, text, text, text, text, text[], text
) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 6. MOVE / PROMOTE students between the instructor's own classes
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.instructor_move_students(
  _user_ids uuid[],
  _class_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _n  integer := 0;
BEGIN
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No students selected';
  END IF;

  IF _class_id IS NULL OR NOT public.instructor_manages_class(auth.uid(), _class_id) THEN
    RAISE EXCEPTION 'You can only move students into classes assigned to you';
  END IF;

  FOREACH _id IN ARRAY _user_ids LOOP
    PERFORM public._instructor_assert_student(_id);
    UPDATE public.profiles SET class_id = _class_id WHERE user_id = _id;
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.instructor_move_students(uuid[], uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 7. DELETE a student permanently (cascades through auth.users)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.instructor_delete_student(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'auth', 'public'
AS $function$
BEGIN
  PERFORM public._instructor_assert_student(_user_id);
  DELETE FROM auth.users WHERE id = _user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.instructor_delete_student(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 8. READ access: instructors with can_manage_students can see the
--    profiles of students in THEIR assigned classes (legacy table
--    and new class_instructors table).
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Instructors can read managed students" ON public.profiles;
CREATE POLICY "Instructors can read managed students"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.instructor_manages_class(auth.uid(), profiles.class_id)
  );


-- ────────────────────────────────────────────────────────────────
-- 9. LOCK DOWN "instructor sees ALL students" leaks
--
-- a) Remove any broad school-wide profile read policy. The repo's
--    own migrations already drop this name; this makes sure a copy
--    left behind on a live database can't keep leaking.
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "School members can view profiles in same school" ON public.profiles;
DROP POLICY IF EXISTS "Instructors can view school profiles"           ON public.profiles;
DROP POLICY IF EXISTS "Instructors can read school profiles"           ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view school profiles"   ON public.profiles;

-- b) get_school_students_only() returned EVERY student in the school
--    to any instructor. Instructors now only get students of the
--    classes they are assigned to (class instructor, legacy class
--    assignment, or subject-in-class assignment). Admins and
--    super_admins are unchanged.
DROP FUNCTION IF EXISTS public.get_school_students_only(uuid);

CREATE OR REPLACE FUNCTION public.get_school_students_only(_school_id uuid)
RETURNS TABLE(user_id uuid, class_id uuid, full_name text, username text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _is_instr boolean;
BEGIN
  SELECT
    bool_or(ur.role IN ('admin', 'super_admin') AND (ur.role = 'super_admin' OR ur.school_id = _school_id)),
    bool_or(ur.role = 'instructor' AND ur.school_id = _school_id)
  INTO _is_admin, _is_instr
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid();

  IF NOT COALESCE(_is_admin, false) AND NOT COALESCE(_is_instr, false) THEN
    RAISE EXCEPTION 'Access denied: admin, instructor or super_admin role required';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.class_id, p.full_name, p.username
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'student'
    AND ur.school_id = _school_id
    AND p.school_id = _school_id
    AND (
      COALESCE(_is_admin, false)
      OR EXISTS (SELECT 1 FROM public.instructor_classes ic
                 WHERE ic.instructor_id = auth.uid() AND ic.class_id = p.class_id)
      OR EXISTS (SELECT 1 FROM public.class_instructors ci
                 WHERE ci.instructor_id = auth.uid() AND ci.class_id = p.class_id)
      OR EXISTS (SELECT 1 FROM public.instructor_subjects isub
                 WHERE isub.instructor_id = auth.uid() AND isub.class_id = p.class_id)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_students_only(uuid) TO authenticated;
