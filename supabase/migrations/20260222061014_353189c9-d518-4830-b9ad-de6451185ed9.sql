
-- Create school_settings table
CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read settings
DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.school_settings;
CREATE POLICY "Authenticated users can read settings"
ON public.school_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can insert/update/delete settings
DROP POLICY IF EXISTS "Admins can manage settings" ON public.school_settings;
CREATE POLICY "Admins can manage settings"
ON public.school_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_school_settings_updated_at ON public.school_settings;
CREATE TRIGGER update_school_settings_updated_at
BEFORE UPDATE ON public.school_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default school name
INSERT INTO public.school_settings (key, value)
VALUES ('school_name', 'CBT Portal')
ON CONFLICT (key) DO NOTHING;
