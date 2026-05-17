-- Create school-logo storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logo', 'school-logo', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view logos (used by login page, sidebar, anon users)
DROP POLICY IF EXISTS "School logo is publicly accessible" ON storage.objects;
CREATE POLICY "School logo is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'school-logo');

-- FIX (Issue 1 — logo upload fails):
-- The upload flow in useUpdateSchoolLogo calls .upload(..., { upsert: true }).
-- Supabase storage upsert issues an INSERT first; if the file already exists it
-- falls back to an UPDATE. Both the INSERT and the UPDATE path must be
-- permitted for overwrite to work.
--
-- The previous INSERT policy only had WITH CHECK (correct for INSERT).
-- The previous UPDATE policy only had USING (which gates row visibility for
-- SELECT/UPDATE/DELETE, but for UPDATE on storage objects Supabase also
-- requires WITH CHECK to approve the incoming data).
-- Without WITH CHECK on the UPDATE policy, updating an existing logo silently
-- fails — the admin sees a spinner that never resolves, or a generic error.
--
-- Fix: add WITH CHECK to the UPDATE policy so upsert succeeds on overwrite.

DROP POLICY IF EXISTS "Admins can upload school logo" ON storage.objects;
CREATE POLICY "Admins can upload school logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'school-logo'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can update school logo" ON storage.objects;
CREATE POLICY "Admins can update school logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'school-logo'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'school-logo'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can delete school logo" ON storage.objects;
CREATE POLICY "Admins can delete school logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'school-logo'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
