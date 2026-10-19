-- Security hardening:
-- 1) confirmation_email_user_id must be an org member
-- 2) Lock down cron claim RPCs to service_role
-- 3) Authz inside cancel_* / create_user_notification
-- 4) Revoke unintended anon EXECUTE grants

-- ---------------------------------------------------------------------------
-- 1) Lead form confirmation mailbox must belong to the form's org
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lead_forms_confirmation_user_is_org_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.confirmation_email_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.confirmation_email_user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'confirmation_email_user_id must be an active member of the form organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_forms_confirmation_user_check ON public.lead_forms;
CREATE TRIGGER lead_forms_confirmation_user_check
  BEFORE INSERT OR UPDATE OF confirmation_email_user_id, organization_id
  ON public.lead_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.lead_forms_confirmation_user_is_org_member();

-- Clear any existing invalid pointers (defensive).
UPDATE public.lead_forms f
SET confirmation_email_user_id = NULL
WHERE confirmation_email_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = f.organization_id
      AND m.user_id = f.confirmation_email_user_id
      AND m.status = 'active'
  );

-- ---------------------------------------------------------------------------
-- 2) Cron claim helpers: service_role only
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_due_invoice_reminders(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_invoice_reminders(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_invoice_reminders(integer) TO service_role;

REVOKE ALL ON FUNCTION public.claim_due_proposal_followups(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_proposal_followups(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_proposal_followups(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Cancel helpers: require org membership when called by a user session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_invoice_reminders(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- service_role / no JWT: allow. Authenticated callers must be org members.
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.invoice_reminders
  SET status = 'cancelled',
      updated_at = now()
  WHERE invoice_id = p_invoice_id
    AND status IN ('pending', 'processing');

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_proposal_followups(p_proposal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.proposals
  WHERE id = p_proposal_id
    AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.proposal_followups
  SET status = 'cancelled',
      updated_at = now()
  WHERE proposal_id = p_proposal_id
    AND status IN ('pending', 'processing');

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invoice_reminders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_invoice_reminders(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_reminders(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_proposal_followups(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_proposal_followups(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_proposal_followups(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Notifications: org membership + recipient must belong to org
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_org_member(p_organization_id) THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = p_user_id
        AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Notification recipient must be an org member';
    END IF;
  END IF;

  INSERT INTO public.notifications (
    organization_id, user_id, type, title, body, link, entity_type, entity_id
  ) VALUES (
    p_organization_id, p_user_id, p_type, p_title, p_body, p_link, p_entity_type, p_entity_id
  )
  RETURNING id INTO nid;

  RETURN nid;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_notification(uuid, uuid, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_user_notification(uuid, uuid, text, text, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_user_notification(uuid, uuid, text, text, text, text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Soft-delete lead form: authenticated only (already org-checked inside)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.soft_delete_lead_form(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_lead_form(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_lead_form(uuid) TO authenticated, service_role;
