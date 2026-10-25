-- In-app Rebban Assistant conversations (no support ticket unless escalated)

ALTER TABLE public.assistant_conversations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS support_ticket_id uuid REFERENCES public.support_tickets (id) ON DELETE SET NULL;

UPDATE public.assistant_conversations c
SET
  user_id = l.user_id,
  organization_id = l.organization_id,
  channel = 'whatsapp'
FROM public.assistant_whatsapp_links l
WHERE c.link_id = l.id
  AND (c.user_id IS NULL OR c.organization_id IS NULL);

ALTER TABLE public.assistant_conversations
  DROP CONSTRAINT IF EXISTS assistant_conversations_link_chat_unique;

ALTER TABLE public.assistant_conversations
  ALTER COLUMN link_id DROP NOT NULL,
  ALTER COLUMN wa_chat_id DROP NOT NULL;

ALTER TABLE public.assistant_conversations
  DROP CONSTRAINT IF EXISTS assistant_conversations_channel_check;

ALTER TABLE public.assistant_conversations
  ADD CONSTRAINT assistant_conversations_channel_check
  CHECK (channel IN ('whatsapp', 'in_app'));

CREATE UNIQUE INDEX IF NOT EXISTS assistant_conversations_wa_unique
  ON public.assistant_conversations (link_id, wa_chat_id)
  WHERE channel = 'whatsapp'
    AND link_id IS NOT NULL
    AND wa_chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assistant_conversations_in_app_user_idx
  ON public.assistant_conversations (user_id, updated_at DESC)
  WHERE channel = 'in_app';

CREATE INDEX IF NOT EXISTS assistant_conversations_support_ticket_idx
  ON public.assistant_conversations (support_ticket_id)
  WHERE support_ticket_id IS NOT NULL;

-- In-app RLS (WhatsApp rows remain readable via link ownership policies)
CREATE POLICY assistant_conversations_select_in_app
  ON public.assistant_conversations
  FOR SELECT
  TO authenticated
  USING (channel = 'in_app' AND user_id = auth.uid());

CREATE POLICY assistant_conversations_insert_in_app
  ON public.assistant_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    channel = 'in_app'
    AND user_id = auth.uid()
    AND public.is_org_member(organization_id)
  );

CREATE POLICY assistant_conversations_update_in_app
  ON public.assistant_conversations
  FOR UPDATE
  TO authenticated
  USING (channel = 'in_app' AND user_id = auth.uid())
  WITH CHECK (channel = 'in_app' AND user_id = auth.uid());

CREATE POLICY assistant_conversations_delete_in_app
  ON public.assistant_conversations
  FOR DELETE
  TO authenticated
  USING (channel = 'in_app' AND user_id = auth.uid());

CREATE POLICY assistant_messages_select_in_app
  ON public.assistant_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.channel = 'in_app'
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY assistant_messages_insert_in_app
  ON public.assistant_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.channel = 'in_app'
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY assistant_messages_delete_in_app
  ON public.assistant_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.channel = 'in_app'
        AND c.user_id = auth.uid()
    )
  );
