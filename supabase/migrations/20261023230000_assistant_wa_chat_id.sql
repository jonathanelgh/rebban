-- Bind WhatsApp LID / chat id to a linked account (phone alone is not enough on modern WA).

ALTER TABLE public.assistant_whatsapp_links
  ADD COLUMN IF NOT EXISTS wa_chat_id text;

CREATE UNIQUE INDEX IF NOT EXISTS assistant_whatsapp_links_wa_chat_id_unique
  ON public.assistant_whatsapp_links (wa_chat_id)
  WHERE wa_chat_id IS NOT NULL;
