-- Allow public proposal/invoice pages to read org logos and related branding assets.
CREATE POLICY org_assets_select_public_branding
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'org-assets'
    AND (
      name ~* '/logo\.[^/]+$'
      OR name ~* '/banner\.[^/]+$'
      OR name ~* '/proposals/.+/header-'
    )
  );
