-- ================================================================
-- MIGRATION: Fix all idempotency issues across previous migrations
-- 
-- This single migration makes the entire chain safe to replay on
-- a fresh Supabase Preview database by:
--   1. Guarding all CREATE TABLE statements with IF NOT EXISTS
--   2. Dropping then recreating all policies (no IF NOT EXISTS for policies)
--   3. Guarding all CREATE TRIGGER statements with DROP IF EXISTS first
--   4. Making all seed INSERTs safe with ON CONFLICT DO NOTHING
--   5. Making storage bucket inserts safe with ON CONFLICT DO NOTHING
--
-- All statements are fully idempotent — safe to run multiple times.
-- ================================================================


-- ================================================================
-- SECTION 1: TABLE CREATION GUARDS
-- Any CREATE TABLE that lacked IF NOT EXISTS
-- ================================================================

-- sessions (20260223152200)
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- terms (20260223152200)
CREATE TABLE IF NOT EXISTS public.terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE
);
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

-- classes (20260223152200)
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- class_subjects (20260223152200)
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  UNIQUE(class_id, subject_id)
);
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

-- instructor_classes (20260306122327)
CREATE TABLE IF NOT EXISTS public.instructor_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  UNIQUE(instructor_id, class_id)
);
ALTER TABLE public.instructor_classes ENABLE ROW LEVEL SECURITY;

-- instructor_permissions (20260306122327)
CREATE TABLE IF NOT EXISTS public.instructor_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL,
  can_manage_exams boolean NOT NULL DEFAULT false,
  can_view_results boolean NOT NULL DEFAULT false,
  can_manage_students boolean NOT NULL DEFAULT false,
  can_manage_subjects boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  can_mark_attendance boolean NOT NULL DEFAULT false,
  can_manage_grades boolean NOT NULL DEFAULT false,
  can_manage_timetable boolean NOT NULL DEFAULT false,
  can_manage_fees boolean NOT NULL DEFAULT false,
  can_post_announcements boolean NOT NULL DEFAULT false
);
ALTER TABLE public.instructor_permissions ENABLE ROW LEVEL SECURITY;

-- schools (20260311133417)
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- attendance (20260312095957)
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status attendance_status NOT NULL DEFAULT 'present',
  marked_by UUID NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, date, class_id)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- timetable_periods (20260312095957)
CREATE TABLE IF NOT EXISTS public.timetable_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  period_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;

-- timetable_entries (20260312095957)
CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  instructor_id UUID,
  period_id UUID REFERENCES public.timetable_periods(id) ON DELETE CASCADE NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_id, period_id, day_of_week)
);
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

-- grade_categories (20260312095957)
CREATE TABLE IF NOT EXISTS public.grade_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 100,
  term_id UUID REFERENCES public.terms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.grade_categories ENABLE ROW LEVEL SECURITY;

-- grades (20260312095957)
CREATE TABLE IF NOT EXISTS public.grades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  term_id UUID REFERENCES public.terms(id) ON DELETE CASCADE NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.grade_categories(id) ON DELETE CASCADE NOT NULL,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  remarks TEXT DEFAULT '',
  graded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, subject_id, term_id, category_id)
);
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- fee_types (20260312095957)
CREATE TABLE IF NOT EXISTS public.fee_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  term_id UUID REFERENCES public.terms(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_types ENABLE ROW LEVEL SECURITY;

-- fee_payments (20260312095957)
CREATE TABLE IF NOT EXISTS public.fee_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  fee_type_id UUID REFERENCES public.fee_types(id) ON DELETE CASCADE NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  receipt_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;

-- announcements (20260312095957)
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  target_role TEXT DEFAULT 'all',
  target_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- school_referrals (20260401082550)
CREATE TABLE IF NOT EXISTS public.school_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  commission_amount numeric NOT NULL DEFAULT 0,
  commission_paid boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.school_referrals ENABLE ROW LEVEL SECURITY;

-- theory_questions (20260408194423)
CREATE TABLE IF NOT EXISTS public.theory_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number text NOT NULL,
  sub_label text DEFAULT '',
  question_text text NOT NULL,
  marks integer NOT NULL DEFAULT 1,
  question_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.theory_questions ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- SECTION 2: TRIGGER GUARDS
-- All triggers need DROP IF EXISTS before CREATE TRIGGER
-- ================================================================

DROP TRIGGER IF EXISTS update_school_settings_updated_at ON public.school_settings;
CREATE TRIGGER update_school_settings_updated_at
  BEFORE UPDATE ON public.school_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_instructor_permissions_updated_at ON public.instructor_permissions;
CREATE TRIGGER update_instructor_permissions_updated_at
  BEFORE UPDATE ON public.instructor_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ================================================================
-- SECTION 3: STORAGE BUCKET SEEDS (with ON CONFLICT)
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logo', 'school-logo', true)
ON CONFLICT (id) DO NOTHING;


-- ================================================================
-- SECTION 4: DATA SEEDS (with ON CONFLICT)
-- ================================================================

INSERT INTO public.school_settings (key, value)
VALUES ('school_name', 'CBT Portal')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.school_settings (key, value)
VALUES ('school_logo_url', '')
ON CONFLICT (key) DO NOTHING;


-- ================================================================
-- SECTION 5: ALL POLICIES — full drop-then-recreate
-- Every single policy across every table, in dependency order.
-- Policies that appear in multiple migrations are unified here
-- to their final correct definition.
-- ================================================================

-- ── profiles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile"              ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"            ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles"          ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"            ON public.profiles;
DROP POLICY IF EXISTS "System inserts profiles"                 ON public.profiles;
DROP POLICY IF EXISTS "Instructors can read profiles for their classes" ON public.profiles;
DROP POLICY IF EXISTS "Class instructors can view class student profiles" ON public.profiles;
DROP POLICY IF EXISTS "School members can view profiles in same school" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Instructors can read profiles for their classes"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND (ip.can_manage_grades = true OR ip.can_mark_attendance = true)
        AND ic.class_id = profiles.class_id
    )
  );
