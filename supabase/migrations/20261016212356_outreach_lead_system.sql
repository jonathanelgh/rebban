-- Internal founder outreach system (platform-admin only).
-- Applied remotely as outreach_lead_system; kept in-repo for history.

CREATE TYPE public.outreach_status AS ENUM (
  'new', 'ready', 'queued', 'contacted', 'replied', 'not_interested', 'bounced'
);
CREATE TYPE public.outreach_temperature AS ENUM ('hot', 'warm', 'cold');
CREATE TYPE public.outreach_lead_tier AS ENUM ('a', 'b', 'c');
CREATE TYPE public.outreach_research_confidence AS ENUM (
  'high', 'medium', 'low', 'unknown'
);
CREATE TYPE public.outreach_message_direction AS ENUM ('outbound', 'inbound');
CREATE TYPE public.outreach_followup_status AS ENUM (
  'scheduled', 'due', 'sent', 'cancelled', 'skipped'
);
CREATE TYPE public.outreach_send_log_status AS ENUM (
  'queued', 'sent', 'failed', 'skipped'
);

CREATE OR REPLACE FUNCTION public.set_outreach_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  first_name text,
  last_name text,
  display_name text,
  business_name text,
  role text,
  location text,
  website_url text,
  source_url text,
  source_type text,
  lead_tier public.outreach_lead_tier NOT NULL DEFAULT 'b',
  research_confidence public.outreach_research_confidence NOT NULL DEFAULT 'unknown',
  website_summary text,
  personalized_opener text,
  rebban_fit text,
  outreach_angle text,
  subject_line text,
  initial_email_body text,
  outreach_status public.outreach_status NOT NULL DEFAULT 'new',
  temperature public.outreach_temperature,
  temperature_score integer CHECK (
    temperature_score IS NULL OR (temperature_score >= 0 AND temperature_score <= 100)
  ),
  temperature_reason text,
  current_tools text[] NOT NULL DEFAULT '{}',
  pain_points text[] NOT NULL DEFAULT '{}',
  competitors_mentioned text[] NOT NULL DEFAULT '{}',
  feature_requests text[] NOT NULL DEFAULT '{}',
  objections text[] NOT NULL DEFAULT '{}',
  positive_signals text[] NOT NULL DEFAULT '{}',
  last_contacted_at timestamptz,
  last_replied_at timestamptz,
  next_follow_up_at timestamptz,
  follow_up_count integer NOT NULL DEFAULT 0,
  gmail_thread_id text,
  gmail_message_id text,
  do_not_contact boolean NOT NULL DEFAULT false,
  unsubscribe_reason text,
  unsubscribed_at timestamptz,
  bounce_status text,
  caution_note text,
  ready_to_send boolean NOT NULL DEFAULT false,
  queued_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_leads_email_normalized_unique UNIQUE (email_normalized)
);

CREATE INDEX outreach_leads_status_idx ON public.outreach_leads (outreach_status);
CREATE INDEX outreach_leads_temperature_idx ON public.outreach_leads (temperature);
CREATE INDEX outreach_leads_next_follow_up_idx ON public.outreach_leads (next_follow_up_at);
CREATE INDEX outreach_leads_created_idx ON public.outreach_leads (created_at DESC);

CREATE TRIGGER outreach_leads_updated_at
  BEFORE UPDATE ON public.outreach_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_outreach_updated_at();

CREATE TABLE public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.outreach_leads (id) ON DELETE CASCADE,
  direction public.outreach_message_direction NOT NULL,
  provider text NOT NULL DEFAULT 'gmail',
  provider_message_id text,
  provider_thread_id text,
  subject text,
  body_text text,
  body_html text,
  from_email text,
  to_emails text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  received_at timestamptz,
  send_error text,
  ai_processed_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outreach_messages_provider_msg_unique
  ON public.outreach_messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX outreach_messages_lead_idx ON public.outreach_messages (lead_id, created_at);

CREATE TABLE public.outreach_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.outreach_leads (id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.outreach_messages (id) ON DELETE SET NULL,
  temperature public.outreach_temperature NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  intent text,
  sentiment text,
  summary text,
  current_tools text[] NOT NULL DEFAULT '{}',
  pain_points text[] NOT NULL DEFAULT '{}',
  competitors_mentioned text[] NOT NULL DEFAULT '{}',
  feature_requests text[] NOT NULL DEFAULT '{}',
  objections text[] NOT NULL DEFAULT '{}',
  positive_signals text[] NOT NULL DEFAULT '{}',
  recommended_action text,
  suggested_reply text,
  confidence numeric,
  raw_output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outreach_ai_analyses_lead_idx
  ON public.outreach_ai_analyses (lead_id, created_at DESC);

CREATE TABLE public.outreach_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.outreach_leads (id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  follow_up_number integer NOT NULL DEFAULT 1,
  status public.outreach_followup_status NOT NULL DEFAULT 'scheduled',
  subject text,
  body text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outreach_followups_due_idx
  ON public.outreach_followups (status, scheduled_for);

CREATE TRIGGER outreach_followups_updated_at
  BEFORE UPDATE ON public.outreach_followups
  FOR EACH ROW EXECUTE FUNCTION public.set_outreach_updated_at();

CREATE TABLE public.outreach_gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expiry timestamptz NOT NULL,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_sync_at timestamptz,
  CONSTRAINT outreach_gmail_connections_user_unique UNIQUE (user_id)
);

CREATE TABLE public.outreach_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.outreach_leads (id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.outreach_messages (id) ON DELETE SET NULL,
  status public.outreach_send_log_status NOT NULL,
  idempotency_key text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outreach_send_log_idempotency_unique
  ON public.outreach_send_log (idempotency_key);
CREATE INDEX outreach_send_log_created_idx
  ON public.outreach_send_log (created_at DESC);

CREATE TABLE public.outreach_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sending_enabled boolean NOT NULL DEFAULT false,
  daily_send_limit integer NOT NULL DEFAULT 20,
  allowed_weekdays integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  send_window_start time NOT NULL DEFAULT '09:00',
  send_window_end time NOT NULL DEFAULT '16:00',
  timezone text NOT NULL DEFAULT 'Europe/Stockholm',
  max_follow_ups integer NOT NULL DEFAULT 2,
  follow_up_1_days integer NOT NULL DEFAULT 4,
  follow_up_2_days integer NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.outreach_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.outreach_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY outreach_leads_admin_all ON public.outreach_leads
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY outreach_messages_admin_all ON public.outreach_messages
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY outreach_ai_analyses_admin_all ON public.outreach_ai_analyses
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY outreach_followups_admin_all ON public.outreach_followups
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY outreach_gmail_admin_all ON public.outreach_gmail_connections
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY outreach_send_log_admin_all ON public.outreach_send_log
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY outreach_settings_admin_all ON public.outreach_settings
  FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
