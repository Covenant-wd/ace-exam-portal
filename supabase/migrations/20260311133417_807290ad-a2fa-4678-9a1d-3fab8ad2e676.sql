
-- Create schools table
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view schools" ON public.schools
FOR SELECT USING (true);

CREATE POLICY "Super admins can manage schools" ON public.schools
FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add school_id to all relevant tables
ALTER TABLE public.user_roles ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.subjects ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exams ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.terms ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.school_settings ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.instructor_classes ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.instructor_permissions ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- Function to get user's school_id
CREATE OR REPLACE FUNCTION public.get_user_school_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.user_roles WHERE user_id = _user_id AND school_id IS NOT NULL LIMIT 1
$$;

-- Update handle_new_user to include school_id from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _school_id uuid;
BEGIN
  _school_id := NULLIF(NEW.raw_user_meta_data->>'school_id', '')::uuid;

  INSERT INTO public.profiles (user_id, full_name, school_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), _school_id);

  IF _school_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, school_id)
    VALUES (NEW.id, 'student', _school_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Drop unique constraint on school_settings key if exists
ALTER TABLE public.school_settings DROP CONSTRAINT IF EXISTS school_settings_key_key;
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_school_key UNIQUE (school_id, key);