CREATE POLICY "Class instructors can view class student profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.class_instructors ci
      WHERE ci.instructor_id = auth.uid()
        AND ci.class_id = profiles.class_id
        AND ci.school_id = profiles.school_id
    )
  );

-- ── user_roles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own role"          ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own role"        ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles"        ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles"          ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage school roles"   ON public.user_roles;
DROP POLICY IF EXISTS "System inserts roles"             ON public.user_roles;
DROP POLICY IF EXISTS "Instructors can read school roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admin can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own role"
  ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage school roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  );
CREATE POLICY "Instructors can read school roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  );
CREATE POLICY "Super admin can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ── subjects ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone authenticated can view subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can manage subjects"            ON public.subjects;

CREATE POLICY "Anyone authenticated can view subjects"
  ON public.subjects FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage subjects"
  ON public.subjects FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── exams ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view published exams"            ON public.exams;
DROP POLICY IF EXISTS "Admins can view all exams"                    ON public.exams;
DROP POLICY IF EXISTS "Admins can manage exams"                      ON public.exams;
DROP POLICY IF EXISTS "Subject instructors can manage own subject exams" ON public.exams;

CREATE POLICY "Students can view published exams"
  ON public.exams FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can manage exams"
  ON public.exams FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Subject instructors can manage own subject exams"
  ON public.exams FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = exams.subject_id
        AND ins.school_id = exams.school_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = exams.subject_id
        AND ins.school_id = exams.school_id
    )
  );

-- ── questions ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view questions of published exams"         ON public.questions;
DROP POLICY IF EXISTS "Admins can manage questions"                            ON public.questions;
DROP POLICY IF EXISTS "Subject instructors can manage own subject questions"   ON public.questions;

CREATE POLICY "Students can view questions of published exams"
  ON public.questions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.exams WHERE exams.id = questions.exam_id AND exams.is_published = true)
  );
CREATE POLICY "Admins can manage questions"
  ON public.questions FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Subject instructors can manage own subject questions"
  ON public.questions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = questions.exam_id
        AND ins.instructor_id = auth.uid()
        AND ins.school_id = public.get_user_school_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = questions.exam_id
        AND ins.instructor_id = auth.uid()
        AND ins.school_id = public.get_user_school_id(auth.uid())
    )
  );

-- ── exam_attempts ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view own attempts"                  ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can insert own attempts"                ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can update own attempts"                ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins can view all attempts"                    ON public.exam_attempts;
DROP POLICY IF EXISTS "Instructors can view assigned class attempts"    ON public.exam_attempts;
DROP POLICY IF EXISTS "Subject instructors can view own subject exam attempts" ON public.exam_attempts;

CREATE POLICY "Students can view own attempts"
  ON public.exam_attempts FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Students can insert own attempts"
  ON public.exam_attempts FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can update own attempts"
  ON public.exam_attempts FOR UPDATE USING (auth.uid() = student_id);
CREATE POLICY "Admins can view all attempts"
  ON public.exam_attempts FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Instructors can view assigned class attempts"
  ON public.exam_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      JOIN public.profiles p ON p.class_id = ic.class_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_view_results = true
        AND p.user_id = exam_attempts.student_id
    )
  );
