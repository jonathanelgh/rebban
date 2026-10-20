-- Expose booking host profile (name + avatar) on public booking links.

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
    'timezone', COALESCE(settings.timezone, 'Europe/Stockholm'),
    'slot_interval_minutes', COALESCE(settings.slot_interval_minutes, 30),
    'availability', availability,
    'host', jsonb_build_object(
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
