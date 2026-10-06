-- Create schools table
-- IF NOT EXISTS added: idempotency migration creates this table; without
-- the guard a fresh replay crashes with "relation already exists".
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view schools" ON public.schools;
CREATE POLICY "Anyone can view schools" ON public.schools
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super admins can manage schools" ON public.schools;
CREATE POLICY "Super admins can manage schools" ON public.schools
FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add school_id to all relevant tables
-- ADD COLUMN IF NOT EXISTS added throughout: without the guard, re-running
-- crashes with "column already exists" since 20260517000002 may have
-- already created these tables with school_id included.
ALTER TABLE public.user_roles         ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.profiles           ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.classes            ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.subjects           ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exams              ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.sessions           ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.terms              ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.school_settings    ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.instructor_classes ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.instructor_permissions ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

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

-- Drop old single-column unique constraint on school_settings.key
-- and replace with composite (school_id, key) for multi-tenancy.
ALTER TABLE public.school_settings DROP CONSTRAINT IF EXISTS school_settings_key_key;

-- Add composite constraint only if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_settings_school_key'
      AND conrelid = 'public.school_settings'::regclass
  ) THEN
    ALTER TABLE public.school_settings
      ADD CONSTRAINT school_settings_school_key UNIQUE (school_id, key);
  END IF;
END $$;
