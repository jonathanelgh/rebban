-- Native scheduling: availability, booking links, and public bookings.

CREATE TYPE public.booking_status AS ENUM (
  'scheduled',
  'cancelled',
  'completed'
);

CREATE OR REPLACE FUNCTION public.set_booking_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.booking_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Europe/Stockholm',
  slot_interval_minutes integer NOT NULL DEFAULT 30
    CHECK (slot_interval_minutes IN (15, 30, 60)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER booking_settings_updated_at
  BEFORE UPDATE ON public.booking_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_updated_at();

-- weekday: 0 = Monday … 6 = Sunday (ISO)
CREATE TABLE public.booking_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_availability_time_check CHECK (start_time < end_time)
);

CREATE INDEX booking_availability_org_weekday_idx
  ON public.booking_availability (organization_id, weekday);

CREATE TABLE public.booking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  public_token text NOT NULL,
  title text NOT NULL,
  description text,
  duration_minutes integer NOT NULL
    CHECK (duration_minutes IN (15, 30, 45, 60, 90, 120)),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT booking_links_public_token_unique UNIQUE (public_token)
);

CREATE INDEX booking_links_org_idx
  ON public.booking_links (organization_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER booking_links_updated_at
  BEFORE UPDATE ON public.booking_links
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_updated_at();

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  booking_link_id uuid NOT NULL REFERENCES public.booking_links (id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_notes text,
  status public.booking_status NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_time_check CHECK (starts_at < ends_at)
);

CREATE INDEX bookings_org_starts_idx
  ON public.bookings (organization_id, starts_at)
  WHERE status = 'scheduled';

CREATE INDEX bookings_link_starts_idx
  ON public.bookings (booking_link_id, starts_at)
  WHERE status = 'scheduled';

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_updated_at();

-- Prevent overlapping scheduled bookings for the same org
CREATE OR REPLACE FUNCTION public.bookings_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'scheduled' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.organization_id = NEW.organization_id
      AND b.status = 'scheduled'
      AND b.id IS DISTINCT FROM NEW.id
      AND b.starts_at < NEW.ends_at
      AND b.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'That time is no longer available';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_no_overlap_trg
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_no_overlap();

-- RLS -----------------------------------------------------------------

ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_settings_select
  ON public.booking_settings FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY booking_settings_insert
  ON public.booking_settings FOR INSERT
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY booking_settings_update
  ON public.booking_settings FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY booking_availability_select
  ON public.booking_availability FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY booking_availability_insert
  ON public.booking_availability FOR INSERT
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY booking_availability_update
  ON public.booking_availability FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY booking_availability_delete
  ON public.booking_availability FOR DELETE
  USING (is_org_member(organization_id));

CREATE POLICY booking_links_select
  ON public.booking_links FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY booking_links_insert
  ON public.booking_links FOR INSERT
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY booking_links_update
  ON public.booking_links FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY bookings_select
  ON public.bookings FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY bookings_update
  ON public.bookings FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- Public RPCs ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_booking_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  link_row public.booking_links;
  org public.organizations;
  settings public.booking_settings;
  availability jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Booking link not found';
  END IF;

  SELECT * INTO link_row
  FROM public.booking_links
  WHERE public_token = trim(p_token)
    AND deleted_at IS NULL
    AND is_active = true;

  IF link_row.id IS NULL THEN
    RAISE EXCEPTION 'Booking link not found';
  END IF;

  SELECT * INTO org FROM public.organizations WHERE id = link_row.organization_id;

  SELECT * INTO settings
  FROM public.booking_settings
  WHERE organization_id = link_row.organization_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'weekday', a.weekday,
      'start_time', to_char(a.start_time, 'HH24:MI'),
      'end_time', to_char(a.end_time, 'HH24:MI')
    )
    ORDER BY a.weekday, a.start_time
  ), '[]'::jsonb)
  INTO availability
  FROM public.booking_availability a
  WHERE a.organization_id = link_row.organization_id;

  RETURN jsonb_build_object(
    'token', link_row.public_token,
    'title', link_row.title,
    'description', link_row.description,
    'duration_minutes', link_row.duration_minutes,
    'timezone', COALESCE(settings.timezone, 'Europe/Stockholm'),
    'slot_interval_minutes', COALESCE(settings.slot_interval_minutes, 30),
    'availability', availability,
    'organization', jsonb_build_object(
      'name', org.name,
      'logo_url', org.logo_url
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_booking_busy(
  p_token text,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  link_row public.booking_links;
  busy jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Booking link not found';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'Invalid range';
  END IF;

  SELECT * INTO link_row
  FROM public.booking_links
  WHERE public_token = trim(p_token)
    AND deleted_at IS NULL
    AND is_active = true;

  IF link_row.id IS NULL THEN
    RAISE EXCEPTION 'Booking link not found';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'starts_at', b.starts_at,
      'ends_at', b.ends_at
    )
    ORDER BY b.starts_at
  ), '[]'::jsonb)
  INTO busy
  FROM public.bookings b
  WHERE b.organization_id = link_row.organization_id
    AND b.status = 'scheduled'
    AND b.starts_at < p_to
    AND b.ends_at > p_from;

  RETURN busy;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_token text,
  p_starts_at timestamptz,
  p_guest_name text,
  p_guest_email text,
  p_guest_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  link_row public.booking_links;
  ends_at timestamptz;
  booking_id uuid;
  v_name text;
  v_email text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Booking link not found';
  END IF;

  v_name := NULLIF(trim(COALESCE(p_guest_name, '')), '');
  v_email := lower(NULLIF(trim(COALESCE(p_guest_email, '')), ''));

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;
  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'Start time is required';
  END IF;
  IF p_starts_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'That time is in the past';
  END IF;

  SELECT * INTO link_row
  FROM public.booking_links
  WHERE public_token = trim(p_token)
    AND deleted_at IS NULL
    AND is_active = true
  FOR UPDATE;

  IF link_row.id IS NULL THEN
    RAISE EXCEPTION 'Booking link not found';
  END IF;

  ends_at := p_starts_at + make_interval(mins => link_row.duration_minutes);

  INSERT INTO public.bookings (
    organization_id,
    booking_link_id,
    starts_at,
    ends_at,
    guest_name,
    guest_email,
    guest_notes,
    status
  ) VALUES (
    link_row.organization_id,
    link_row.id,
    p_starts_at,
    ends_at,
    v_name,
    v_email,
    NULLIF(trim(COALESCE(p_guest_notes, '')), ''),
    'scheduled'
  )
  RETURNING id INTO booking_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', booking_id,
    'starts_at', p_starts_at,
    'ends_at', ends_at,
    'title', link_row.title,
    'duration_minutes', link_row.duration_minutes
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_booking_link(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_busy(text, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, timestamptz, text, text, text) TO anon, authenticated;
