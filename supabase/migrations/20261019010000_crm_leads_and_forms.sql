-- Customer-facing CRM leads + embeddable lead forms (org-scoped).
-- Separate from outreach_* (platform-admin founder outreach).

CREATE TYPE public.lead_status AS ENUM (
  'new',
  'contacted',
  'proposal_sent',
  'won',
  'lost'
);

CREATE OR REPLACE FUNCTION public.set_crm_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.lead_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Contact form',
  public_token text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_message text NOT NULL DEFAULT 'Thanks — we''ll be in touch soon.',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT lead_forms_public_token_unique UNIQUE (public_token)
);

CREATE INDEX lead_forms_org_idx
  ON public.lead_forms (organization_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER lead_forms_updated_at
  BEFORE UPDATE ON public.lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  website text,
  notes text,
  status public.lead_status NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'manual',
  form_id uuid REFERENCES public.lead_forms (id) ON DELETE SET NULL,
  converted_client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals (id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX leads_org_status_idx
  ON public.leads (organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX leads_org_created_idx
  ON public.leads (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX leads_org_email_idx
  ON public.leads (organization_id, lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

CREATE TABLE public.lead_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.lead_forms (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_form_submissions_form_idx
  ON public.lead_form_submissions (form_id, created_at DESC);
CREATE INDEX lead_form_submissions_lead_idx
  ON public.lead_form_submissions (lead_id);

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proposals_lead_id_idx
  ON public.proposals (lead_id)
  WHERE lead_id IS NOT NULL;

-- RLS -----------------------------------------------------------------

ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_forms_select
  ON public.lead_forms FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY lead_forms_insert
  ON public.lead_forms FOR INSERT
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY lead_forms_update
  ON public.lead_forms FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY lead_forms_delete
  ON public.lead_forms FOR DELETE
  USING (is_org_admin(organization_id));

CREATE POLICY leads_select
  ON public.leads FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY leads_insert
  ON public.leads FOR INSERT
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY leads_update
  ON public.leads FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY leads_delete
  ON public.leads FOR DELETE
  USING (is_org_admin(organization_id));

CREATE POLICY lead_form_submissions_select
  ON public.lead_form_submissions FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY lead_form_submissions_insert
  ON public.lead_form_submissions FOR INSERT
  WITH CHECK (is_org_member(organization_id));

-- Public embed RPCs ---------------------------------------------------

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
    'success_message', form_row.success_message,
    'organization', jsonb_build_object(
      'name', org.name,
      'logo_url', org.logo_url
    )
  );
END;
$function$;

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

  -- Validate required fields from schema
  FOR field IN SELECT * FROM jsonb_array_elements(COALESCE(form_row.fields, '[]'::jsonb))
  LOOP
    field_id := field->>'id';
    field_type := COALESCE(field->>'type', 'text');
    field_required := COALESCE((field->>'required')::boolean, false);
    field_val := NULLIF(trim(COALESCE(p_payload->>field_id, '')), '');

    IF field_required AND field_val IS NULL THEN
      RAISE EXCEPTION 'Missing required field: %', COALESCE(field->>'label', field_id);
    END IF;

    IF field_id = 'name' THEN v_name := field_val; END IF;
    IF field_id = 'email' OR field_type = 'email' THEN
      IF v_email IS NULL THEN v_email := field_val; END IF;
    END IF;
    IF field_id = 'phone' OR field_type = 'tel' THEN
      IF v_phone IS NULL THEN v_phone := field_val; END IF;
    END IF;
    IF field_id = 'company' THEN v_company := field_val; END IF;
    IF field_id = 'website' THEN v_website := field_val; END IF;
    IF field_id = 'message' OR field_type = 'textarea' THEN
      IF v_notes IS NULL THEN v_notes := field_val; END IF;
    END IF;
  END LOOP;

  -- Fallbacks from common keys if schema ids differ
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
    NULLIF(left(COALESCE(p_user_agent, ''), 500), '')
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

GRANT EXECUTE ON FUNCTION public.get_public_lead_form(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_lead_form(text, jsonb, text, text) TO anon, authenticated;
