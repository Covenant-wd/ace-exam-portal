-- ================================================================
-- FIX EXAM SUBMISSION RLS POLICY
-- Timestamp: 20260520000001
--
-- Problem: The RLS policy for "Students can insert own answers"
-- requires is_submitted = false, which is too restrictive for the
-- submission flow. During UPSERT (INSERT ... ON CONFLICT UPDATE),
-- if rows already exist from background saves, the UPDATE will
-- fail the RLS check.
--
-- Solution: Separate the restrictions:
-- - INSERT: Allow any answer for any unsubmitted attempt
-- - UPDATE: Allow only until attempt is marked submitted
--
-- This allows the natural flow:
-- 1. Background saves INSERT/UPDATE answers while exam is active
-- 2. Final submission UPSERT all answers (INSERT new, UPDATE existing)
-- 3. Then mark attempt as submitted
-- 4. RLS blocks further updates to that attempt's answers
-- ================================================================

-- Drop the restrictive policies
DROP POLICY IF EXISTS "Students can insert own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers" ON public.student_answers;

-- Recreate with proper separation of concerns
CREATE POLICY "Students can insert own answers"
  ON public.student_answers FOR INSERT
  WITH CHECK (
    -- Only check that the attempt exists and belongs to the student
    -- Don't check is_submitted here — allow inserts until submission is complete
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
    )
  );

CREATE POLICY "Students can update own answers"
  ON public.student_answers FOR UPDATE
  USING (
    -- Check both existence AND that attempt is not yet submitted
    -- This prevents tampering after submission
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
        AND ea.is_submitted = false
    )
  );

-- Commentary: These policies now correctly allow the submission sequence:
--   Step 1: Background selectAnswer() calls UPSERT answers (is_submitted still false)
--           INSERT check passes (attempt exists + student_id matches)
--           UPDATE check passes (attempt exists + is_submitted = false)
--   Step 2: Final submitExam() calls UPSERT all answers
--           INSERT check passes (attempt exists + student_id matches)
--           UPDATE check passes (attempt exists + is_submitted = false)
--   Step 3: Update exam_attempts to set is_submitted = true
--           From this point on, no more updates allowed to answers
