-- ================================================================
-- MIGRATION: Add violations column to exam_attempts
-- ================================================================
-- REASON: submitExam() in TakeExam.tsx attempts to record violations
-- when updating exam_attempts, but the column did not exist.
-- This caused PostgreSQL error 42703, failing submissions silently.
--
-- CHANGES:
--   1. Add violations INT column (default 0, not null)
--   2. Backfill existing rows with 0 (no prior violations tracked)
-- ================================================================

ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS violations INTEGER NOT NULL DEFAULT 0;

-- Add a comment to clarify the purpose
COMMENT ON COLUMN public.exam_attempts.violations IS 'Number of anti-cheat violations recorded during this exam attempt';

-- ================================================================
-- OPTIONAL: Add an index for queries filtering by violations
-- (useful if you want to later query "attempts with >N violations")
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_exam_attempts_violations
ON public.exam_attempts(violations);
