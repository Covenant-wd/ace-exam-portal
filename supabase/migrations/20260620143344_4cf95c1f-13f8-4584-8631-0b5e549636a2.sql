-- ================================================================
-- RECONCILE LIVE DB WITH GITHUB MIGRATIONS
-- Re-runs 4 un-applied migrations + adds 3 objects only referenced
-- in code (implementation_requests table, upsert_school_setting and
-- check_impl_request_rate_limit RPCs, schools.cbt_link column, and
-- the missing instructor_permissions updated_at trigger).
-- All statements are idempotent.
-- ================================================================

-- ---------- A. schools.cbt_link ----------
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS cbt_link TEXT;

-- ============================================================
-- Re-running: 20260425000001_fix_subscription_enforcement.sql
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('active','grace','restricted','suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS subscription_plan   TEXT NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expiry_date         DATE,
  ADD COLUMN IF NOT EXISTS last_payment_date   DATE,
  ADD COLUMN IF NOT EXISTS monthly_fee         NUMERIC(10,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan              TEXT NOT NULL DEFAULT 'basic',
  status            public.subscription_status NOT NULL DEFAULT 'active',
  amount_paid       NUMERIC(10,2) DEFAULT 0,
  payment_reference TEXT,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date       DATE NOT NULL,
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_subscriptions_all" ON public.subscriptions;
CREATE POLICY "super_admin_subscriptions_all" ON public.subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'super_admin')
  );

CREATE OR REPLACE FUNCTION public.compute_subscription_status(p_expiry_date DATE)
RETURNS public.subscription_status
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today DATE := CURRENT_DATE;
BEGIN
  IF p_expiry_date IS NULL THEN RETURN 'active'; END IF;
  IF today <= p_expiry_date          THEN RETURN 'active';
  ELSIF today <= p_expiry_date + 7   THEN RETURN 'grace';
  ELSIF today <= p_expiry_date + 14  THEN RETURN 'restricted';
  ELSE                                    RETURN 'suspended';
  END IF;
END; $$;

