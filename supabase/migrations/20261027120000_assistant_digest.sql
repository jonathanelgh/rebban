-- Cooldown log so assistant digests are not spammed per organization.
CREATE TABLE IF NOT EXISTS public.assistant_digest_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  item_count integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_digest_sends_org_created_idx
  ON public.assistant_digest_sends (organization_id, created_at DESC);

ALTER TABLE public.assistant_digest_sends ENABLE ROW LEVEL SECURITY;
