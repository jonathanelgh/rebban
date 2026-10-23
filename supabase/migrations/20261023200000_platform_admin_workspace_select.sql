-- Platform admins can inspect freelancer workspace data in the admin user card.
-- Existing member policies stay in place; Postgres ORs permissive policies.

CREATE POLICY clients_select_platform_admin
  ON public.clients FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY projects_select_platform_admin
  ON public.projects FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY invoices_select_platform_admin
  ON public.invoices FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY proposals_select_platform_admin
  ON public.proposals FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY leads_select_platform_admin
  ON public.leads FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY lead_forms_select_platform_admin
  ON public.lead_forms FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY tasks_select_platform_admin
  ON public.tasks FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY time_entries_select_platform_admin
  ON public.time_entries FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY gmail_connections_select_platform_admin
  ON public.gmail_connections FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY outlook_connections_select_platform_admin
  ON public.outlook_connections FOR SELECT
  USING (public.is_platform_admin());
