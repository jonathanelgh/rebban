-- Google Calendar connections for booking availability sync.

CREATE TABLE public.google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expiry timestamptz NOT NULL,
  scope text,
  calendar_id text NOT NULL DEFAULT 'primary',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT google_calendar_connections_user_unique UNIQUE (user_id)
);

CREATE INDEX google_calendar_connections_org_idx
  ON public.google_calendar_connections (organization_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS google_event_id text;

CREATE INDEX IF NOT EXISTS bookings_google_event_id_idx
  ON public.bookings (google_event_id)
  WHERE google_event_id IS NOT NULL;

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_calendar_connections_select
  ON public.google_calendar_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY google_calendar_connections_insert
  ON public.google_calendar_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY google_calendar_connections_update
  ON public.google_calendar_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY google_calendar_connections_delete
  ON public.google_calendar_connections FOR DELETE
  USING (auth.uid() = user_id);
