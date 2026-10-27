-- Month receipt ZIPs upload to the same bucket as originals.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/html',
  'text/plain',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed'
],
file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 52428800)
WHERE id = 'receipt-originals';
