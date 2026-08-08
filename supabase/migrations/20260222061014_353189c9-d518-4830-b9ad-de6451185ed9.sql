-- Create school_settings table
CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.school_settings;
CREATE POLICY "Authenticated users can read settings"
ON public.school_settings FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage settings" ON public.school_settings;
CREATE POLICY "Admins can manage settings"
ON public.school_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_school_settings_updated_at ON public.school_settings;
CREATE TRIGGER update_school_settings_updated_at
BEFORE UPDATE ON public.school_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REMOVED: seed INSERT for ('school_name', 'CBT Portal').
-- After migration 20260311133417, school_settings.school_id becomes NOT NULL
-- (FK to public.schools). Inserting without a school_id violates that constraint
-- on any fresh replay. Settings are provisioned per-school at school-creation time.
