ALTER TABLE public.lead_forms
  ADD COLUMN IF NOT EXISTS confirmation_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_email_via text NOT NULL DEFAULT 'rebban',
  ADD COLUMN IF NOT EXISTS confirmation_email_subject text NOT NULL DEFAULT 'Thanks for reaching out',
  ADD COLUMN IF NOT EXISTS confirmation_email_body text NOT NULL DEFAULT E'Hi {{name}},\n\nThanks for getting in touch. We received your message and will get back to you soon.\n\nBest',
  ADD COLUMN IF NOT EXISTS confirmation_email_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_forms_confirmation_email_via_check'
  ) THEN
    ALTER TABLE public.lead_forms
      ADD CONSTRAINT lead_forms_confirmation_email_via_check
      CHECK (confirmation_email_via IN ('rebban', 'connected'));
  END IF;
END $$;
