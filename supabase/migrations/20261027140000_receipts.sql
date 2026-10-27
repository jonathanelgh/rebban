-- Receipts MVP: personal inbound inbox, originals storage, extraction metadata.

CREATE TYPE public.receipt_source AS ENUM ('email', 'upload');
CREATE TYPE public.receipt_document_type AS ENUM (
  'receipt',
  'invoice',
  'credit_note',
  'other',
  'unknown'
);
CREATE TYPE public.receipt_review_status AS ENUM (
  'processing',
  'ready',
  'needs_review',
  'possible_duplicate',
  'failed',
  'reviewed'
);
CREATE TYPE public.receipt_file_role AS ENUM ('original', 'preview', 'body');
CREATE TYPE public.receipt_inbound_status AS ENUM (
  'received',
  'processing',
  'processed',
  'failed',
  'ignored'
);

CREATE TABLE public.receipt_inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  display_address text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT receipt_inboxes_token_hash_unique UNIQUE (token_hash)
);

CREATE UNIQUE INDEX receipt_inboxes_one_active_per_org
  ON public.receipt_inboxes (organization_id)
  WHERE active = true;

CREATE TABLE public.receipt_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  inbox_id uuid REFERENCES public.receipt_inboxes (id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_email_id text NOT NULL,
  message_id text,
  sender text,
  recipient text,
  subject text,
  received_at timestamptz NOT NULL DEFAULT now(),
  status public.receipt_inbound_status NOT NULL DEFAULT 'received',
  error text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_inbound_messages_provider_email_unique
    UNIQUE (provider, provider_email_id)
);

CREATE INDEX receipt_inbound_messages_org_received_idx
  ON public.receipt_inbound_messages (organization_id, received_at DESC);
CREATE INDEX receipt_inbound_messages_status_idx
  ON public.receipt_inbound_messages (status, created_at)
  WHERE status IN ('received', 'processing');

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  inbound_message_id uuid REFERENCES public.receipt_inbound_messages (id) ON DELETE SET NULL,
  source public.receipt_source NOT NULL,
  receipt_date date,
  merchant text,
  amount_minor bigint,
  currency text,
  tax_amount_minor bigint,
  document_type public.receipt_document_type NOT NULL DEFAULT 'unknown',
  review_status public.receipt_review_status NOT NULL DEFAULT 'processing',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  duplicate_of uuid REFERENCES public.receipts (id) ON DELETE SET NULL,
  is_possible_duplicate boolean NOT NULL DEFAULT false,
  note text,
  category text,
  original_filename text,
  attachment_index integer,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX receipts_org_date_idx
  ON public.receipts (organization_id, receipt_date DESC NULLS LAST)
  WHERE deleted_at IS NULL;
CREATE INDEX receipts_org_status_idx
  ON public.receipts (organization_id, review_status)
  WHERE deleted_at IS NULL;
CREATE INDEX receipts_org_unfiled_idx
  ON public.receipts (organization_id, created_at DESC)
  WHERE deleted_at IS NULL AND receipt_date IS NULL;
CREATE INDEX receipts_org_merchant_idx
  ON public.receipts (organization_id, merchant)
  WHERE deleted_at IS NULL;

CREATE TABLE public.receipt_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  bytes bigint NOT NULL,
  sha256 text NOT NULL,
  role public.receipt_file_role NOT NULL DEFAULT 'original',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_files_storage_key_unique UNIQUE (storage_key)
);

CREATE INDEX receipt_files_receipt_idx ON public.receipt_files (receipt_id);
CREATE INDEX receipt_files_org_sha_idx
  ON public.receipt_files (organization_id, sha256);

CREATE TABLE public.receipt_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  model text,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX receipt_extractions_receipt_idx
  ON public.receipt_extractions (receipt_id, extracted_at DESC);

CREATE TABLE public.receipt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX receipt_events_receipt_idx
  ON public.receipt_events (receipt_id, occurred_at DESC);

CREATE TABLE public.receipt_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  generated_at timestamptz NOT NULL DEFAULT now(),
  storage_key text,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ready',
  error text
);

CREATE INDEX receipt_exports_org_month_idx
  ON public.receipt_exports (organization_id, year DESC, month DESC);

CREATE OR REPLACE FUNCTION public.set_receipts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipts_set_updated_at ON public.receipts;
CREATE TRIGGER receipts_set_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_receipts_updated_at();

