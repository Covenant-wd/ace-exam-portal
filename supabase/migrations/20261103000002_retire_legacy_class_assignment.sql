-- supabase/migrations/20261103000002_retire_legacy_class_assignment.sql
-- ================================================================
-- RETIRE THE LEGACY CLASS ASSIGNMENT SYSTEM
--
-- class_instructors is now the single source of truth for who is
-- assigned to which class, and the old "Legacy Class Assign" UI is
-- gone. The old table instructor_classes is NOT dropped: many RLS
-- policies (attendance, grades, report cards, ...) still read it,
-- and dropping it would silently remove instructors' access.
-- Instead it becomes a mirror of class_instructors, kept in sync by
-- triggers, so those policies keep working and nobody can be left
-- with stale access after an admin removes them from a class.
--
-- Fully idempotent.
-- ================================================================

-- 1. Carry every old-style assignment over to the new table so no
--    instructor loses a class in the new UI.
INSERT INTO public.class_instructors (instructor_id, class_id, school_id)
SELECT ic.instructor_id, ic.class_id, c.school_id
FROM public.instructor_classes ic
JOIN public.classes c ON c.id = ic.class_id
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ic.instructor_id)
ON CONFLICT (instructor_id, class_id) DO NOTHING;

-- 2. Make sure the mirror holds every new-style assignment too.
INSERT INTO public.instructor_classes (instructor_id, class_id, school_id)
SELECT ci.instructor_id, ci.class_id, ci.school_id
FROM public.class_instructors ci
ON CONFLICT (instructor_id, class_id) DO NOTHING;

-- 3. Keep the mirror in sync from now on.
CREATE OR REPLACE FUNCTION public.mirror_class_instructors_to_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.instructor_classes (instructor_id, class_id, school_id)
    VALUES (NEW.instructor_id, NEW.class_id, NEW.school_id)
    ON CONFLICT (instructor_id, class_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.instructor_classes
    WHERE instructor_id = OLD.instructor_id AND class_id = OLD.class_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_class_instructors_to_legacy ON public.class_instructors;
CREATE TRIGGER trg_mirror_class_instructors_to_legacy
  AFTER INSERT OR DELETE ON public.class_instructors
  FOR EACH ROW EXECUTE FUNCTION public.mirror_class_instructors_to_legacy();
