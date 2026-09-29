-- Create storage bucket for question images/diagrams
-- ON CONFLICT (id) guard added: without it this crashes on any replay
-- (preview branches, local reset, CI) since the bucket already exists.
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload images
DROP POLICY IF EXISTS "Admins can upload question images" ON storage.objects;
CREATE POLICY "Admins can upload question images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'));

-- Allow admins to update images
DROP POLICY IF EXISTS "Admins can update question images" ON storage.objects;
CREATE POLICY "Admins can update question images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete images
DROP POLICY IF EXISTS "Admins can delete question images" ON storage.objects;
CREATE POLICY "Admins can delete question images"
ON storage.objects FOR DELETE
USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'));

-- Everyone can view question images (needed for students taking exams)
DROP POLICY IF EXISTS "Anyone can view question images" ON storage.objects;
CREATE POLICY "Anyone can view question images"
ON storage.objects FOR SELECT
USING (bucket_id = 'question-images');