CREATE POLICY "Subject instructors can view own subject exam attempts"
  ON public.exam_attempts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.instructor_subjects ins ON ins.subject_id = e.subject_id
      WHERE e.id = exam_attempts.exam_id
        AND ins.instructor_id = auth.uid()
        AND ins.school_id = public.get_user_school_id(auth.uid())
    )
  );

-- ── student_answers ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view own answers"                ON public.student_answers;
DROP POLICY IF EXISTS "Students can insert own answers"              ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers"              ON public.student_answers;
DROP POLICY IF EXISTS "Admins can view all answers"                  ON public.student_answers;
DROP POLICY IF EXISTS "Instructors can view assigned class answers"  ON public.student_answers;

CREATE POLICY "Students can view own answers"
  ON public.student_answers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid())
  );
CREATE POLICY "Students can insert own answers"
  ON public.student_answers FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid())
  );
CREATE POLICY "Students can update own answers"
  ON public.student_answers FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid())
  );
CREATE POLICY "Admins can view all answers"
  ON public.student_answers FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Instructors can view assigned class answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      JOIN public.profiles p ON p.user_id = ea.student_id
      JOIN public.instructor_classes ic ON ic.class_id = p.class_id
      JOIN public.instructor_permissions ip ON ip.instructor_id = ic.instructor_id
      WHERE ea.id = student_answers.attempt_id
        AND ip.instructor_id = auth.uid()
        AND ip.can_view_results = true
    )
  );

-- ── school_settings ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read settings"       ON public.school_settings;
DROP POLICY IF EXISTS "Admins can manage settings"                  ON public.school_settings;
DROP POLICY IF EXISTS "Super admins can manage school_settings"     ON public.school_settings;
DROP POLICY IF EXISTS "Anyone can read public school settings"      ON public.school_settings;

CREATE POLICY "Authenticated users can read settings"
  ON public.school_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage settings"
  ON public.school_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Super admins can manage school_settings"
  ON public.school_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Anyone can read public school settings"
  ON public.school_settings FOR SELECT TO anon, authenticated
  USING (key IN ('school_logo_url', 'school_name'));

-- ── sessions ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage sessions"      ON public.sessions;
DROP POLICY IF EXISTS "Authenticated can read sessions" ON public.sessions;

CREATE POLICY "Admins can manage sessions"
  ON public.sessions FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read sessions"
  ON public.sessions FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── terms ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage terms"      ON public.terms;
DROP POLICY IF EXISTS "Authenticated can read terms" ON public.terms;

CREATE POLICY "Admins can manage terms"
  ON public.terms FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read terms"
  ON public.terms FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── classes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage classes"      ON public.classes;
DROP POLICY IF EXISTS "Authenticated can read classes" ON public.classes;

CREATE POLICY "Admins can manage classes"
  ON public.classes FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read classes"
  ON public.classes FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── class_subjects ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage class_subjects"      ON public.class_subjects;
DROP POLICY IF EXISTS "Authenticated can read class_subjects" ON public.class_subjects;

CREATE POLICY "Admins can manage class_subjects"
  ON public.class_subjects FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read class_subjects"
  ON public.class_subjects FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── schools ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view schools"          ON public.schools;
DROP POLICY IF EXISTS "Super admins can manage schools"  ON public.schools;

CREATE POLICY "Anyone can view schools"
  ON public.schools FOR SELECT USING (true);
CREATE POLICY "Super admins can manage schools"
  ON public.schools FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ── attendance ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage attendance"                         ON public.attendance;
DROP POLICY IF EXISTS "Instructors can manage attendance for their classes"  ON public.attendance;
DROP POLICY IF EXISTS "Instructors can manage attendance for own school classes" ON public.attendance;
DROP POLICY IF EXISTS "Students can view own attendance"                     ON public.attendance;
DROP POLICY IF EXISTS "Class instructors can manage attendance"              ON public.attendance;

CREATE POLICY "Admins can manage attendance"
  ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Students can view own attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (student_id = auth.uid());
CREATE POLICY "Instructors can manage attendance for own school classes"
  ON public.attendance FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_mark_attendance = true
        AND ic.class_id = attendance.class_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_mark_attendance = true
        AND ic.class_id = attendance.class_id
    )
  );
CREATE POLICY "Class instructors can manage attendance"
  ON public.attendance FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.class_instructors ci
      WHERE ci.instructor_id = auth.uid()
        AND ci.class_id = attendance.class_id
        AND ci.school_id = attendance.school_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.class_instructors ci
      WHERE ci.instructor_id = auth.uid()
        AND ci.class_id = attendance.class_id
        AND ci.school_id = attendance.school_id
    )
  );