DROP FUNCTION IF EXISTS public.update_school_subscription(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_school_subscription(UUID, TEXT, public.subscription_status, DATE, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.update_school_subscription(
  _school_id UUID, _plan TEXT, _status public.subscription_status,
  _expiry_date DATE, _last_payment_date DATE DEFAULT NULL, _notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_final_status public.subscription_status;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'super_admin') THEN
    RAISE EXCEPTION 'Access denied: super_admin role required';
  END IF;
  v_final_status := COALESCE(_status, public.compute_subscription_status(_expiry_date));
  UPDATE public.schools SET
    subscription_plan = _plan, subscription_status = v_final_status,
    expiry_date = _expiry_date, last_payment_date = COALESCE(_last_payment_date, last_payment_date)
  WHERE id = _school_id;
  INSERT INTO public.subscriptions (school_id, plan, status, expiry_date, notes, created_by)
  VALUES (_school_id, _plan, v_final_status, _expiry_date, _notes, auth.uid());
  RETURN jsonb_build_object('status', v_final_status, 'expiry_date', _expiry_date);
END; $$;

DROP FUNCTION IF EXISTS public.get_all_schools_with_subscription();
CREATE OR REPLACE FUNCTION public.get_all_schools_with_subscription()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, logo_url TEXT, subscription_plan TEXT,
  stored_status TEXT, computed_status TEXT, expiry_date DATE, last_payment_date DATE,
  days_until_expiry INTEGER, days_past_expiry INTEGER, student_count BIGINT, created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'super_admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT s.id, s.name, s.slug, s.logo_url, s.subscription_plan,
    s.subscription_status::TEXT, public.compute_subscription_status(s.expiry_date)::TEXT,
    s.expiry_date, s.last_payment_date,
    CASE WHEN s.expiry_date IS NOT NULL THEN (s.expiry_date - CURRENT_DATE)::INTEGER ELSE NULL END,
    CASE WHEN s.expiry_date IS NOT NULL AND s.expiry_date < CURRENT_DATE THEN (CURRENT_DATE - s.expiry_date)::INTEGER ELSE 0 END,
    (SELECT COUNT(*) FROM public.user_roles ur WHERE ur.school_id = s.id AND ur.role::text = 'student'),
    s.created_at
  FROM public.schools s ORDER BY s.name;
END; $$;

CREATE OR REPLACE FUNCTION public.refresh_subscription_statuses()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated INTEGER;
BEGIN
  UPDATE public.schools SET subscription_status = public.compute_subscription_status(expiry_date)
  WHERE expiry_date IS NOT NULL
    AND subscription_status = public.compute_subscription_status(expiry_date);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END; $$;

CREATE INDEX IF NOT EXISTS idx_schools_sub_status   ON public.schools(subscription_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school ON public.subscriptions(school_id, created_at DESC);

-- ============================================================
-- Re-running: 20260504000001_instructor_roles_split.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.instructor_subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, subject_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructor_subjects TO authenticated;
GRANT ALL ON public.instructor_subjects TO service_role;
ALTER TABLE public.instructor_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage instructor_subjects" ON public.instructor_subjects;
CREATE POLICY "Admins can manage instructor_subjects" ON public.instructor_subjects FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Instructors can read own subject assignments" ON public.instructor_subjects;
CREATE POLICY "Instructors can read own subject assignments" ON public.instructor_subjects FOR SELECT TO authenticated
  USING (instructor_id = auth.uid() OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND school_id = public.get_user_school_id(auth.uid())));

CREATE TABLE IF NOT EXISTS public.class_instructors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_instructors TO authenticated;
GRANT ALL ON public.class_instructors TO service_role;
ALTER TABLE public.class_instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage class_instructors" ON public.class_instructors;
CREATE POLICY "Admins can manage class_instructors" ON public.class_instructors FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Instructors can read own class assignments" ON public.class_instructors;
CREATE POLICY "Instructors can read own class assignments" ON public.class_instructors FOR SELECT TO authenticated
  USING (instructor_id = auth.uid() OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND school_id = public.get_user_school_id(auth.uid())));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'exams') THEN
    DROP POLICY IF EXISTS "Subject instructors can manage own subject exams" ON public.exams;
    CREATE POLICY "Subject instructors can manage own subject exams" ON public.exams FOR ALL TO authenticated
      USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
        AND EXISTS (SELECT 1 FROM public.instructor_subjects ins WHERE ins.instructor_id = auth.uid() AND ins.subject_id = exams.subject_id AND ins.school_id = exams.school_id))
      WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
        AND EXISTS (SELECT 1 FROM public.instructor_subjects ins WHERE ins.instructor_id = auth.uid() AND ins.subject_id = exams.subject_id AND ins.school_id = exams.school_id));
  END IF;
END $$;

DROP POLICY IF EXISTS "Subject instructors can manage own subject questions" ON public.questions;
CREATE POLICY "Subject instructors can manage own subject questions" ON public.questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.exams e JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = questions.exam_id AND ins.instructor_id = auth.uid() AND ins.school_id = public.get_user_school_id(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.exams e JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = questions.exam_id AND ins.instructor_id = auth.uid() AND ins.school_id = public.get_user_school_id(auth.uid())));

DROP POLICY IF EXISTS "Subject instructors can manage own subject grades" ON public.grades;
CREATE POLICY "Subject instructors can manage own subject grades" ON public.grades FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.instructor_subjects ins WHERE ins.instructor_id = auth.uid()
      AND ins.subject_id = grades.subject_id AND ins.class_id = grades.class_id AND ins.school_id = grades.school_id))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.instructor_subjects ins WHERE ins.instructor_id = auth.uid()
      AND ins.subject_id = grades.subject_id AND ins.class_id = grades.class_id AND ins.school_id = grades.school_id));

DROP POLICY IF EXISTS "Subject instructors can view own subject exam attempts" ON public.exam_attempts;
CREATE POLICY "Subject instructors can view own subject exam attempts" ON public.exam_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.exams e JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = exam_attempts.exam_id AND ins.instructor_id = auth.uid() AND ins.school_id = public.get_user_school_id(auth.uid())));

DROP POLICY IF EXISTS "Class instructors can manage attendance" ON public.attendance;
CREATE POLICY "Class instructors can manage attendance" ON public.attendance FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = attendance.class_id AND ci.school_id = attendance.school_id))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = attendance.class_id AND ci.school_id = attendance.school_id));

