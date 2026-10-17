-- Ensure new organizations get Standard payment reminders by default.
ALTER TABLE public.organizations
  ALTER COLUMN default_reminder_sequence SET DEFAULT 'standard';

UPDATE public.organizations
SET default_reminder_sequence = 'standard'
WHERE default_reminder_sequence IS NULL
   OR default_reminder_sequence NOT IN ('gentle', 'standard', 'persistent');
