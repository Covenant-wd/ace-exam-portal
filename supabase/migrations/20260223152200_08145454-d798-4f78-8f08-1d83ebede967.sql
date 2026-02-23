
-- Sessions table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage sessions" ON public.sessions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read sessions" ON public.sessions FOR SELECT USING (auth.uid() IS NOT NULL);

-- Terms table
CREATE TABLE public.terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage terms" ON public.terms FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read terms" ON public.terms FOR SELECT USING (auth.uid() IS NOT NULL);

-- Classes table
CREATE TABLE public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage classes" ON public.classes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read classes" ON public.classes FOR SELECT USING (auth.uid() IS NOT NULL);

-- Class-Subject linking table
CREATE TABLE public.class_subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  UNIQUE(class_id, subject_id)
);
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage class_subjects" ON public.class_subjects FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read class_subjects" ON public.class_subjects FOR SELECT USING (auth.uid() IS NOT NULL);

-- Add class_id to profiles (nullable, replaces text class_name conceptually)
ALTER TABLE public.profiles ADD COLUMN class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

-- Add term_id to exams
ALTER TABLE public.exams ADD COLUMN term_id UUID REFERENCES public.terms(id) ON DELETE SET NULL;

-- Add class_id to exams (exam belongs to a class)
ALTER TABLE public.exams ADD COLUMN class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;
