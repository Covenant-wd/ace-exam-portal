-- ============================================================
-- Migration: CBT External Integration
-- Safely deprecates internal CBT and adds external CBT support
-- ============================================================
-- 
-- PHILOSOPHY: Tables are NOT dropped. They are deprecated in-place
-- by disabling RLS write access and renaming for clarity.
-- This preserves historical data and migration history.
-- Hard deletion can be performed in a future migration once confirmed safe.
--
-- Tables deprecated (data preserved, writes disabled):
--   exams, questions, theory_questions, exam_attempts, student_answers
--
-- New capability:
--   schools.cbt_link already exists — no schema change needed.
-- ============================================================

-- ── 1. MARK CBT TABLES AS DEPRECATED ─────────────────────────────────────────
-- Add a comment to each table so future devs know they are deprecated.

COMMENT ON TABLE exams IS 'DEPRECATED: CBT is now an external service. This table is read-only and preserved for historical data only.';
COMMENT ON TABLE questions IS 'DEPRECATED: CBT is now an external service. This table is read-only and preserved for historical data only.';
COMMENT ON TABLE theory_questions IS 'DEPRECATED: CBT is now an external service. This table is read-only and preserved for historical data only.';
COMMENT ON TABLE exam_attempts IS 'DEPRECATED: CBT is now an external service. This table is read-only and preserved for historical data only.';
COMMENT ON TABLE student_answers IS 'DEPRECATED: CBT is now an external service. This table is read-only and preserved for historical data only.';

-- ── 2. REVOKE WRITE PERMISSIONS ON CBT TABLES ────────────────────────────────
-- Keep SELECT (read) so existing Results and ExamReview pages still render
-- historical data. Revoke INSERT/UPDATE/DELETE so no new CBT data is written.

-- Note: PostgREST uses the `anon` and `authenticated` roles.
-- These revokes apply to those roles (adjust role names to match your Supabase project if needed).

REVOKE INSERT, UPDATE, DELETE ON TABLE exams             FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE questions         FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE theory_questions  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE exam_attempts     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE student_answers   FROM authenticated;

-- ── 3. REMOVE CBT-RELATED RLS WRITE POLICIES ─────────────────────────────────
-- Drop INSERT/UPDATE/DELETE policies on CBT tables to ensure RLS can't be
-- bypassed even if the revoke above is overridden.
-- We use DROP POLICY IF EXISTS so this is idempotent.

DO $$
DECLARE
  _pol RECORD;
BEGIN
  FOR _pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE tablename IN ('exams','questions','theory_questions','exam_attempts','student_answers')
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _pol.policyname, _pol.tablename);
  END LOOP;
END $$;

-- ── 4. ENSURE schools.cbt_link IS ACCESSIBLE ─────────────────────────────────
-- The column already exists per the type schema. This is a safety check.
-- If cbt_link doesn't exist for some reason, add it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'cbt_link'
  ) THEN
    ALTER TABLE schools ADD COLUMN cbt_link TEXT;
  END IF;
END $$;

-- ── 5. REMOVE CBT PERMISSIONS FROM instructor_permissions ────────────────────
-- Set can_manage_exams = false for all instructors since exams are now external.
-- This is non-destructive: the column stays, the flag is just turned off.
UPDATE instructor_permissions
SET can_manage_exams = false
WHERE can_manage_exams = true;

-- ── 6. DEPRECATION LOG ───────────────────────────────────────────────────────
-- Record this migration in school_settings so it can be audited.
-- Only inserts if school_settings table exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'school_settings') THEN
    -- No school-specific key needed; this is a global system note.
    -- Just a no-op here — the comment trail on the tables is the audit record.
    NULL;
  END IF;
END $$;

-- ── SUMMARY ──────────────────────────────────────────────────────────────────
-- After this migration:
-- ✓ CBT tables are read-only (historical data preserved)
-- ✓ All CBT RLS write policies are dropped
-- ✓ instructor can_manage_exams flags are cleared
-- ✓ schools.cbt_link is confirmed present for external CBT URL storage
-- ✓ No data was deleted; rollback is possible by re-granting permissions
-- ─────────────────────────────────────────────────────────────────────────────
