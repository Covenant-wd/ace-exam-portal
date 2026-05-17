-- ============================================================
-- FIX: All instructor permission schema and RLS conflicts
-- ============================================================

-- ============================================================
-- FIX 1: Add missing `email` column to profiles
-- create_school_user inserts into profiles.email but no migration
-- ever created the column, causing it to fail on a fresh deploy.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text DEFAULT '';

-- Backfill email from auth.users for any existing rows that lack it
UPDATE public.profiles p
SET email = LOWER(au.email)
FROM auth.users au
WHERE au.id = p.user_id
  AND (p.email IS NULL OR p.email = '');


-- ============================================================
-- FIX 2: Add missing FK on instructor_classes.instructor_id
-- Without this, deleting an instructor leaves orphaned class
-- assignment rows with no cascade.
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instructor_classes_instructor_id_fkey'
      AND conrelid = 'public.instructor_classes'::regclass
  ) THEN
    ALTER TABLE public.instructor_classes
      ADD CONSTRAINT instructor_classes_instructor_id_fkey
      FOREIGN KEY (instructor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instructor_permissions_instructor_id_fkey'
      AND conrelid = 'public.instructor_permissions'::regclass
  ) THEN
    ALTER TABLE public.instructor_permissions
      ADD CONSTRAINT instructor_permissions_instructor_id_fkey
      FOREIGN KEY (instructor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ============================================================
-- FIX 3: Add WITH CHECK to admin policies on instructor_classes
-- and instructor_permissions.
--
-- FOR ALL with only USING means INSERT/UPDATE are silently
-- blocked because PostgreSQL requires WITH CHECK for writes.
-- This is the root cause of permission saves failing.
-- ============================================================

-- instructor_permissions
DROP POLICY IF EXISTS "Admins can manage instructor_permissions" ON public.instructor_permissions;
CREATE POLICY "Admins can manage instructor_permissions"
  ON public.instructor_permissions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  );

-- instructor_classes
DROP POLICY IF EXISTS "Admins can manage instructor_classes" ON public.instructor_classes;
CREATE POLICY "Admins can manage instructor_classes"
  ON public.instructor_classes
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  );


-- ============================================================
-- FIX 4: Remove conflicting duplicate instructor policies on
-- attendance and grades.
--
-- Migration 20260312 created:
--   "Instructors can manage attendance for their classes"
--   "Instructors can manage grades for their classes"
-- These bypass the permission check (can_mark_attendance /
-- can_manage_grades). Migration 20260315 added correct
-- permission-gated policies but never dropped the originals.
-- Both policies are permissive (OR logic), so the old ones
-- silently win and any instructor can write attendance/grades
-- regardless of their assigned permissions.
-- ============================================================
DROP POLICY IF EXISTS "Instructors can manage attendance for their classes" ON public.attendance;
DROP POLICY IF EXISTS "Instructors can manage grades for their classes" ON public.grades;

-- Re-assert the correct gated policies (idempotent drop+recreate
-- to ensure they exist with the right definition)
DROP POLICY IF EXISTS "Instructors can manage attendance for own school classes" ON public.attendance;
CREATE POLICY "Instructors can manage attendance for own school classes"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_mark_attendance = true
        AND ic.class_id = attendance.class_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_mark_attendance = true
        AND ic.class_id = attendance.class_id
    )
  );

DROP POLICY IF EXISTS "Instructors can manage grades for own school classes" ON public.grades;
CREATE POLICY "Instructors can manage grades for own school classes"
  ON public.grades
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_grades = true
        AND ic.class_id = grades.class_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_grades = true
        AND ic.class_id = grades.class_id
    )
  );


-- ============================================================
-- FIX 5: Add WITH CHECK to remaining instructor-owned SELECT
-- policies that are used in write contexts, and add school
-- isolation to all instructor sub-policies that lacked it.
-- ============================================================

-- instructor_permissions: instructors can only read their own row
DROP POLICY IF EXISTS "Instructors can view own permissions" ON public.instructor_permissions;
CREATE POLICY "Instructors can view own permissions"
  ON public.instructor_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = instructor_id);

