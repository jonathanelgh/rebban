-- Platform admins can read any org but could not UPDATE them (RLS was
-- org-admin only). That made "Give free Pro" a silent no-op.
DROP POLICY IF EXISTS organizations_update_admin ON public.organizations;

CREATE POLICY organizations_update_admin ON public.organizations
  FOR UPDATE
  USING (public.is_org_admin(id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(id) OR public.is_platform_admin());