DROP POLICY IF EXISTS "Class instructors can post announcements" ON public.announcements;
CREATE POLICY "Class instructors can post announcements" ON public.announcements FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND ((target_class_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = announcements.target_class_id AND ci.school_id = announcements.school_id))
      OR (target_class_id IS NULL AND EXISTS (SELECT 1 FROM public.instructor_permissions ip WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true))))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND ((target_class_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = announcements.target_class_id AND ci.school_id = announcements.school_id))
      OR (target_class_id IS NULL AND EXISTS (SELECT 1 FROM public.instructor_permissions ip WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true))));

DROP POLICY IF EXISTS "Class instructors can view class student profiles" ON public.profiles;
CREATE POLICY "Class instructors can view class student profiles" ON public.profiles FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = profiles.class_id AND ci.school_id = profiles.school_id));

CREATE OR REPLACE FUNCTION public.is_subject_instructor(_instructor_id uuid, _subject_id uuid, _class_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.instructor_subjects ins
    WHERE ins.instructor_id = _instructor_id AND ins.subject_id = _subject_id
      AND (_class_id IS NULL OR ins.class_id = _class_id));
$$;

CREATE OR REPLACE FUNCTION public.is_class_instructor(_instructor_id uuid, _class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_instructors ci
    WHERE ci.instructor_id = _instructor_id AND ci.class_id = _class_id);
$$;

CREATE OR REPLACE FUNCTION public.get_instructor_subjects(_instructor_id uuid)
RETURNS TABLE (id uuid, subject_id uuid, subject_name text, class_id uuid, class_name text, school_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ins.id, ins.subject_id, s.name, ins.class_id, c.name, ins.school_id
  FROM public.instructor_subjects ins
  JOIN public.subjects s ON s.id = ins.subject_id
  JOIN public.classes  c ON c.id = ins.class_id
  WHERE ins.instructor_id = _instructor_id
    AND (auth.uid() = _instructor_id OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND ins.school_id = public.get_user_school_id(auth.uid())))
  ORDER BY c.name, s.name;
$$;

CREATE OR REPLACE FUNCTION public.get_instructor_classes(_instructor_id uuid)
RETURNS TABLE (id uuid, class_id uuid, class_name text, school_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ci.id, ci.class_id, c.name, ci.school_id
  FROM public.class_instructors ci
  JOIN public.classes c ON c.id = ci.class_id
  WHERE ci.instructor_id = _instructor_id
    AND (auth.uid() = _instructor_id OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND ci.school_id = public.get_user_school_id(auth.uid())))
  ORDER BY c.name;
$$;

-- ============================================================
-- Re-running: 20260518000003_report_card_system.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.report_card_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  times_school_opened SMALLINT NOT NULL DEFAULT 0,
  times_present SMALLINT NOT NULL DEFAULT 0,
  times_absent SMALLINT NOT NULL DEFAULT 0,
  times_punctual SMALLINT NOT NULL DEFAULT 0,
  class_position SMALLINT,
  total_students SMALLINT,
  class_teacher_comment TEXT NOT NULL DEFAULT '',
  principal_comment TEXT NOT NULL DEFAULT '',
  reopening_date DATE,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_card_metadata TO authenticated;
