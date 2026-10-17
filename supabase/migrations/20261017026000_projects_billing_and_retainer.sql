-- Billing / retainer fields on projects + link back to proposal.
DO $$ BEGIN
  CREATE TYPE public.project_billing_type AS ENUM (
    'fixed',
    'hourly',
    'daily',
    'retainer',
    'mixed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_type public.project_billing_type NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS retainer_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS retainer_currency text,
  ADD COLUMN IF NOT EXISTS retainer_day_of_month integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retainer_auto_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retainer_next_invoice_at timestamptz,
  ADD COLUMN IF NOT EXISTS retainer_last_invoiced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS projects_proposal_id_unique
  ON public.projects (proposal_id)
  WHERE proposal_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_retainer_due_idx
  ON public.projects (retainer_next_invoice_at)
  WHERE retainer_auto_invoice = true
    AND deleted_at IS NULL
    AND status = 'active';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_retainer_day_of_month_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_retainer_day_of_month_check
  CHECK (retainer_day_of_month BETWEEN 1 AND 28);
