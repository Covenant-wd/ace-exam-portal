-- ================================================================
-- FIX EXAM SUBMISSION SAFETY
--
-- Ensures the student_answers INSERT/UPDATE RLS policies allow
-- students to write answers for their own non-submitted attempts
-- only. This enforces the transaction-safe order required by the
-- app: insert answers BEFORE marking is_submitted=true.
--
-- Also adds an index on student_answers(attempt_id) to speed up
-- the EXISTS sub-query in the RLS policies (runs on every upsert).
--
-- All statements are fully idempotent.
-- ================================================================

-- ── student_answers RLS ─────────────────────────────────────────

DROP POLICY IF EXISTS "Students can insert own answers"             ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers"             ON public.student_answers;
DROP POLICY IF EXISTS "Students can view own answers"               ON public.student_answers;
DROP POLICY IF EXISTS "Admins can view all answers"                 ON public.student_answers;
DROP POLICY IF EXISTS "Instructors can view assigned class answers" ON public.student_answers;

-- SELECT: student can read their own answers
CREATE POLICY "Students can view own answers"
  ON public.student_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
    )
  );

-- INSERT: student can only add answers to their own, non-submitted attempt.
-- The is_submitted = false check is the key safety guard:
-- it prevents answers from being written after the attempt is closed,
-- and enforces that answers must be inserted before closing the attempt.
CREATE POLICY "Students can insert own answers"
  ON public.student_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
        AND ea.is_submitted = false
    )
  );

-- UPDATE: same guard — only allow updates while the attempt is open
CREATE POLICY "Students can update own answers"
  ON public.student_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
        AND ea.is_submitted = false
    )
  );

-- Admins can view all answers for their school's exams
CREATE POLICY "Admins can view all answers"
  ON public.student_answers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Instructors can view answers for exams in their assigned subjects/classes.
-- Uses instructor_subjects (instructor_id, subject_id, class_id) which is the
-- actual assignment table in this schema (not the non-existent instructor_assignments).
CREATE POLICY "Instructors can view assigned class answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      INNER JOIN public.exams e    ON e.id       = ea.exam_id
      INNER JOIN public.profiles p ON p.user_id  = ea.student_id
      INNER JOIN public.instructor_subjects ins
        ON ins.subject_id = e.subject_id
       AND ins.class_id   = p.class_id
      WHERE ea.id = student_answers.attempt_id
        AND ins.instructor_id = auth.uid()
    )
  );

-- ── Performance index ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt_id
  ON public.student_answers (attempt_id);

-- ── exam_attempts: ensure update policy exists ──────────────────
DROP POLICY IF EXISTS "Students can update own attempts" ON public.exam_attempts;

CREATE POLICY "Students can update own attempts"
  ON public.exam_attempts FOR UPDATE
  USING (auth.uid() = student_id);