GRANT ALL ON public.report_card_metadata TO service_role;
ALTER TABLE public.report_card_metadata ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_report_card_metadata_updated_at ON public.report_card_metadata;
CREATE TRIGGER update_report_card_metadata_updated_at BEFORE UPDATE ON public.report_card_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.psychomotor_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  verbal_fluency SMALLINT CHECK (verbal_fluency BETWEEN 1 AND 6),
  handwriting SMALLINT CHECK (handwriting BETWEEN 1 AND 6),
  sports SMALLINT CHECK (sports BETWEEN 1 AND 6),
  games SMALLINT CHECK (games BETWEEN 1 AND 6),
  musical_skills SMALLINT CHECK (musical_skills BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.psychomotor_ratings TO authenticated;
GRANT ALL ON public.psychomotor_ratings TO service_role;
ALTER TABLE public.psychomotor_ratings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_psychomotor_ratings_updated_at ON public.psychomotor_ratings;
CREATE TRIGGER update_psychomotor_ratings_updated_at BEFORE UPDATE ON public.psychomotor_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.affective_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  punctuality SMALLINT CHECK (punctuality BETWEEN 1 AND 6),
  neatness SMALLINT CHECK (neatness BETWEEN 1 AND 6),
  politeness SMALLINT CHECK (politeness BETWEEN 1 AND 6),
  honesty SMALLINT CHECK (honesty BETWEEN 1 AND 6),
  cooperation SMALLINT CHECK (cooperation BETWEEN 1 AND 6),
  relationship SMALLINT CHECK (relationship BETWEEN 1 AND 6),
  leadership SMALLINT CHECK (leadership BETWEEN 1 AND 6),
  emotional_stability SMALLINT CHECK (emotional_stability BETWEEN 1 AND 6),
  health SMALLINT CHECK (health BETWEEN 1 AND 6),
  attitude_to_work SMALLINT CHECK (attitude_to_work BETWEEN 1 AND 6),
  attentiveness SMALLINT CHECK (attentiveness BETWEEN 1 AND 6),
  reliability SMALLINT CHECK (reliability BETWEEN 1 AND 6),
  initiative SMALLINT CHECK (initiative BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affective_ratings TO authenticated;
GRANT ALL ON public.affective_ratings TO service_role;
ALTER TABLE public.affective_ratings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_affective_ratings_updated_at ON public.affective_ratings;
CREATE TRIGGER update_affective_ratings_updated_at BEFORE UPDATE ON public.affective_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admins can manage report_card_metadata" ON public.report_card_metadata;
DROP POLICY IF EXISTS "Class instructors can manage report_card_metadata" ON public.report_card_metadata;
DROP POLICY IF EXISTS "Students can view own published report card" ON public.report_card_metadata;
DROP POLICY IF EXISTS "Parents can view children published report cards" ON public.report_card_metadata;
CREATE POLICY "Admins can manage report_card_metadata" ON public.report_card_metadata FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Class instructors can manage report_card_metadata" ON public.report_card_metadata FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND (
    EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = report_card_metadata.class_id)
    OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = report_card_metadata.class_id)))
  WITH CHECK (public.has_role(auth.uid(), 'instructor'::public.app_role) AND (
    EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = report_card_metadata.class_id)
    OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = report_card_metadata.class_id)));
CREATE POLICY "Students can view own published report card" ON public.report_card_metadata FOR SELECT TO authenticated
  USING (student_id = auth.uid() AND is_published = true);
CREATE POLICY "Parents can view children published report cards" ON public.report_card_metadata FOR SELECT TO authenticated
  USING (is_published = true AND EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id = auth.uid() AND ps.student_id = report_card_metadata.student_id));

DROP POLICY IF EXISTS "Admins can manage psychomotor_ratings" ON public.psychomotor_ratings;
DROP POLICY IF EXISTS "Class instructors can manage psychomotor_ratings" ON public.psychomotor_ratings;
DROP POLICY IF EXISTS "Students can view own psychomotor_ratings" ON public.psychomotor_ratings;
DROP POLICY IF EXISTS "Parents can view children psychomotor_ratings" ON public.psychomotor_ratings;
CREATE POLICY "Admins can manage psychomotor_ratings" ON public.psychomotor_ratings FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Class instructors can manage psychomotor_ratings" ON public.psychomotor_ratings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (SELECT 1 FROM public.report_card_metadata rcm
    WHERE rcm.student_id = psychomotor_ratings.student_id AND rcm.term_id = psychomotor_ratings.term_id
      AND (EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
        OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id))))
  WITH CHECK (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (SELECT 1 FROM public.report_card_metadata rcm
    WHERE rcm.student_id = psychomotor_ratings.student_id AND rcm.term_id = psychomotor_ratings.term_id
      AND (EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
        OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id))));
CREATE POLICY "Students can view own psychomotor_ratings" ON public.psychomotor_ratings FOR SELECT TO authenticated
  USING (student_id = auth.uid());
CREATE POLICY "Parents can view children psychomotor_ratings" ON public.psychomotor_ratings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id = auth.uid() AND ps.student_id = psychomotor_ratings.student_id));

