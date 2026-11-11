-- ================================================================
-- MIGRATION: Add violations column to exam_attempts
-- Tracks the number of anti-cheat violations recorded during an exam.
-- This column is referenced in TakeExam.tsx for audit logging.
-- ================================================================

-- Add violations column to exam_attempts table
-- Default to 0 for existing attempts; new attempts start with 0.
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS violations INTEGER NOT NULL DEFAULT 0;

-- Create index on violations for efficient querying of flagged attempts
CREATE INDEX IF NOT EXISTS idx_exam_attempts_violations
  ON public.exam_attempts(violations)
  WHERE violations > 0;

-- Backfill any NULL values to 0 (defensive; should not exist due to DEFAULT)
UPDATE public.exam_attempts
SET violations = 0
WHERE violations IS NULL;

-- Optional: Add CHECK constraint to ensure violations is non-negative
ALTER TABLE public.exam_attempts
  ADD CONSTRAINT check_violations_non_negative
    CHECK (violations >= 0);
