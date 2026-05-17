-- ============================================================
-- INSTRUCTOR ROLES SPLIT
-- Adds two new tables to support:
--   1. instructor_subjects  → subject instructors (per subject+class)
--   2. class_instructors    → class instructors   (per class, many-per-class)
--
-- The existing instructor_classes table is KEPT intact so nothing
-- breaks. The new tables extend the model additively.
-- ============================================================


-- ============================================================
-- TABLE 1: instructor_subjects
-- Links an instructor to a specific subject within a class.
-- Grants subject-level permissions: exams, grades, questions,
-- exam reviews.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.instructor_subjects (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id    UUID        NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id      UUID        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id     UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, subject_id, class_id)
);

ALTER TABLE public.instructor_subjects ENABLE ROW LEVEL SECURITY;

-- Admins manage all subject assignments in their school
DROP POLICY IF EXISTS "Admins can manage instructor_subjects" ON public.instructor_subjects;
CREATE POLICY "Admins can manage instructor_subjects"
  ON public.instructor_subjects
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Instructors can read their own subject assignments
DROP POLICY IF EXISTS "Instructors can read own subject assignments" ON public.instructor_subjects;
CREATE POLICY "Instructors can read own subject assignments"
  ON public.instructor_subjects
  FOR SELECT
  TO authenticated
  USING (
    instructor_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND school_id = public.get_user_school_id(auth.uid())
    )
  );


-- ============================================================
-- TABLE 2: class_instructors
-- Links an instructor as a CLASS instructor (not subject).
-- Grants class-level permissions: attendance, notifications,
-- performance monitoring.
-- A class can have MULTIPLE class instructors.
-- An instructor can be both a subject instructor AND class instructor.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.class_instructors (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id      UUID        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id     UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, class_id)
);

ALTER TABLE public.class_instructors ENABLE ROW LEVEL SECURITY;

-- Admins manage all class instructor assignments in their school
DROP POLICY IF EXISTS "Admins can manage class_instructors" ON public.class_instructors;
CREATE POLICY "Admins can manage class_instructors"
  ON public.class_instructors
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Instructors can read their own class instructor assignments
DROP POLICY IF EXISTS "Instructors can read own class assignments" ON public.class_instructors;
CREATE POLICY "Instructors can read own class assignments"
  ON public.class_instructors
  FOR SELECT
  TO authenticated
  USING (
    instructor_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND school_id = public.get_user_school_id(auth.uid())
    )
  );


-- ============================================================
-- RLS EXTENSIONS: Subject-scoped access
-- Subject instructors can manage exams and grades for their
-- assigned subjects. These extend (not replace) the existing
-- admin and permission-based policies.
-- ============================================================

-- Exams: subject instructors can manage exams for their subjects
DROP POLICY IF EXISTS "Subject instructors can manage own subject exams" ON public.exams;
CREATE POLICY "Subject instructors can manage own subject exams"
  ON public.exams
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = exams.subject_id
        AND ins.school_id = exams.school_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = exams.subject_id
        AND ins.school_id = exams.school_id
    )
  );

-- Questions: subject instructors can manage questions for their subjects
DROP POLICY IF EXISTS "Subject instructors can manage own subject questions" ON public.questions;
CREATE POLICY "Subject instructors can manage own subject questions"
  ON public.questions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = questions.exam_id
        AND ins.instructor_id = auth.uid()
        AND ins.school_id = public.get_user_school_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = questions.exam_id
        AND ins.instructor_id = auth.uid()
        AND ins.school_id = public.get_user_school_id(auth.uid())
    )
  );

-- Grades: subject instructors can manage grades for their subjects
DROP POLICY IF EXISTS "Subject instructors can manage own subject grades" ON public.grades;
CREATE POLICY "Subject instructors can manage own subject grades"
  ON public.grades
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = grades.subject_id
        AND ins.class_id = grades.class_id
        AND ins.school_id = grades.school_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = grades.subject_id
        AND ins.class_id = grades.class_id
        AND ins.school_id = grades.school_id
    )
  );

-- Exam attempts: subject instructors can view submissions for their subjects
DROP POLICY IF EXISTS "Subject instructors can view own subject exam attempts" ON public.exam_attempts;
CREATE POLICY "Subject instructors can view own subject exam attempts"
  ON public.exam_attempts
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = exam_attempts.exam_id
        AND ins.instructor_id = auth.uid()
        AND ins.school_id = public.get_user_school_id(auth.uid())
    )
  );