-- ── timetable_periods ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage periods"                    ON public.timetable_periods;
DROP POLICY IF EXISTS "Authenticated can read periods"               ON public.timetable_periods;
DROP POLICY IF EXISTS "Instructors can read school timetable periods" ON public.timetable_periods;

CREATE POLICY "Admins can manage periods"
  ON public.timetable_periods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read periods"
  ON public.timetable_periods FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ── timetable_entries ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage timetable"                   ON public.timetable_entries;
DROP POLICY IF EXISTS "Authenticated can read timetable"              ON public.timetable_entries;
DROP POLICY IF EXISTS "Instructors can read school timetable entries" ON public.timetable_entries;

CREATE POLICY "Admins can manage timetable"
  ON public.timetable_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read timetable"
  ON public.timetable_entries FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ── grade_categories ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage grade_categories"          ON public.grade_categories;
DROP POLICY IF EXISTS "Authenticated can read grade_categories"     ON public.grade_categories;
DROP POLICY IF EXISTS "Instructors can read school grade categories" ON public.grade_categories;

CREATE POLICY "Admins can manage grade_categories"
  ON public.grade_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read grade_categories"
  ON public.grade_categories FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Instructors can read school grade categories"
  ON public.grade_categories FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_manage_grades = true
    )
  );

-- ── grades ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage grades"                         ON public.grades;
DROP POLICY IF EXISTS "Instructors can manage grades for their classes"  ON public.grades;
DROP POLICY IF EXISTS "Instructors can manage grades for own school classes" ON public.grades;
DROP POLICY IF EXISTS "Students can view own grades"                     ON public.grades;
DROP POLICY IF EXISTS "Subject instructors can manage own subject grades" ON public.grades;

CREATE POLICY "Admins can manage grades"
  ON public.grades FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Students can view own grades"
  ON public.grades FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Instructors can manage grades for own school classes"
  ON public.grades FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_grades = true
        AND ic.class_id = grades.class_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_grades = true
        AND ic.class_id = grades.class_id
    )
  );
CREATE POLICY "Subject instructors can manage own subject grades"
  ON public.grades FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = grades.subject_id
        AND ins.class_id = grades.class_id
        AND ins.school_id = grades.school_id
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = auth.uid()
        AND ins.subject_id = grades.subject_id
        AND ins.class_id = grades.class_id
        AND ins.school_id = grades.school_id
    )
  );

-- ── fee_types ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage fee_types"           ON public.fee_types;
DROP POLICY IF EXISTS "Authenticated can read fee_types"      ON public.fee_types;
DROP POLICY IF EXISTS "Instructors can read school fee types" ON public.fee_types;

CREATE POLICY "Admins can manage fee_types"
  ON public.fee_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read fee_types"
  ON public.fee_types FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Instructors can read school fee types"
  ON public.fee_types FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_manage_fees = true
    )
  );

-- ── fee_payments ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage fee_payments"             ON public.fee_payments;
DROP POLICY IF EXISTS "Students can view own payments"             ON public.fee_payments;
DROP POLICY IF EXISTS "Instructors can manage school fee payments" ON public.fee_payments;

CREATE POLICY "Admins can manage fee_payments"
  ON public.fee_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Students can view own payments"
  ON public.fee_payments FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Instructors can manage school fee payments"
  ON public.fee_payments FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_manage_fees = true
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_manage_fees = true
    )
  );

-- ── announcements ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage announcements"             ON public.announcements;
DROP POLICY IF EXISTS "Authenticated can read active announcements" ON public.announcements;
DROP POLICY IF EXISTS "Instructors can manage school announcements" ON public.announcements;
DROP POLICY IF EXISTS "Class instructors can post announcements"    ON public.announcements;

CREATE POLICY "Admins can manage announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can read active announcements"
  ON public.announcements FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Instructors can manage school announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true
    )
  );
CREATE POLICY "Class instructors can post announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND (
      (target_class_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.class_instructors ci
        WHERE ci.instructor_id = auth.uid()
          AND ci.class_id = announcements.target_class_id
          AND ci.school_id = announcements.school_id
      ))
      OR (target_class_id IS NULL AND EXISTS (
        SELECT 1 FROM public.instructor_permissions ip
        WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true
      ))
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND (
      (target_class_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.class_instructors ci
        WHERE ci.instructor_id = auth.uid()
          AND ci.class_id = announcements.target_class_id
          AND ci.school_id = announcements.school_id
      ))
      OR (target_class_id IS NULL AND EXISTS (
        SELECT 1 FROM public.instructor_permissions ip
        WHERE ip.instructor_id = auth.uid() AND ip.can_post_announcements = true
      ))
    )
  );

