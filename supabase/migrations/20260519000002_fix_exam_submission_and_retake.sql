-- ================================================================
-- FIX EXAM SUBMISSION & RETAKE SYSTEM
-- Timestamp: 20260519000002
--
-- Problems this migration solves:
--
-- 1. DUPLICATE TIMESTAMP COLLISION
--    Both 20260518000001_add_violations_to_exam_attempts.sql and
--    20260518000001_report_card_system.sql share the same prefix.
--    Supabase runs migrations in filename order — two files with the
--    same prefix means only one may have run on the preview branch,
--    leaving violations column missing entirely.
--    This migration adds the column with IF NOT EXISTS so it is safe
--    whether the earlier file ran or not.
--
-- 2. MISSING violations COLUMN → SILENT SUBMISSION FAILURE
--    TakeExam.tsx was omitting violations from the update payload
--    (with a comment "add back after migration"). The column now
--    exists here. TakeExam.tsx is updated to include it.
--
-- 3. MISSING reset_exam_attempt RPC → RETAKE ALWAYS FAILS
--    TakeExam.tsx calls supabase.rpc("reset_exam_attempt", ...)
--    on retake, but this function was never created in any migration.
--    Every retake silently failed with "function not found", leaving
--    students stuck on the exam start screen.
--
-- All statements are fully idempotent.
-- ================================================================

-- ── 1. violations column ────────────────────────────────────────
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS violations INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.exam_attempts
    ADD CONSTRAINT check_violations_non_negative CHECK (violations >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_violations
  ON public.exam_attempts (violations)
  WHERE violations > 0;

-- ── 2. reset_exam_attempt RPC ────────────────────────────────────
-- Deletes the student's existing attempt (and its orphaned answers
-- via ON DELETE CASCADE), inserts a fresh unsubmitted attempt, and
-- returns the new attempt's UUID.
--
-- Called by TakeExam.tsx when allow_retake=true and the student
-- has a submitted attempt. The caller navigates them straight into
-- the new attempt without reloading the page.
--
-- Security: SECURITY DEFINER so the student can delete their own
-- completed attempt (which the normal UPDATE policy cannot do).
-- The function validates student_id = auth.uid() explicitly before
-- touching any data, so it cannot be used to delete another student's
-- attempt.
CREATE OR REPLACE FUNCTION public.reset_exam_attempt(
  _exam_id   UUID,
  _student_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_attempt_id UUID;
BEGIN
  -- Only the student themselves can reset their own attempt
  IF auth.uid() <> _student_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot reset another student''s attempt';
  END IF;

  -- Delete the existing attempt (student_answers deleted via CASCADE)
  DELETE FROM public.exam_attempts
  WHERE exam_id = _exam_id
    AND student_id = _student_id;

  -- Insert a fresh attempt
  INSERT INTO public.exam_attempts (exam_id, student_id)
  VALUES (_exam_id, _student_id)
  RETURNING id INTO _new_attempt_id;

  RETURN _new_attempt_id;
END;
$$;

-- Grant execute to authenticated students
REVOKE ALL ON FUNCTION public.reset_exam_attempt(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_exam_attempt(UUID, UUID) TO authenticated;

-- ── 3. student_answers RLS (idempotent reset) ────────────────────
-- Ensures students can insert/update answers on non-submitted attempts.
-- The is_submitted = false guard is the key: it enforces that answers
-- must be written BEFORE the attempt is closed (submit step 2).

DROP POLICY IF EXISTS "Students can view own answers"               ON public.student_answers;
DROP POLICY IF EXISTS "Students can insert own answers"             ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers"             ON public.student_answers;
DROP POLICY IF EXISTS "Admins can view all answers"                 ON public.student_answers;
DROP POLICY IF EXISTS "Instructors can view assigned class answers" ON public.student_answers;

CREATE POLICY "Students can view own answers"
  ON public.student_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
    )
  );

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

CREATE POLICY "Admins can view all answers"
  ON public.student_answers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Instructors can view assigned class answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      INNER JOIN public.exams e    ON e.id      = ea.exam_id
      INNER JOIN public.profiles p ON p.user_id = ea.student_id
      INNER JOIN public.instructor_subjects ins
             ON ins.subject_id = e.subject_id
            AND ins.class_id   = p.class_id
      WHERE ea.id              = student_answers.attempt_id
        AND ins.instructor_id  = auth.uid()
    )
  );

-- ── 4. exam_attempts update policy ──────────────────────────────
DROP POLICY IF EXISTS "Students can update own attempts" ON public.exam_attempts;

CREATE POLICY "Students can update own attempts"
  ON public.exam_attempts FOR UPDATE
  USING (auth.uid() = student_id);

-- ── 5. Performance index ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt_id
  ON public.student_answers (attempt_id);
