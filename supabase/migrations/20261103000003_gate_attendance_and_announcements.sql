-- supabase/migrations/20261103000003_gate_attendance_and_announcements.sql
-- ================================================================
-- ATTENDANCE & ANNOUNCEMENTS MUST BE PERMISSION-GATED AND CLASS-SCOPED
--
-- PROBLEM
--   * "Class instructors can manage attendance" gave full attendance
--     access to ANY instructor with a class assignment — the
--     can_mark_attendance flag was never checked.
--   * "Class instructors can post announcements" did the same for
--     can_post_announcements.
--   * "Instructors can manage school announcements" let anyone with
--     can_post_announcements post to the WHOLE school / any class.
--
-- FIX
--   An instructor may only
--     - mark attendance if can_mark_attendance = true AND only for a
--       class they are assigned to;
--     - post announcements if can_post_announcements = true AND only
--       to a class they are assigned to, and only edit/delete their own.
--   Admins are unaffected.
--
-- Fully idempotent.
-- ================================================================

-- Helper: is this instructor assigned to this class? (new table is the
-- source of truth; the legacy mirror is accepted too.)
CREATE OR REPLACE FUNCTION public.instructor_assigned_to_class(
  _instructor_id uuid,
  _class_id      uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _instructor_id IS NOT NULL
    AND _class_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.class_instructors ci
              WHERE ci.instructor_id = _instructor_id AND ci.class_id = _class_id)
      OR EXISTS (SELECT 1 FROM public.instructor_classes ic
                 WHERE ic.instructor_id = _instructor_id AND ic.class_id = _class_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.instructor_assigned_to_class(uuid, uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- ATTENDANCE
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Class instructors can manage attendance"                  ON public.attendance;
DROP POLICY IF EXISTS "Instructors can manage attendance for their classes"      ON public.attendance;
DROP POLICY IF EXISTS "Instructors can manage attendance for own school classes" ON public.attendance;

CREATE POLICY "Instructors can manage attendance for own school classes"
  ON public.attendance FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_mark_attendance = true
    )
    AND public.instructor_assigned_to_class(auth.uid(), attendance.class_id)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_mark_attendance = true
    )
    AND public.instructor_assigned_to_class(auth.uid(), attendance.class_id)
  );


-- ────────────────────────────────────────────────────────────────
-- ANNOUNCEMENTS
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Class instructors can post announcements"          ON public.announcements;
DROP POLICY IF EXISTS "Instructors can manage school announcements"       ON public.announcements;
DROP POLICY IF EXISTS "Instructors can manage own class announcements"    ON public.announcements;

CREATE POLICY "Instructors can manage own class announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND created_by = auth.uid()
    AND target_class_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true
    )
    AND public.instructor_assigned_to_class(auth.uid(), announcements.target_class_id)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND created_by = auth.uid()
    AND target_class_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true
    )
    AND public.instructor_assigned_to_class(auth.uid(), announcements.target_class_id)
  );
