-- ================================================================
-- FIX EXAM SUBMISSION PERFORMANCE - Statement Timeout Fix
-- Timestamp: 20260520000002
--
-- Problem: student_answers UPSERT times out with error 57014
-- "canceling statement due to statement timeout"
--
-- Root Cause: RLS policy performs slow subquery on EVERY row insert
-- When upserting 30 answers, the EXISTS subquery runs 30 times
--
-- Solution: Create indexes to speed up the RLS policy checks
-- ================================================================

-- ── CRITICAL INDEX: Speed up RLS policy lookups ──────────────
-- The RLS policy checks exam_attempts for every answer insert
-- This index makes that lookup instant instead of a table scan
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_submission
  ON public.exam_attempts (id, student_id, is_submitted);

-- ── EXISTING INDEX: Verify it exists ─────────────────────────
-- This should already exist from previous migration
-- but we'll ensure it's here
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt_id
  ON public.student_answers (attempt_id);

-- ── COMPOSITE INDEX: Speed up RLS UPDATE checks ─────────────
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt_question
  ON public.student_answers (attempt_id, question_id);

-- ── PERFORMANCE TUNING: Increase statement timeout ──────────
-- Default timeout is too low for batch operations
-- Increase from 8s to 30s for student_answers operations
ALTER TABLE public.student_answers 
  SET (statement_timeout = 30000); -- 30 seconds in milliseconds

-- ── ANALYZE: Update table statistics ────────────────────────
-- This helps Postgres choose the best query plan
ANALYZE public.student_answers;
ANALYZE public.exam_attempts;

-- ================================================================
-- VERIFICATION QUERIES (run these to confirm the fix)
-- ================================================================
-- Check indexes exist:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'student_answers';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'exam_attempts';

-- Expected indexes on student_answers:
-- - student_answers_pkey
-- - idx_student_answers_attempt_id
-- - idx_student_answers_attempt_question

-- Expected indexes on exam_attempts:
-- - exam_attempts_pkey  
-- - idx_exam_attempts_student_submission (NEW - this fixes the timeout)
-- ================================================================
