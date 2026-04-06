CREATE POLICY "Anyone can read public school settings"
ON public.school_settings
FOR SELECT
TO anon, authenticated
USING (key IN ('school_logo_url', 'school_name'));