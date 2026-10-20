-- Host-created meetings (no public booking link) + org member insert.

ALTER TABLE public.bookings
  ALTER COLUMN booking_link_id DROP NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN public.bookings.title IS
  'Optional display title for host-created meetings; falls back to booking_links.title when set.';

CREATE POLICY bookings_insert
  ON public.bookings FOR INSERT
  WITH CHECK (is_org_member(organization_id));
