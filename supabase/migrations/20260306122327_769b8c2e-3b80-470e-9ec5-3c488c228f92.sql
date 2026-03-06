
-- Add 'instructor' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'instructor';

-- Create instructor_classes table (which classes an instructor is assigned to)
CREATE TABLE public.instructor_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instructor_id, class_id)
);

ALTER TABLE public.instructor_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage instructor_classes"
  ON public.instructor_classes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Instructors can view own classes"
  ON public.instructor_classes FOR SELECT
  USING (auth.uid() = instructor_id);

-- Create instructor_permissions table
CREATE TABLE public.instructor_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL UNIQUE,
  can_manage_exams boolean NOT NULL DEFAULT false,
  can_view_results boolean NOT NULL DEFAULT false,
  can_manage_students boolean NOT NULL DEFAULT false,
  can_manage_subjects boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instructor_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage instructor_permissions"
  ON public.instructor_permissions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Instructors can view own permissions"
  ON public.instructor_permissions FOR SELECT
  USING (auth.uid() = instructor_id);
