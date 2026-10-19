-- Theme JSON for lead form styling (click-to-edit builder).

ALTER TABLE public.lead_forms
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_public_lead_form(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  form_row public.lead_forms;
  org public.organizations;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  SELECT * INTO form_row
  FROM public.lead_forms
  WHERE public_token = trim(p_token)
    AND deleted_at IS NULL
    AND is_active = true;

  IF form_row.id IS NULL THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  SELECT * INTO org FROM public.organizations WHERE id = form_row.organization_id;

  RETURN jsonb_build_object(
    'token', form_row.public_token,
    'name', form_row.name,
    'fields', form_row.fields,
    'theme', COALESCE(form_row.theme, '{}'::jsonb),
    'success_message', form_row.success_message,
    'organization', jsonb_build_object(
      'name', org.name,
      'logo_url', org.logo_url
    )
  );
END;
$function$;
