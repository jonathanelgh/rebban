-- Map url fields to website; keep string payload validation for select/radio/checkbox.

CREATE OR REPLACE FUNCTION public.submit_public_lead_form(
  p_token text,
  p_payload jsonb,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  form_row public.lead_forms;
  lead_id uuid;
  submission_id uuid;
  v_name text;
  v_email text;
  v_phone text;
  v_company text;
  v_website text;
  v_notes text;
  field jsonb;
  field_id text;
  field_type text;
  field_required boolean;
  field_val text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid submission';
  END IF;

  SELECT * INTO form_row
  FROM public.lead_forms
  WHERE public_token = trim(p_token)
    AND deleted_at IS NULL
    AND is_active = true
  FOR UPDATE;

  IF form_row.id IS NULL THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  FOR field IN SELECT * FROM jsonb_array_elements(COALESCE(form_row.fields, '[]'::jsonb))
  LOOP
    field_id := field->>'id';
    field_type := COALESCE(field->>'type', 'text');
    field_required := COALESCE((field->>'required')::boolean, false);
    field_val := NULLIF(trim(COALESCE(p_payload->>field_id, '')), '');

    IF field_required AND field_val IS NULL THEN
      RAISE EXCEPTION 'Missing required field: %', COALESCE(field->>'label', field_id);
    END IF;

    IF field_id = 'name' OR (field_type = 'text' AND lower(COALESCE(field->>'label', '')) = 'name' AND v_name IS NULL) THEN
      IF v_name IS NULL THEN v_name := field_val; END IF;
    END IF;
    IF field_id = 'email' OR field_type = 'email' THEN
      IF v_email IS NULL THEN v_email := field_val; END IF;
    END IF;
    IF field_id = 'phone' OR field_type = 'tel' THEN
      IF v_phone IS NULL THEN v_phone := field_val; END IF;
    END IF;
    IF field_id = 'company' THEN v_company := field_val; END IF;
    IF field_id = 'website' OR field_type = 'url' THEN
      IF v_website IS NULL THEN v_website := field_val; END IF;
    END IF;
    IF field_id = 'message' OR field_type = 'textarea' THEN
      IF v_notes IS NULL THEN v_notes := field_val; END IF;
    END IF;
  END LOOP;

  v_name := COALESCE(v_name, NULLIF(trim(COALESCE(p_payload->>'name', '')), ''));
  v_email := COALESCE(v_email, NULLIF(trim(COALESCE(p_payload->>'email', '')), ''));
  v_phone := COALESCE(v_phone, NULLIF(trim(COALESCE(p_payload->>'phone', '')), ''));
  v_company := COALESCE(v_company, NULLIF(trim(COALESCE(p_payload->>'company', '')), ''));
  v_website := COALESCE(v_website, NULLIF(trim(COALESCE(p_payload->>'website', '')), ''));
  v_notes := COALESCE(v_notes, NULLIF(trim(COALESCE(p_payload->>'message', p_payload->>'notes', '')), ''));

  IF v_name IS NULL OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  INSERT INTO public.leads (
    organization_id,
    name,
    email,
    phone,
    company,
    website,
    notes,
    status,
    source,
    form_id
  ) VALUES (
    form_row.organization_id,
    v_name,
    v_email,
    v_phone,
    v_company,
    v_website,
    v_notes,
    'new',
    'form',
    form_row.id
  )
  RETURNING id INTO lead_id;

  INSERT INTO public.lead_form_submissions (
    organization_id,
    form_id,
    lead_id,
    payload,
    ip,
    user_agent
  ) VALUES (
    form_row.organization_id,
    form_row.id,
    lead_id,
    p_payload,
    NULLIF(trim(COALESCE(p_ip, '')), ''),
    NULLIF(trim(COALESCE(p_user_agent, '')), '')
  )
  RETURNING id INTO submission_id;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', lead_id,
    'submission_id', submission_id,
    'success_message', form_row.success_message
  );
END;
$function$;
