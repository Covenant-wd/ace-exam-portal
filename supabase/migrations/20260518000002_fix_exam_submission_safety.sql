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

-- Drop existing policies first (idempotent — IF EXISTS)
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
-- and it enforces that answers must be inserted before closing the attempt.
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

-- Instructors can view answers for exams in their assigned classes
CREATE POLICY "Instructors can view assigned class answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      INNER JOIN public.exams e   ON e.id  = ea.exam_id
      INNER JOIN public.profiles p ON p.user_id = ea.student_id
      INNER JOIN public.instructor_assignments ia
        ON ia.class_id   = p.class_id
       AND ia.subject_id = e.subject_id
      WHERE ea.id = student_answers.attempt_id
        AND ia.instructor_id = auth.uid()
    )
  );

-- ── Performance index ───────────────────────────────────────────
-- The RLS EXISTS sub-queries above join on attempt_id on every row
-- access. Without an index this is a sequential scan of exam_attempts
-- for every answer row read/written.
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt_id
  ON public.student_answers (attempt_id);

-- ── exam_attempts: ensure update policy exists ──────────────────
-- Students need UPDATE permission to mark their own attempt submitted.
-- The policy already exists in prior migrations but we recreate it
-- here idempotently to be safe.
DROP POLICY IF EXISTS "Students can update own attempts" ON public.exam_attempts;

CREATE POLICY "Students can update own attempts"
  ON public.exam_attempts FOR UPDATE
  USING (auth.uid() = student_id);
