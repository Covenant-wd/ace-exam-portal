
-- Create role enum (safe — already guarded with DO/EXCEPTION)
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'student');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ── Profiles table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  class_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── User roles table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ── Security definer function to check roles ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ── Subjects table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- ── Exams table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

-- ── Questions table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL, -- 'A', 'B', 'C', or 'D'
  question_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- ── Exam attempts table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score INTEGER,
  total_questions INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  is_submitted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(exam_id, student_id)
);

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

-- ── Student answers table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  selected_option TEXT, -- 'A', 'B', 'C', 'D', or NULL
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- ── Updated_at trigger function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers (drop first so re-running this file never fails)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_exams_updated_at ON public.exams;
CREATE TRIGGER update_exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Auto-create profile and assign student role on signup ─────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── RLS Policies ──────────────────────────────────────────────────────────────
-- Drop all first so re-running never hits "policy already exists"

-- profiles
DROP POLICY IF EXISTS "Users can view own profile"    ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"  ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
DROP POLICY IF EXISTS "System inserts profiles"       ON public.profiles;

CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System inserts profiles"      ON public.profiles FOR INSERT WITH CHECK (true);

-- user_roles
DROP POLICY IF EXISTS "Users can view own role"   ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles"   ON public.user_roles;
DROP POLICY IF EXISTS "System inserts roles"      ON public.user_roles;

CREATE POLICY "Users can view own role"   ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles"   ON public.user_roles FOR ALL   USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System inserts roles"      ON public.user_roles FOR INSERT WITH CHECK (true);

-- subjects
DROP POLICY IF EXISTS "Anyone authenticated can view subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can manage subjects"            ON public.subjects;

CREATE POLICY "Anyone authenticated can view subjects" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage subjects"             ON public.subjects FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- exams
DROP POLICY IF EXISTS "Students can view published exams" ON public.exams;
DROP POLICY IF EXISTS "Admins can view all exams"        ON public.exams;
DROP POLICY IF EXISTS "Admins can manage exams"          ON public.exams;

CREATE POLICY "Students can view published exams" ON public.exams FOR SELECT TO authenticated USING (is_published = true);
CREATE POLICY "Admins can view all exams"         ON public.exams FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage exams"           ON public.exams FOR ALL   USING (public.has_role(auth.uid(), 'admin'));

-- questions
DROP POLICY IF EXISTS "Students can view questions of published exams" ON public.questions;
DROP POLICY IF EXISTS "Admins can manage questions"                    ON public.questions;

CREATE POLICY "Students can view questions of published exams" ON public.questions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.exams WHERE exams.id = questions.exam_id AND exams.is_published = true)
);
CREATE POLICY "Admins can manage questions" ON public.questions FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- exam_attempts
DROP POLICY IF EXISTS "Students can view own attempts"   ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can insert own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can update own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins can view all attempts"     ON public.exam_attempts;

CREATE POLICY "Students can view own attempts"   ON public.exam_attempts FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Students can insert own attempts" ON public.exam_attempts FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can update own attempts" ON public.exam_attempts FOR UPDATE USING (auth.uid() = student_id);
CREATE POLICY "Admins can view all attempts"     ON public.exam_attempts FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- student_answers
DROP POLICY IF EXISTS "Students can view own answers"   ON public.student_answers;
DROP POLICY IF EXISTS "Students can insert own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Admins can view all answers"     ON public.student_answers;

CREATE POLICY "Students can view own answers" ON public.student_answers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid())
);
CREATE POLICY "Students can insert own answers" ON public.student_answers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid())
);
CREATE POLICY "Students can update own answers" ON public.student_answers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_attempts.id = student_answers.attempt_id AND exam_attempts.student_id = auth.uid())
);
CREATE POLICY "Admins can view all answers" ON public.student_answers FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
