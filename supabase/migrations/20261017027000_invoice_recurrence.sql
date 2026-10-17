-- Recurring / retainer schedule on invoices (source invoice holds the schedule).
DO $$ BEGIN
  CREATE TYPE public.invoice_recurrence_interval AS ENUM (
    'weekly',
    'biweekly',
    'monthly',
    'quarterly'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS recurrence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_interval public.invoice_recurrence_interval,
  ADD COLUMN IF NOT EXISTS recurrence_weekday smallint,
  ADD COLUMN IF NOT EXISTS recurrence_day_of_month smallint,
  ADD COLUMN IF NOT EXISTS recurrence_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_source_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_recurrence_weekday_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_recurrence_weekday_check
  CHECK (recurrence_weekday IS NULL OR recurrence_weekday BETWEEN 0 AND 6);

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_recurrence_day_of_month_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_recurrence_day_of_month_check
  CHECK (
    recurrence_day_of_month IS NULL
    OR recurrence_day_of_month BETWEEN 1 AND 28
  );

CREATE INDEX IF NOT EXISTS invoices_recurrence_due_idx
  ON public.invoices (recurrence_next_at)
  WHERE recurrence_enabled = true
    AND deleted_at IS NULL
    AND recurrence_source_id IS NULL
    AND recurrence_next_at IS NOT NULL;
