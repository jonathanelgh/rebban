-- Profile photos need to be readable on public booking pages.
UPDATE storage.buckets SET public = true WHERE id = 'avatars';

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');
