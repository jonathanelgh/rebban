-- Org default for proposal follow-up automation (used when sending with automation on).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_proposal_followup_sequence text
  DEFAULT 'standard';

UPDATE public.organizations
SET default_proposal_followup_sequence = 'standard'
WHERE default_proposal_followup_sequence IS NULL
   OR default_proposal_followup_sequence NOT IN ('gentle', 'standard', 'persistent');

ALTER TABLE public.organizations
  ALTER COLUMN default_proposal_followup_sequence SET DEFAULT 'standard';
