-- Launch hardening:
-- 1) Org write access requires active trial / paid / complimentary Pro
-- 2) Revoke EXECUTE on trigger-only helper
-- 3) Fix mutable search_path on a few triggers
-- 4) Entitlement checks inside member-facing mutator RPCs

CREATE OR REPLACE FUNCTION public.is_org_entitled(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_org_id
      AND (
        COALESCE(o.complimentary_pro, false) = true
        OR o.stripe_subscription_status IN ('active', 'trialing', 'past_due')
        OR (
          o.trial_ends_at IS NOT NULL
          AND o.trial_ends_at > now()
          AND COALESCE(o.complimentary_pro, false) = false
          AND (
            o.stripe_subscription_status IS NULL
            OR o.stripe_subscription_status NOT IN ('active', 'trialing', 'past_due')
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member_entitled(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_member(p_org_id) AND public.is_org_entitled(p_org_id);
$$;

REVOKE ALL ON FUNCTION public.is_org_entitled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_entitled(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_org_member_entitled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member_entitled(uuid) TO authenticated, service_role;

-- Product write policies: membership + entitlement
DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert ON public.clients
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update ON public.clients
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS clients_delete ON public.clients;
CREATE POLICY clients_delete ON public.clients
  FOR DELETE
  USING (public.is_org_admin(organization_id) AND public.is_org_entitled(organization_id));

DROP POLICY IF EXISTS invoices_insert ON public.invoices;
CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS invoices_update ON public.invoices;
CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS invoices_delete ON public.invoices;
CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE
  USING (public.is_org_admin(organization_id) AND public.is_org_entitled(organization_id));

DROP POLICY IF EXISTS invoice_line_items_insert ON public.invoice_line_items;
CREATE POLICY invoice_line_items_insert ON public.invoice_line_items
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS invoice_line_items_update ON public.invoice_line_items;
CREATE POLICY invoice_line_items_update ON public.invoice_line_items
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS invoice_line_items_delete ON public.invoice_line_items;
CREATE POLICY invoice_line_items_delete ON public.invoice_line_items
  FOR DELETE USING (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS invoice_events_insert_member ON public.invoice_events;
CREATE POLICY invoice_events_insert_member ON public.invoice_events
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS invoice_reminders_insert_member ON public.invoice_reminders;
CREATE POLICY invoice_reminders_insert_member ON public.invoice_reminders
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS invoice_reminders_update_member ON public.invoice_reminders;
CREATE POLICY invoice_reminders_update_member ON public.invoice_reminders
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposals_insert ON public.proposals;
CREATE POLICY proposals_insert ON public.proposals
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposals_update ON public.proposals;
CREATE POLICY proposals_update ON public.proposals
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposals_delete ON public.proposals;
CREATE POLICY proposals_delete ON public.proposals
  FOR DELETE
  USING (public.is_org_admin(organization_id) AND public.is_org_entitled(organization_id));

DROP POLICY IF EXISTS proposal_events_insert_member ON public.proposal_events;
CREATE POLICY proposal_events_insert_member ON public.proposal_events
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposal_followups_insert_member ON public.proposal_followups;
CREATE POLICY proposal_followups_insert_member ON public.proposal_followups
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposal_followups_update_member ON public.proposal_followups;
CREATE POLICY proposal_followups_update_member ON public.proposal_followups
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposal_share_links_insert ON public.proposal_share_links;
CREATE POLICY proposal_share_links_insert ON public.proposal_share_links
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposal_share_links_update ON public.proposal_share_links;
CREATE POLICY proposal_share_links_update ON public.proposal_share_links
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS proposal_templates_insert ON public.proposal_templates;
CREATE POLICY proposal_templates_insert ON public.proposal_templates
  FOR INSERT WITH CHECK (
    (NOT is_system)
    AND (organization_id IS NOT NULL)
    AND public.is_org_member_entitled(organization_id)
  );

DROP POLICY IF EXISTS proposal_templates_update ON public.proposal_templates;
CREATE POLICY proposal_templates_update ON public.proposal_templates
  FOR UPDATE
  USING (
    (NOT is_system)
    AND (organization_id IS NOT NULL)
    AND public.is_org_member_entitled(organization_id)
  )
  WITH CHECK (
    (NOT is_system)
    AND (organization_id IS NOT NULL)
    AND public.is_org_member_entitled(organization_id)
  );

DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert ON public.projects
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS projects_update ON public.projects;
CREATE POLICY projects_update ON public.projects
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads
  FOR DELETE
  USING (public.is_org_admin(organization_id) AND public.is_org_entitled(organization_id));

DROP POLICY IF EXISTS lead_forms_insert ON public.lead_forms;
CREATE POLICY lead_forms_insert ON public.lead_forms
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS lead_forms_update ON public.lead_forms;
CREATE POLICY lead_forms_update ON public.lead_forms
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS lead_forms_delete ON public.lead_forms;
CREATE POLICY lead_forms_delete ON public.lead_forms
  FOR DELETE
  USING (public.is_org_admin(organization_id) AND public.is_org_entitled(organization_id));

-- Public form RPC inserts as SECURITY DEFINER; keep member inserts entitled.
DROP POLICY IF EXISTS lead_form_submissions_insert ON public.lead_form_submissions;
CREATE POLICY lead_form_submissions_insert ON public.lead_form_submissions
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE USING (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS task_comments_insert ON public.task_comments;
CREATE POLICY task_comments_insert ON public.task_comments
  FOR INSERT WITH CHECK (
    public.is_org_member_entitled(organization_id) AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS task_comments_update ON public.task_comments;
CREATE POLICY task_comments_update ON public.task_comments
  FOR UPDATE
  USING (
    public.is_org_member_entitled(organization_id)
    AND (author_id = auth.uid() OR public.is_org_admin(organization_id))
  )
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS task_comments_delete ON public.task_comments;
CREATE POLICY task_comments_delete ON public.task_comments
  FOR DELETE USING (
    public.is_org_member_entitled(organization_id)
    AND (author_id = auth.uid() OR public.is_org_admin(organization_id))
  );

DROP POLICY IF EXISTS task_attachments_insert ON public.task_attachments;
CREATE POLICY task_attachments_insert ON public.task_attachments
  FOR INSERT WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS task_attachments_update ON public.task_attachments;
CREATE POLICY task_attachments_update ON public.task_attachments
  FOR UPDATE
  USING (public.is_org_member_entitled(organization_id))
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS task_attachments_delete ON public.task_attachments;
CREATE POLICY task_attachments_delete ON public.task_attachments
  FOR DELETE USING (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS time_entries_insert ON public.time_entries;
CREATE POLICY time_entries_insert ON public.time_entries
  FOR INSERT WITH CHECK (
    public.is_org_member_entitled(organization_id) AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS time_entries_update ON public.time_entries;
CREATE POLICY time_entries_update ON public.time_entries
  FOR UPDATE
  USING (
    public.is_org_member_entitled(organization_id)
    AND (user_id = auth.uid() OR public.is_org_admin(organization_id))
  )
  WITH CHECK (public.is_org_member_entitled(organization_id));

DROP POLICY IF EXISTS time_entries_delete ON public.time_entries;
CREATE POLICY time_entries_delete ON public.time_entries
  FOR DELETE USING (
    public.is_org_member_entitled(organization_id)
    AND (user_id = auth.uid() OR public.is_org_admin(organization_id))
  );

DROP POLICY IF EXISTS audit_events_insert_member ON public.audit_events;
CREATE POLICY audit_events_insert_member ON public.audit_events
  FOR INSERT WITH CHECK (
    organization_id IS NULL OR public.is_org_member_entitled(organization_id)
  );

-- Member-facing mutator RPCs
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
  SELECT organization_id INTO v_org_id
  FROM public.lead_forms
  WHERE id = p_form_id
    AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF NOT public.is_org_entitled(v_org_id) THEN
    RAISE EXCEPTION 'Your free trial has ended. Upgrade to Pro to continue.';
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

  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_org_member(v_org_id) THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
    IF NOT public.is_org_entitled(v_org_id) THEN
      RAISE EXCEPTION 'Your free trial has ended. Upgrade to Pro to continue.';
    END IF;
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

  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_org_member(v_org_id) THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
    IF NOT public.is_org_entitled(v_org_id) THEN
      RAISE EXCEPTION 'Your free trial has ended. Upgrade to Pro to continue.';
    END IF;
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

-- Trigger-only helper must not be callable via PostgREST
REVOKE ALL ON FUNCTION public.lead_forms_confirmation_user_is_org_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_forms_confirmation_user_is_org_member() FROM anon, authenticated;

-- Fix mutable search_path advisories
CREATE OR REPLACE FUNCTION public.set_outreach_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_support_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_crm_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
