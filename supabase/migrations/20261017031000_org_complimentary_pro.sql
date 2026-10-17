-- Admin-granted Pro access without a Stripe subscription.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS complimentary_pro boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.complimentary_pro IS
  'When true, the org has Pro entitlement without a paid Stripe subscription.';
