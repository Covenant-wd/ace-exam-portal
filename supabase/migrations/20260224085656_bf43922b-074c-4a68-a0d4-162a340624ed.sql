
-- =============================================
-- 1. Fix ALL restrictive RLS policies → permissive
-- =============================================

-- class_subjects
DROP POLICY IF EXISTS "Admins can manage class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "Authenticated can read class_subjects" ON public.class_subjects;
CREATE POLICY "Admins can manage class_subjects" ON public.class_subjects FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read class_subjects" ON public.class_subjects FOR SELECT USING (auth.uid() IS NOT NULL);

-- classes
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;
DROP POLICY IF EXISTS "Authenticated can read classes" ON public.classes;
CREATE POLICY "Admins can manage classes" ON public.classes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read classes" ON public.classes FOR SELECT USING (auth.uid() IS NOT NULL);

-- sessions
DROP POLICY IF EXISTS "Admins can manage sessions" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated can read sessions" ON public.sessions;
CREATE POLICY "Admins can manage sessions" ON public.sessions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read sessions" ON public.sessions FOR SELECT USING (auth.uid() IS NOT NULL);

-- terms
DROP POLICY IF EXISTS "Admins can manage terms" ON public.terms;
DROP POLICY IF EXISTS "Authenticated can read terms" ON public.terms;
CREATE POLICY "Admins can manage terms" ON public.terms FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read terms" ON public.terms FOR SELECT USING (auth.uid() IS NOT NULL);

-- school_settings
DROP POLICY IF EXISTS "Admins can manage settings" ON public.school_settings;
DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.school_settings;
CREATE POLICY "Admins can manage settings" ON public.school_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can read settings" ON public.school_settings FOR SELECT USING (auth.uid() IS NOT NULL);

-- user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- exams
DROP POLICY IF EXISTS "Admins can manage exams" ON public.exams;
DROP POLICY IF EXISTS "Admins can view all exams" ON public.exams;
DROP POLICY IF EXISTS "Students can view published exams" ON public.exams;
CREATE POLICY "Admins can manage exams" ON public.exams FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students can view published exams" ON public.exams FOR SELECT USING (is_published = true);

-- exam_attempts
DROP POLICY IF EXISTS "Admins can view all attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can insert own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can update own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can view own attempts" ON public.exam_attempts;
CREATE POLICY "Admins can view all attempts" ON public.exam_attempts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students can insert own attempts" ON public.exam_attempts FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can update own attempts" ON public.exam_attempts FOR UPDATE USING (auth.uid() = student_id);
CREATE POLICY "Students can view own attempts" ON public.exam_attempts FOR SELECT USING (auth.uid() = student_id);

-- student_answers
DROP POLICY IF EXISTS "Admins can view all answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can insert own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can view own answers" ON public.student_answers;
CREATE POLICY "Admins can view all answers" ON public.student_answers FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students can insert own answers" ON public.student_answers FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid()));
CREATE POLICY "Students can update own answers" ON public.student_answers FOR UPDATE USING (EXISTS (SELECT 1 FROM exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid()));
CREATE POLICY "Students can view own answers" ON public.student_answers FOR SELECT USING (EXISTS (SELECT 1 FROM exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid()));

-- questions
DROP POLICY IF EXISTS "Admins can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Students can view questions of published exams" ON public.questions;
CREATE POLICY "Admins can manage questions" ON public.questions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students can view questions of published exams" ON public.questions FOR SELECT USING (EXISTS (SELECT 1 FROM exams WHERE exams.id = questions.exam_id AND exams.is_published = true));

-- subjects
DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "Anyone authenticated can view subjects" ON public.subjects;
CREATE POLICY "Admins can manage subjects" ON public.subjects FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone authenticated can view subjects" ON public.subjects FOR SELECT USING (auth.uid() IS NOT NULL);

-- =============================================
-- 2. Add gender column to profiles
-- =============================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text DEFAULT '';