DROP POLICY IF EXISTS "Admins can manage affective_ratings" ON public.affective_ratings;
DROP POLICY IF EXISTS "Class instructors can manage affective_ratings" ON public.affective_ratings;
DROP POLICY IF EXISTS "Students can view own affective_ratings" ON public.affective_ratings;
DROP POLICY IF EXISTS "Parents can view children affective_ratings" ON public.affective_ratings;
CREATE POLICY "Admins can manage affective_ratings" ON public.affective_ratings FOR ALL TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (school_id = public.get_user_school_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Class instructors can manage affective_ratings" ON public.affective_ratings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (SELECT 1 FROM public.report_card_metadata rcm
    WHERE rcm.student_id = affective_ratings.student_id AND rcm.term_id = affective_ratings.term_id
      AND (EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
        OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id))))
  WITH CHECK (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (SELECT 1 FROM public.report_card_metadata rcm
    WHERE rcm.student_id = affective_ratings.student_id AND rcm.term_id = affective_ratings.term_id
      AND (EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
        OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id))));
CREATE POLICY "Students can view own affective_ratings" ON public.affective_ratings FOR SELECT TO authenticated
  USING (student_id = auth.uid());
CREATE POLICY "Parents can view children affective_ratings" ON public.affective_ratings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id = auth.uid() AND ps.student_id = affective_ratings.student_id));