-- Claim pending inbound emails for the cron worker
CREATE OR REPLACE FUNCTION public.claim_pending_receipt_inbound(p_limit integer DEFAULT 10)
RETURNS SETOF public.receipt_inbound_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM public.receipt_inbound_messages
    WHERE status = 'received'
    ORDER BY created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.receipt_inbound_messages m
  SET status = 'processing'
  FROM claimed
  WHERE m.id = claimed.id
  RETURNING m.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_receipt_inbound(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_receipt_inbound(integer) TO service_role;

-- Claim receipts stuck in processing (uploads / retries)
CREATE OR REPLACE FUNCTION public.claim_pending_receipt_extractions(p_limit integer DEFAULT 10)
RETURNS SETOF public.receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.receipts r
  WHERE r.deleted_at IS NULL
    AND r.review_status = 'processing'
    AND r.updated_at < now() - interval '15 seconds'
  ORDER BY r.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_receipt_extractions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_receipt_extractions(integer) TO service_role;

ALTER TABLE public.receipt_inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_exports ENABLE ROW LEVEL SECURITY;

-- Inboxes
CREATE POLICY receipt_inboxes_select ON public.receipt_inboxes
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY receipt_inboxes_insert ON public.receipt_inboxes
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));
CREATE POLICY receipt_inboxes_update ON public.receipt_inboxes
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

-- Inbound messages (read for members; writes via service role / entitled)
CREATE POLICY receipt_inbound_messages_select ON public.receipt_inbound_messages
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY receipt_inbound_messages_insert ON public.receipt_inbound_messages
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));
CREATE POLICY receipt_inbound_messages_update ON public.receipt_inbound_messages
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

-- Receipts
CREATE POLICY receipts_select ON public.receipts
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY receipts_insert ON public.receipts
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));
CREATE POLICY receipts_update ON public.receipts
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));
CREATE POLICY receipts_delete ON public.receipts
  FOR DELETE
  USING (public.is_org_admin(organization_id) AND public.is_org_entitled(organization_id));

-- Files / extractions / events / exports
CREATE POLICY receipt_files_select ON public.receipt_files
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY receipt_files_insert ON public.receipt_files
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));
CREATE POLICY receipt_files_update ON public.receipt_files
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));
CREATE POLICY receipt_files_delete ON public.receipt_files
  FOR DELETE USING (public.is_org_member_entitled(organization_id));

CREATE POLICY receipt_extractions_select ON public.receipt_extractions
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY receipt_extractions_insert ON public.receipt_extractions
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

CREATE POLICY receipt_events_select ON public.receipt_events
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY receipt_events_insert ON public.receipt_events
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

CREATE POLICY receipt_exports_select ON public.receipt_exports
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY receipt_exports_insert ON public.receipt_exports
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));
CREATE POLICY receipt_exports_update ON public.receipt_exports
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

GRANT SELECT, INSERT, UPDATE ON public.receipt_inboxes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.receipt_inbound_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_files TO authenticated;
GRANT SELECT, INSERT ON public.receipt_extractions TO authenticated;
GRANT SELECT, INSERT ON public.receipt_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.receipt_exports TO authenticated;

REVOKE ALL ON public.receipt_inboxes FROM anon;
REVOKE ALL ON public.receipt_inbound_messages FROM anon;
REVOKE ALL ON public.receipts FROM anon;
REVOKE ALL ON public.receipt_files FROM anon;
REVOKE ALL ON public.receipt_extractions FROM anon;
REVOKE ALL ON public.receipt_events FROM anon;
REVOKE ALL ON public.receipt_exports FROM anon;

-- Private originals bucket (service role + signed URLs via backend)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipt-originals',
  'receipt-originals',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/html',
    'text/plain',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated members can read/write objects under their org prefix via client when needed;
-- preferred path is server-side admin upload + signed download.
DROP POLICY IF EXISTS receipt_originals_select ON storage.objects;
CREATE POLICY receipt_originals_select
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'receipt-originals'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS receipt_originals_insert ON storage.objects;
CREATE POLICY receipt_originals_insert
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'receipt-originals'
    AND public.is_org_member_entitled((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS receipt_originals_update ON storage.objects;
CREATE POLICY receipt_originals_update
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'receipt-originals'
    AND public.is_org_member_entitled((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'receipt-originals'
    AND public.is_org_member_entitled((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS receipt_originals_delete ON storage.objects;
CREATE POLICY receipt_originals_delete
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'receipt-originals'
    AND public.is_org_member_entitled((storage.foldername(name))[1]::uuid)
  );
