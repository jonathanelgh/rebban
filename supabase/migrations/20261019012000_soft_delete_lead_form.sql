-- Reliable soft-delete for lead forms.
-- PostgREST + SELECT policies that hide deleted_at rows can make
-- client-side updates look like they failed (or return count 0).

CREATE OR REPLACE FUNCTION public.soft_delete_lead_form(p_form_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_id uuid;
BEGIN
  SELECT organization_id
  INTO v_org_id
  FROM public.lead_forms
  WHERE id = p_form_id
    AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.lead_forms
  SET
    deleted_at = now(),
    is_active = false,
    updated_at = now()
  WHERE id = p_form_id
    AND deleted_at IS NULL
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_lead_form(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_lead_form(uuid) TO authenticated;