-- ============================================================
-- RLS EXTENSIONS: Class-scoped access
-- Class instructors can manage attendance, view student
-- profiles, and post announcements for their assigned classes.
-- These are additive — existing permission-based policies remain.
-- ============================================================

-- Attendance: class instructors can manage attendance for their classes
DROP POLICY IF EXISTS "Class instructors can manage attendance" ON public.attendance;
CREATE POLICY "Class instructors can manage attendance"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.class_instructors ci
      WHERE ci.instructor_id = auth.uid()
        AND ci.class_id = attendance.class_id
        AND ci.school_id = attendance.school_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.class_instructors ci
      WHERE ci.instructor_id = auth.uid()
        AND ci.class_id = attendance.class_id
        AND ci.school_id = attendance.school_id
    )
  );

-- Announcements: class instructors can post for their classes
DROP POLICY IF EXISTS "Class instructors can post announcements" ON public.announcements;
CREATE POLICY "Class instructors can post announcements"
  ON public.announcements
  FOR ALL
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND (
      -- class-scoped announcement
      (target_class_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.class_instructors ci
        WHERE ci.instructor_id = auth.uid()
          AND ci.class_id = announcements.target_class_id
          AND ci.school_id = announcements.school_id
      ))
      -- school-wide announcement allowed if legacy permission still set
      OR (target_class_id IS NULL AND EXISTS (
        SELECT 1 FROM public.instructor_permissions ip
        WHERE ip.instructor_id = auth.uid()
          AND ip.can_post_announcements = true
      ))
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND (
      (target_class_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.class_instructors ci
        WHERE ci.instructor_id = auth.uid()
          AND ci.class_id = announcements.target_class_id
          AND ci.school_id = announcements.school_id
      ))
      OR (target_class_id IS NULL AND EXISTS (
        SELECT 1 FROM public.instructor_permissions ip
        WHERE ip.instructor_id = auth.uid()
          AND ip.can_post_announcements = true
      ))
    )
  );

-- Profiles: class instructors can view students in their classes
DROP POLICY IF EXISTS "Class instructors can view class student profiles" ON public.profiles;
CREATE POLICY "Class instructors can view class student profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.class_instructors ci
      WHERE ci.instructor_id = auth.uid()
        AND ci.class_id = profiles.class_id
        AND ci.school_id = profiles.school_id
    )
  );


-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Check if a user is a subject instructor for a given subject+class
CREATE OR REPLACE FUNCTION public.is_subject_instructor(
  _instructor_id uuid,
  _subject_id    uuid,
  _class_id      uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instructor_subjects ins
    WHERE ins.instructor_id = _instructor_id
      AND ins.subject_id    = _subject_id
      AND (_class_id IS NULL OR ins.class_id = _class_id)
  );
$$;

-- Check if a user is a class instructor for a given class
CREATE OR REPLACE FUNCTION public.is_class_instructor(
  _instructor_id uuid,
  _class_id      uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_instructors ci
    WHERE ci.instructor_id = _instructor_id
      AND ci.class_id      = _class_id
  );
$$;

-- Get all subject assignments for an instructor (used by frontend)
CREATE OR REPLACE FUNCTION public.get_instructor_subjects(_instructor_id uuid)
RETURNS TABLE (
  id            uuid,
  subject_id    uuid,
  subject_name  text,
  class_id      uuid,
  class_name    text,
  school_id     uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ins.id,
    ins.subject_id,
    s.name   AS subject_name,
    ins.class_id,
    c.name   AS class_name,
    ins.school_id
  FROM public.instructor_subjects ins
  JOIN public.subjects s ON s.id = ins.subject_id
  JOIN public.classes  c ON c.id = ins.class_id
  WHERE ins.instructor_id = _instructor_id
    AND (
      auth.uid() = _instructor_id
      OR (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        AND ins.school_id = public.get_user_school_id(auth.uid())
      )
    )
  ORDER BY c.name, s.name;
$$;

-- Get all class instructor assignments for an instructor (used by frontend)
CREATE OR REPLACE FUNCTION public.get_instructor_classes(_instructor_id uuid)
RETURNS TABLE (
  id            uuid,
  class_id      uuid,
  class_name    text,
  school_id     uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ci.id,
    ci.class_id,
    c.name AS class_name,
    ci.school_id
  FROM public.class_instructors ci
  JOIN public.classes c ON c.id = ci.class_id
  WHERE ci.instructor_id = _instructor_id
    AND (
      auth.uid() = _instructor_id
      OR (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        AND ci.school_id = public.get_user_school_id(auth.uid())
      )
    )
  ORDER BY c.name;
$$;
