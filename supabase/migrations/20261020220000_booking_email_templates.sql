-- Customizable booking confirmation / reminder emails per organization.

ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS confirmation_email_subject text,
  ADD COLUMN IF NOT EXISTS confirmation_email_body text,
  ADD COLUMN IF NOT EXISTS reminder_1d_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_1d_subject text,
  ADD COLUMN IF NOT EXISTS reminder_1d_body text,
  ADD COLUMN IF NOT EXISTS reminder_1h_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_1h_subject text,
  ADD COLUMN IF NOT EXISTS reminder_1h_body text;

COMMENT ON COLUMN public.booking_settings.confirmation_email_subject IS
  'Optional custom subject. Null uses the default template.';
COMMENT ON COLUMN public.booking_settings.reminder_1d_enabled IS
  'When false, 1-day-before booking reminders are not sent.';
COMMENT ON COLUMN public.booking_settings.reminder_1h_enabled IS
  'When false, 1-hour-before booking reminders are not sent.';
