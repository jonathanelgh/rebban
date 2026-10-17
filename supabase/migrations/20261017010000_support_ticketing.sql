-- Support ticketing: AI + Human agents, escalation, SLA.

CREATE TYPE public.support_ticket_status AS ENUM (
  'open',
  'awaiting_human',
  'awaiting_user',
  'resolved',
  'closed'
);

CREATE TYPE public.support_ticket_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE public.support_agent AS ENUM (
  'ai',
  'human',
  'user',
  'system'
);

CREATE TYPE public.support_ticket_channel AS ENUM (
  'in_app_chat',
  'email'
);

CREATE OR REPLACE FUNCTION public.set_support_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE SEQUENCE public.support_ticket_number_seq START WITH 1001;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number integer NOT NULL DEFAULT nextval('support_ticket_number_seq'),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT 'Support chat',
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  channel public.support_ticket_channel NOT NULL DEFAULT 'in_app_chat',
  assigned_agent public.support_agent NOT NULL DEFAULT 'ai',
  requester_email text,
  requester_name text,
  escalation_reason text,
  escalated_at timestamptz,
  sla_due_at timestamptz,
  first_human_reply_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_ticket_number_unique UNIQUE (ticket_number)
);

CREATE INDEX support_tickets_user_idx ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX support_tickets_org_idx ON public.support_tickets (organization_id, created_at DESC);
CREATE INDEX support_tickets_status_idx ON public.support_tickets (status, last_message_at DESC NULLS LAST);
CREATE INDEX support_tickets_assigned_idx ON public.support_tickets (assigned_agent, status);
CREATE INDEX support_tickets_sla_idx ON public.support_tickets (sla_due_at)
  WHERE status = 'awaiting_human' AND first_human_reply_at IS NULL;

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_support_updated_at();

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  agent public.support_agent NOT NULL,
  author_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_messages_ticket_idx
  ON public.support_messages (ticket_id, created_at ASC);

CREATE TABLE public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  agent public.support_agent,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_events_ticket_idx
  ON public.support_ticket_events (ticket_id, created_at ASC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

-- Requesters: own tickets
CREATE POLICY support_tickets_select_own
  ON public.support_tickets FOR SELECT
  USING (user_id = auth.uid() OR is_platform_admin());

CREATE POLICY support_tickets_insert_own
  ON public.support_tickets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY support_tickets_update_own
  ON public.support_tickets FOR UPDATE
  USING (user_id = auth.uid() OR is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR is_platform_admin());

CREATE POLICY support_tickets_admin_all
  ON public.support_tickets FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Messages: own ticket (non-internal) or platform admin
CREATE POLICY support_messages_select
  ON public.support_messages FOR SELECT
  USING (
    is_platform_admin()
    OR (
      NOT is_internal
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
  );

CREATE POLICY support_messages_insert_user
  ON public.support_messages FOR INSERT
  WITH CHECK (
    is_platform_admin()
    OR (
      agent = 'user'
      AND author_user_id = auth.uid()
      AND NOT is_internal
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
    OR (
      agent IN ('ai', 'system')
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
  );

CREATE POLICY support_messages_admin_all
  ON public.support_messages FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY support_events_select
  ON public.support_ticket_events FOR SELECT
  USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY support_events_insert
  ON public.support_ticket_events FOR INSERT
  WITH CHECK (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY support_events_admin_all
  ON public.support_ticket_events FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
