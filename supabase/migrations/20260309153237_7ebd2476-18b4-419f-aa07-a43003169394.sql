INSERT INTO public.school_settings (key, value)
VALUES 
  ('school_name', 'CBT Portal'),
  ('school_logo_url', '')
ON CONFLICT (key) DO NOTHING;