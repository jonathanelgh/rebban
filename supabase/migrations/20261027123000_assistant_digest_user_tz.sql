-- Track digest recipients so cooldown is per user (timezone-aware sends).
ALTER TABLE public.assistant_digest_sends
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS assistant_digest_sends_user_created_idx
  ON public.assistant_digest_sends (user_id, created_at DESC);