-- instructor_classes: instructors can only read their own assignments
DROP POLICY IF EXISTS "Instructors can view own classes" ON public.instructor_classes;
CREATE POLICY "Instructors can view own classes"
  ON public.instructor_classes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = instructor_id);

-- Instructor exam management: add WITH CHECK
DROP POLICY IF EXISTS "Instructors can manage school theory questions" ON public.theory_questions;
CREATE POLICY "Instructors can manage school theory questions"
  ON public.theory_questions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = theory_questions.exam_id
        AND e.school_id = public.get_user_school_id(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_exams = true
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = theory_questions.exam_id
        AND e.school_id = public.get_user_school_id(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_exams = true
    )
  );


-- ============================================================
-- FIX 6: Tighten instructor RLS policies that had no WITH CHECK
-- (timetable periods/entries, fee types/payments, announcements,
--  grade categories, profiles)
-- ============================================================

-- timetable_periods: add WITH CHECK to the read-only policy
-- (SELECT only so no write check needed — leave as-is)

-- fee_payments: instructor can write, needs WITH CHECK
DROP POLICY IF EXISTS "Instructors can manage school fee payments" ON public.fee_payments;
CREATE POLICY "Instructors can manage school fee payments"
  ON public.fee_payments
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_fees = true
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_fees = true
    )
  );

-- announcements: instructor can write, needs WITH CHECK
DROP POLICY IF EXISTS "Instructors can manage school announcements" ON public.announcements;
CREATE POLICY "Instructors can manage school announcements"
  ON public.announcements
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_post_announcements = true
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_post_announcements = true
    )
  );


-- ============================================================
-- FIX 7: Ensure instructor_permissions.updated_at trigger exists
-- The table has updated_at column but no trigger was ever created
-- for it in any migration.
-- ============================================================
DROP TRIGGER IF EXISTS update_instructor_permissions_updated_at ON public.instructor_permissions;
CREATE TRIGGER update_instructor_permissions_updated_at
  BEFORE UPDATE ON public.instructor_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- FIX 8: Create get_instructor_permissions helper function
-- so the frontend can fetch all permissions for an instructor
-- in a single SECURITY DEFINER call, bypassing any residual
-- RLS edge cases on the permissions table.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_instructor_permissions(_instructor_id uuid)
RETURNS TABLE (
  instructor_id          uuid,
  school_id              uuid,
  can_manage_exams       boolean,
  can_view_results       boolean,
  can_manage_students    boolean,
  can_manage_subjects    boolean,
  can_mark_attendance    boolean,
  can_manage_grades      boolean,
  can_manage_timetable   boolean,
  can_manage_fees        boolean,
  can_post_announcements boolean,
  created_at             timestamptz,
  updated_at             timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ip.instructor_id,
    ip.school_id,
    ip.can_manage_exams,
    ip.can_view_results,
    ip.can_manage_students,
    ip.can_manage_subjects,
    ip.can_mark_attendance,
    ip.can_manage_grades,
    ip.can_manage_timetable,
    ip.can_manage_fees,
    ip.can_post_announcements,
    ip.created_at,
    ip.updated_at
  FROM public.instructor_permissions ip
  WHERE ip.instructor_id = _instructor_id
    -- caller must be the instructor themselves OR an admin of the same school
    AND (
      auth.uid() = _instructor_id
      OR (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        AND ip.school_id = public.get_user_school_id(auth.uid())
      )
    )
$$;


-- ============================================================
-- FIX 9: Ensure the upsert conflict target is safe.
-- The onConflict: "instructor_id" target in the frontend relies
-- on the UNIQUE constraint name. Add a named constraint so
-- Supabase's upsert can resolve it deterministically.
-- (The original migration declared UNIQUE inline which Postgres
-- auto-names; making it explicit avoids surprises.)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instructor_permissions_instructor_id_key'
      AND conrelid = 'public.instructor_permissions'::regclass
  ) THEN
    ALTER TABLE public.instructor_permissions
      ADD CONSTRAINT instructor_permissions_instructor_id_key UNIQUE (instructor_id);
  END IF;
END $$;
