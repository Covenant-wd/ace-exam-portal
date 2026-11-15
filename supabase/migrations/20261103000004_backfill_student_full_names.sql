-- supabase/migrations/20261103000004_backfill_student_full_names.sql
-- ================================================================
-- Students created with a middle name had it saved in middle_name
-- but left out of full_name (the name shown across the app).
-- Rebuild full_name as "first middle last" for those students only.
-- Idempotent: rows that already contain the middle name are skipped.
-- ================================================================
UPDATE public.profiles p
SET full_name = btrim(
      btrim(p.first_name) || ' ' || btrim(p.middle_name) || ' ' || btrim(COALESCE(p.last_name, ''))
    )
WHERE COALESCE(btrim(p.middle_name), '') <> ''
  AND COALESCE(btrim(p.first_name), '')  <> ''
  AND position(lower(btrim(p.middle_name)) in lower(COALESCE(p.full_name, ''))) = 0
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id AND ur.role = 'student'::public.app_role
  );