-- ── instructor_classes ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage instructor_classes"  ON public.instructor_classes;
DROP POLICY IF EXISTS "Instructors can view own classes"      ON public.instructor_classes;

CREATE POLICY "Admins can manage instructor_classes"
  ON public.instructor_classes FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  );
CREATE POLICY "Instructors can view own classes"
  ON public.instructor_classes FOR SELECT TO authenticated
  USING (auth.uid() = instructor_id);

-- ── instructor_permissions ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage instructor_permissions"  ON public.instructor_permissions;
DROP POLICY IF EXISTS "Instructors can view own permissions"      ON public.instructor_permissions;

CREATE POLICY "Admins can manage instructor_permissions"
  ON public.instructor_permissions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
  );
CREATE POLICY "Instructors can view own permissions"
  ON public.instructor_permissions FOR SELECT TO authenticated
  USING (auth.uid() = instructor_id);

-- ── school_referrals ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Officers can view own referrals"         ON public.school_referrals;
DROP POLICY IF EXISTS "Super admins can manage all referrals"   ON public.school_referrals;
DROP POLICY IF EXISTS "Super admin full access to referrals"    ON public.school_referrals;

CREATE POLICY "Officers can view own referrals"
  ON public.school_referrals FOR SELECT TO authenticated
  USING (officer_id = auth.uid());
CREATE POLICY "Super admins can manage all referrals"
  ON public.school_referrals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ── theory_questions ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage school theory questions"        ON public.theory_questions;
DROP POLICY IF EXISTS "Instructors can manage school theory questions"   ON public.theory_questions;
DROP POLICY IF EXISTS "Students can view theory questions of published exams" ON public.theory_questions;

CREATE POLICY "Admins can manage school theory questions"
  ON public.theory_questions FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = theory_questions.exam_id
        AND e.school_id = public.get_user_school_id(auth.uid())
    )
  );
CREATE POLICY "Instructors can manage school theory questions"
  ON public.theory_questions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = theory_questions.exam_id
        AND e.school_id = public.get_user_school_id(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_manage_exams = true
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = theory_questions.exam_id
        AND e.school_id = public.get_user_school_id(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid() AND ip.can_manage_exams = true
    )
  );
CREATE POLICY "Students can view theory questions of published exams"
  ON public.theory_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = theory_questions.exam_id
        AND e.is_published = true
        AND e.school_id = public.get_user_school_id(auth.uid())
    )
  );

-- ── subscriptions ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "super_admin_subscriptions_all" ON public.subscriptions;

CREATE POLICY "super_admin_subscriptions_all"
  ON public.subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text = 'super_admin'
    )
  );

-- ── storage.objects ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can upload question images"    ON storage.objects;
DROP POLICY IF EXISTS "Admins can update question images"    ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete question images"    ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view question images"      ON storage.objects;
DROP POLICY IF EXISTS "School logo is publicly accessible"   ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload school logo"        ON storage.objects;
DROP POLICY IF EXISTS "Admins can update school logo"        ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete school logo"        ON storage.objects;

CREATE POLICY "Admins can upload question images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update question images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete question images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Anyone can view question images"
  ON storage.objects FOR SELECT USING (bucket_id = 'question-images');
CREATE POLICY "School logo is publicly accessible"
  ON storage.objects FOR SELECT USING (bucket_id = 'school-logo');
CREATE POLICY "Admins can upload school logo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update school logo"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete school logo"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── instructor_subjects ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage instructor_subjects"          ON public.instructor_subjects;
DROP POLICY IF EXISTS "Instructors can read own subject assignments"   ON public.instructor_subjects;

CREATE POLICY "Admins can manage instructor_subjects"
  ON public.instructor_subjects FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "Instructors can read own subject assignments"
  ON public.instructor_subjects FOR SELECT TO authenticated
  USING (
    instructor_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND school_id = public.get_user_school_id(auth.uid())
    )
  );

-- ── class_instructors ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage class_instructors"          ON public.class_instructors;
DROP POLICY IF EXISTS "Instructors can read own class assignments"   ON public.class_instructors;

CREATE POLICY "Admins can manage class_instructors"
  ON public.class_instructors FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "Instructors can read own class assignments"
  ON public.class_instructors FOR SELECT TO authenticated
  USING (
    instructor_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND school_id = public.get_user_school_id(auth.uid())
    )
  );

