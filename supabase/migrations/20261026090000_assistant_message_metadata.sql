-- Persist structured interactive components on assistant messages
ALTER TABLE public.assistant_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.assistant_messages.metadata IS
  'Structured UI payloads for in-app chat (e.g. { "components": [...] }). Empty for WhatsApp.';
