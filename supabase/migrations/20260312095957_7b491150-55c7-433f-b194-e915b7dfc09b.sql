-- ============================================
-- ATTENDANCE TRACKING
-- ============================================
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

DROP POLICY IF EXISTS "Admins can manage attendance" ON public.attendance;
CREATE POLICY "Admins can manage attendance" ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Instructors can manage attendance for their classes" ON public.attendance;
CREATE POLICY "Instructors can manage attendance for their classes" ON public.attendance FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = attendance.class_id));

DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- ============================================
-- TIMETABLE / SCHEDULE
-- ============================================
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

DROP POLICY IF EXISTS "Admins can manage periods" ON public.timetable_periods;
CREATE POLICY "Admins can manage periods" ON public.timetable_periods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can read periods" ON public.timetable_periods;
CREATE POLICY "Authenticated can read periods" ON public.timetable_periods FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

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

DROP POLICY IF EXISTS "Admins can manage timetable" ON public.timetable_entries;
CREATE POLICY "Admins can manage timetable" ON public.timetable_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can read timetable" ON public.timetable_entries;
CREATE POLICY "Authenticated can read timetable" ON public.timetable_entries FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- GRADING / REPORT CARDS
-- ============================================
CREATE TABLE IF NOT EXISTS public.grade_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 100,
  term_id UUID REFERENCES public.terms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.grade_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage grade_categories" ON public.grade_categories;
CREATE POLICY "Admins can manage grade_categories" ON public.grade_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can read grade_categories" ON public.grade_categories;
CREATE POLICY "Authenticated can read grade_categories" ON public.grade_categories FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

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

DROP POLICY IF EXISTS "Admins can manage grades" ON public.grades;
CREATE POLICY "Admins can manage grades" ON public.grades FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Instructors can manage grades for their classes" ON public.grades;
CREATE POLICY "Instructors can manage grades for their classes" ON public.grades FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = grades.class_id));

DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades" ON public.grades FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- ============================================
-- FEE MANAGEMENT
-- ============================================
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

DROP POLICY IF EXISTS "Admins can manage fee_types" ON public.fee_types;
CREATE POLICY "Admins can manage fee_types" ON public.fee_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can read fee_types" ON public.fee_types;
CREATE POLICY "Authenticated can read fee_types" ON public.fee_types FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

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

DROP POLICY IF EXISTS "Admins can manage fee_payments" ON public.fee_payments;
CREATE POLICY "Admins can manage fee_payments" ON public.fee_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Students can view own payments" ON public.fee_payments;
CREATE POLICY "Students can view own payments" ON public.fee_payments FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- ============================================
-- ANNOUNCEMENTS
-- ============================================
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

DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
CREATE POLICY "Admins can manage announcements" ON public.announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can read active announcements" ON public.announcements;
CREATE POLICY "Authenticated can read active announcements" ON public.announcements FOR SELECT TO authenticated
  USING (is_active = true);
