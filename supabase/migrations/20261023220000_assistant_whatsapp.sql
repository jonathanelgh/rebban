-- Rebban Assistant: WhatsApp phone linking + conversation state

CREATE TABLE public.assistant_whatsapp_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  verified_at timestamptz,
  verification_code text,
  verification_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_whatsapp_links_phone_unique UNIQUE (phone_e164),
  CONSTRAINT assistant_whatsapp_links_user_unique UNIQUE (user_id)
);

CREATE INDEX assistant_whatsapp_links_org_idx
  ON public.assistant_whatsapp_links (organization_id);

CREATE INDEX assistant_whatsapp_links_verified_phone_idx
  ON public.assistant_whatsapp_links (phone_e164)
  WHERE verified_at IS NOT NULL;

CREATE TABLE public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.assistant_whatsapp_links (id) ON DELETE CASCADE,
  wa_chat_id text NOT NULL,
  pending_action jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_conversations_link_chat_unique UNIQUE (link_id, wa_chat_id)
);

CREATE INDEX assistant_conversations_link_idx
  ON public.assistant_conversations (link_id);

CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  wa_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_messages_conversation_idx
  ON public.assistant_messages (conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_assistant_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER assistant_whatsapp_links_updated_at
  BEFORE UPDATE ON public.assistant_whatsapp_links
  FOR EACH ROW EXECUTE FUNCTION public.set_assistant_updated_at();

CREATE TRIGGER assistant_conversations_updated_at
  BEFORE UPDATE ON public.assistant_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_assistant_updated_at();

ALTER TABLE public.assistant_whatsapp_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY assistant_whatsapp_links_select_own
  ON public.assistant_whatsapp_links
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY assistant_whatsapp_links_insert_own
  ON public.assistant_whatsapp_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
  );

CREATE POLICY assistant_whatsapp_links_update_own
  ON public.assistant_whatsapp_links
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY assistant_whatsapp_links_delete_own
  ON public.assistant_whatsapp_links
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY assistant_conversations_select_own
  ON public.assistant_conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assistant_whatsapp_links l
      WHERE l.id = link_id AND l.user_id = auth.uid()
    )
  );

CREATE POLICY assistant_messages_select_own
  ON public.assistant_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assistant_conversations c
      JOIN public.assistant_whatsapp_links l ON l.id = c.link_id
      WHERE c.id = conversation_id AND l.user_id = auth.uid()
    )
  );
