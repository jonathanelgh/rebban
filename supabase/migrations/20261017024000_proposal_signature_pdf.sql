-- Store the signed proposal PDF on the signature row for freelancer access.
ALTER TABLE public.proposal_signatures
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_filename text,
  ADD COLUMN IF NOT EXISTS pdf_byte_size integer,
  ADD COLUMN IF NOT EXISTS pdf_stored_at timestamptz;
