
-- Create school-logo storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('school-logo', 'school-logo', true);

-- Anyone can view the logo
CREATE POLICY "School logo is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'school-logo');

-- Only admins can upload/update/delete the logo
CREATE POLICY "Admins can upload school logo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update school logo"
ON storage.objects FOR UPDATE
USING (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete school logo"
ON storage.objects FOR DELETE
USING (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Seed school_logo_url setting
INSERT INTO public.school_settings (key, value) VALUES ('school_logo_url', '');
