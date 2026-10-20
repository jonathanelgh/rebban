-- Copy meeting location onto bookings at create time, and expose host id publicly.

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
    status,
    title,
    location_type,
    online_provider,
    location_details
  ) VALUES (
    link_row.organization_id,
    link_row.id,
    p_starts_at,
    ends_at,
    v_name,
    v_email,
    NULLIF(trim(COALESCE(p_guest_notes, '')), ''),
    'scheduled',
    link_row.title,
    link_row.location_type,
    link_row.online_provider,
    link_row.location_details
  )
  RETURNING id INTO booking_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', booking_id,
    'starts_at', p_starts_at,
    'ends_at', ends_at,
    'title', link_row.title,
    'duration_minutes', link_row.duration_minutes,
    'location_type', link_row.location_type,
    'online_provider', link_row.online_provider,
    'location_details', link_row.location_details,
    'created_by', link_row.created_by
  );
END;
$function$;

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
  host_id uuid;
  host_name text;
  host_avatar text;
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

  host_id := link_row.created_by;
  IF host_id IS NULL THEN
    SELECT om.user_id INTO host_id
    FROM public.organization_members om
    WHERE om.organization_id = link_row.organization_id
      AND om.status = 'active'
      AND om.role = 'owner'
    LIMIT 1;
  END IF;

  IF host_id IS NOT NULL THEN
    SELECT p.full_name, p.avatar_url
    INTO host_name, host_avatar
    FROM public.profiles p
    WHERE p.id = host_id;
  END IF;

  RETURN jsonb_build_object(
    'token', link_row.public_token,
    'title', link_row.title,
    'description', link_row.description,
    'duration_minutes', link_row.duration_minutes,
    'location_type', link_row.location_type,
    'online_provider', link_row.online_provider,
    'location_details', link_row.location_details,
    'timezone', COALESCE(settings.timezone, 'Europe/Stockholm'),
    'slot_interval_minutes', COALESCE(settings.slot_interval_minutes, 30),
    'availability', availability,
    'host', jsonb_build_object(
      'id', host_id,
      'name', host_name,
      'avatar_path', host_avatar
    ),
    'organization', jsonb_build_object(
      'name', org.name,
      'logo_url', org.logo_url
    )
  );
END;
$function$;
