-- Create school-logo storage bucket
-- ON CONFLICT (id) already present — safe.
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logo', 'school-logo', true)
ON CONFLICT (id) DO NOTHING;

-- DROP IF EXISTS guards added: storage object policies are not idempotent
-- without them; re-running crashes with "policy already exists".
DROP POLICY IF EXISTS "School logo is publicly accessible" ON storage.objects;
CREATE POLICY "School logo is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'school-logo');

DROP POLICY IF EXISTS "Admins can upload school logo" ON storage.objects;
CREATE POLICY "Admins can upload school logo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update school logo" ON storage.objects;
CREATE POLICY "Admins can update school logo"
ON storage.objects FOR UPDATE
USING (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete school logo" ON storage.objects;
CREATE POLICY "Admins can delete school logo"
ON storage.objects FOR DELETE
USING (bucket_id = 'school-logo' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- REMOVED: seed INSERT for ('school_logo_url', '').
-- After migration 20260311133417, school_settings.school_id is NOT NULL.
-- Inserting without a school_id violates the constraint on any fresh replay.
-- Settings are provisioned per-school at school-creation time.
