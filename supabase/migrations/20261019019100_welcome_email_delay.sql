-- Schedule founder welcome emails 75 minutes after signup.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_due_at timestamptz;

COMMENT ON COLUMN public.profiles.welcome_email_due_at IS
  'When the personal founder welcome email becomes due (signup + 75 minutes).';

CREATE OR REPLACE FUNCTION public.set_profile_welcome_email_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.welcome_email_due_at IS NULL AND NEW.welcome_email_sent_at IS NULL THEN
    NEW.welcome_email_due_at :=
      COALESCE(NEW.created_at, now()) + interval '75 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_welcome_email_due ON public.profiles;
CREATE TRIGGER profiles_welcome_email_due
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profile_welcome_email_due();

CREATE INDEX IF NOT EXISTS profiles_welcome_email_due_idx
  ON public.profiles (welcome_email_due_at)
  WHERE welcome_email_sent_at IS NULL
    AND welcome_email_due_at IS NOT NULL
    AND deleted_at IS NULL;
