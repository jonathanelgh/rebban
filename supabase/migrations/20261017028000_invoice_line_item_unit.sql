-- Unit for invoice line quantities (qty, hours, days, flat).
DO $$ BEGIN
  CREATE TYPE public.invoice_line_unit AS ENUM ('qty', 'hr', 'day', 'flat');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS unit public.invoice_line_unit NOT NULL DEFAULT 'qty';
