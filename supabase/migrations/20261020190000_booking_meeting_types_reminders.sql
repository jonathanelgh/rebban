-- Meeting location/provider on booking links, meeting URL on bookings, reminders.

CREATE TYPE public.booking_location_type AS ENUM ('in_person', 'online');
CREATE TYPE public.booking_online_provider AS ENUM ('google_meet', 'zoom');

ALTER TABLE public.booking_links
  ADD COLUMN IF NOT EXISTS location_type public.booking_location_type NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS online_provider public.booking_online_provider,
  ADD COLUMN IF NOT EXISTS location_details text;

UPDATE public.booking_links
SET online_provider = 'google_meet'
WHERE location_type = 'online' AND online_provider IS NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS location_type public.booking_location_type,
  ADD COLUMN IF NOT EXISTS online_provider public.booking_online_provider,
  ADD COLUMN IF NOT EXISTS location_details text,
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS meeting_id text,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at timestamptz;

CREATE TABLE public.zoom_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  email text NOT NULL,
  zoom_user_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expiry timestamptz NOT NULL,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT zoom_connections_user_unique UNIQUE (user_id)
);

CREATE INDEX zoom_connections_org_idx
  ON public.zoom_connections (organization_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.zoom_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY zoom_connections_select
  ON public.zoom_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY zoom_connections_insert
  ON public.zoom_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY zoom_connections_update
  ON public.zoom_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY zoom_connections_delete
  ON public.zoom_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Update public booking link RPC to include meeting fields
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
