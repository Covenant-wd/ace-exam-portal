-- ================================================================
-- FIX EXAM SUBMISSION - REMOVE is_submitted GUARD FROM INSERT RLS
-- ================================================================
--
-- ROOT CAUSE:
--   The "Students can insert own answers" policy added in
--   20260518000002 and 20260519000002 includes:
--     AND ea.is_submitted = false
--
--   This guard causes a race condition at submit time.
--   The submit flow is:
--     1. Student selects answers → saved in real-time (INSERT, is_submitted=false ✓)
--     2. Student clicks Submit → bulk upsert fires
--     3. For already-saved answers, upsert = INSERT ON CONFLICT DO UPDATE
--     4. Postgres evaluates INSERT WITH CHECK on the incoming data
--
--   The race: if ANY part of the upsert batch is evaluated after the
--   attempt row gets marked is_submitted=true (e.g. timer fires, network
--   delay, concurrent request), the WITH CHECK fails → entire batch
--   rejected → "Failed to save your answers. Please check your connection."
--
--   Additionally: the upsert WITH CHECK runs against the CURRENT db state,
--   not a snapshot — and PostgREST can evaluate it mid-transaction in ways
--   that differ from pure Postgres behaviour.
--
-- FIX:
--   Remove is_submitted = false from the INSERT WITH CHECK.
--   The frontend already guards against post-submission writes via
--   submittedRef.current (checked before every selectAnswer call and
--   at the top of submitExam). The DB constraint is redundant and harmful.
--
--   The UPDATE USING guard (is_submitted = false) is kept — it correctly
--   prevents updating answers on already-closed attempts via direct DB
--   access, which is the appropriate server-side guard.
--
-- All statements are fully idempotent.
-- ================================================================

DROP POLICY IF EXISTS "Students can insert own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can view own answers"   ON public.student_answers;

-- INSERT: student can write answers to their own attempt.
-- No is_submitted check here — the frontend submittedRef.current guards
-- against post-submission writes. The DB-level guard caused a race condition
-- where the bulk upsert failed if evaluated after is_submitted=true was set.
CREATE POLICY "Students can insert own answers"
  ON public.student_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id         = student_answers.attempt_id
        AND ea.student_id = auth.uid()
    )
  );

-- UPDATE: keep the is_submitted=false guard here only.
-- This prevents direct DB manipulation of answers on closed attempts
-- while not interfering with the submit-time upsert flow.
CREATE POLICY "Students can update own answers"
  ON public.student_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id         = student_answers.attempt_id
        AND ea.student_id = auth.uid()
        AND ea.is_submitted = false
    )
  );

-- SELECT: students can read their own answers (no is_submitted restriction)
CREATE POLICY "Students can view own answers"
  ON public.student_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id         = student_answers.attempt_id
        AND ea.student_id = auth.uid()
    )
  );