-- ============================================================
-- Re-running: 20260609000001_school_registration_system.sql
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schools' AND column_name='registration_status') THEN
    ALTER TABLE schools ADD COLUMN registration_status VARCHAR(20) DEFAULT 'active';
    ALTER TABLE schools ADD CONSTRAINT schools_registration_status_check
      CHECK (registration_status IN ('active','pending','rejected','suspended'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.school_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  school_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  website VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('pending','approved','rejected'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_registration_requests TO authenticated;
GRANT INSERT ON public.school_registration_requests TO anon;
GRANT ALL ON public.school_registration_requests TO service_role;
ALTER TABLE public.school_registration_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_school_reqs_status     ON public.school_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_school_reqs_email      ON public.school_registration_requests(email);
CREATE INDEX IF NOT EXISTS idx_school_reqs_created_at ON public.school_registration_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS public.school_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_admins TO authenticated;
GRANT ALL ON public.school_admins TO service_role;
ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_school_admins_school_id ON public.school_admins(school_id);
CREATE INDEX IF NOT EXISTS idx_school_admins_user_id   ON public.school_admins(user_id);

DROP TRIGGER IF EXISTS update_school_reqs_updated_at ON public.school_registration_requests;
CREATE TRIGGER update_school_reqs_updated_at BEFORE UPDATE ON public.school_registration_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Only super admin can view all requests" ON public.school_registration_requests;
DROP POLICY IF EXISTS "Schools can insert their registration" ON public.school_registration_requests;
DROP POLICY IF EXISTS "Schools can view their own request" ON public.school_registration_requests;
DROP POLICY IF EXISTS "Only super admin can update requests" ON public.school_registration_requests;
CREATE POLICY "Only super admin can view all requests" ON public.school_registration_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Schools can insert their registration" ON public.school_registration_requests FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Schools can view their own request" ON public.school_registration_requests FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "Only super admin can update requests" ON public.school_registration_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Admins can view their school admin record" ON public.school_admins;
DROP POLICY IF EXISTS "Super admin can view all admin mappings" ON public.school_admins;
DROP POLICY IF EXISTS "System can insert admin mappings" ON public.school_admins;
CREATE POLICY "Admins can view their school admin record" ON public.school_admins FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin') OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    AND EXISTS (SELECT 1 FROM public.school_admins sa WHERE sa.school_id = school_admins.school_id AND sa.user_id = auth.uid())));
CREATE POLICY "Super admin can view all admin mappings" ON public.school_admins FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "System can insert admin mappings" ON public.school_admins FOR INSERT
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.generate_school_slug(_school_name TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _slug TEXT;
BEGIN
  _slug := LOWER(TRIM(_school_name));
  _slug := REGEXP_REPLACE(_slug, '[^a-z0-9\-]', '', 'g');
  _slug := REGEXP_REPLACE(_slug, '-+', '-', 'g');
  _slug := TRIM(_slug, '-');
  IF LENGTH(_slug) = 0 THEN _slug := 'school-' || TO_CHAR(NOW(), 'YYMMDDHHmmss'); END IF;
  RETURN _slug;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_unique_slug(_base_slug TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _slug TEXT := _base_slug; _counter INT := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.schools WHERE slug = _slug) LOOP
    _slug := _base_slug || '-' || _counter;
    _counter := _counter + 1;
  END LOOP;
  RETURN _slug;
END; $$;

CREATE OR REPLACE FUNCTION public.approve_school_registration(_req_id UUID, _reviewed_by UUID)
RETURNS TABLE (school_id UUID, school_slug TEXT, admin_email TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req school_registration_requests%ROWTYPE; _new_school schools%ROWTYPE; _new_slug TEXT;
BEGIN
  SELECT * INTO _req FROM school_registration_requests WHERE id = _req_id;
  IF _req IS NULL THEN RAISE EXCEPTION 'Registration request not found'; END IF;
  IF _req.status != 'pending' THEN RAISE EXCEPTION 'Registration request is not pending (status: %)', _req.status; END IF;
  _new_slug := public.generate_unique_slug(public.generate_school_slug(_req.school_name));
  INSERT INTO schools (name, slug, registration_status) VALUES (_req.school_name, _new_slug, 'active') RETURNING * INTO _new_school;
  UPDATE school_registration_requests SET status = 'approved', reviewed_by = _reviewed_by, reviewed_at = NOW() WHERE id = _req_id;
  RETURN QUERY SELECT _new_school.id, _new_slug, _req.email, 'approved'::TEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_school_registration(_req_id UUID, _reviewed_by UUID, _rejection_reason TEXT)
RETURNS TABLE (school_id UUID, admin_email TEXT, status TEXT, rejection_reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req school_registration_requests%ROWTYPE;
BEGIN
  SELECT * INTO _req FROM school_registration_requests WHERE id = _req_id;
  IF _req IS NULL THEN RAISE EXCEPTION 'Registration request not found'; END IF;
  IF _req.status != 'pending' THEN RAISE EXCEPTION 'Registration request is not pending (status: %)', _req.status; END IF;
  UPDATE school_registration_requests SET status = 'rejected', rejection_reason = _rejection_reason, reviewed_by = _reviewed_by, reviewed_at = NOW() WHERE id = _req_id;
  RETURN QUERY SELECT NULL::UUID, _req.email, 'rejected'::TEXT, _rejection_reason;
END; $$;

-- ============================================================
-- B. implementation_requests (referenced in code, no migration)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.implementation_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name     TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  school_type     TEXT NOT NULL,
  student_count   TEXT NOT NULL,
  location        TEXT NOT NULL,
  services_needed TEXT[] NOT NULL DEFAULT '{}',
  message         TEXT,
  book_visit      BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New','Contacted','In Progress','Completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implementation_requests TO authenticated;
GRANT INSERT ON public.implementation_requests TO anon;
GRANT ALL ON public.implementation_requests TO service_role;
ALTER TABLE public.implementation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit implementation request" ON public.implementation_requests;
CREATE POLICY "Anyone can submit implementation request" ON public.implementation_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Super admins manage implementation requests" ON public.implementation_requests;
CREATE POLICY "Super admins manage implementation requests" ON public.implementation_requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS update_implementation_requests_updated_at ON public.implementation_requests;
CREATE TRIGGER update_implementation_requests_updated_at BEFORE UPDATE ON public.implementation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- C. check_impl_request_rate_limit RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_impl_request_rate_limit(p_email TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.implementation_requests
    WHERE lower(email) = lower(p_email) AND created_at > now() - INTERVAL '1 hour'
  );
$$;
GRANT EXECUTE ON FUNCTION public.check_impl_request_rate_limit(TEXT) TO anon, authenticated;

-- ============================================================
-- D. upsert_school_setting RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_school_setting(_school_id UUID, _key TEXT, _value TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role)
        AND public.get_user_school_id(auth.uid()) = _school_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  INSERT INTO public.school_settings (school_id, key, value)
  VALUES (_school_id, _key, _value)
  ON CONFLICT (school_id, key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_school_setting(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- E. Missing updated_at trigger on instructor_permissions
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='instructor_permissions' AND column_name='updated_at') THEN
    DROP TRIGGER IF EXISTS update_instructor_permissions_updated_at ON public.instructor_permissions;
    CREATE TRIGGER update_instructor_permissions_updated_at BEFORE UPDATE ON public.instructor_permissions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;