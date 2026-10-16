export type BillingInterval = "month" | "year";

export const TRIAL_DAYS = 7;

export const PAID_PLAN = {
  key: "pro",
  name: "Pro",
  tagline: "Everything you need to propose, invoice, and get paid.",
  features: [
    "Unlimited proposals & invoices",
    "Automated payment reminders",
    "Hosted client payment pages",
    "Invoice & proposal tracking",
    "Time tracking to invoice",
    "Gmail / Outlook sending (when connected)",
    "Stripe payouts to your account",
    "Priority email support",
  ],
} as const;

export function formatPlanMoney(amount: number, currency = "USD") {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

export function isPaidSubscriptionStatus(status: string | null | undefined) {
  return (
    status === "active" || status === "trialing" || status === "past_due"
  );
}

export function computeEntitlement(options: {
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const paid = isPaidSubscriptionStatus(options.subscriptionStatus);
  const trialEnds = options.trialEndsAt
    ? new Date(options.trialEndsAt)
    : null;
  const trialActive = Boolean(
    trialEnds && !Number.isNaN(trialEnds.getTime()) && trialEnds.getTime() > now.getTime()
  );
  const entitled = paid || trialActive;

  let trialDaysLeft: number | null = null;
  if (trialActive && trialEnds) {
    trialDaysLeft = Math.max(
      0,
      Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
  }

  return {
    entitled,
    paid,
    trialActive,
    trialExpired: Boolean(trialEnds && !trialActive && !paid),
    trialEndsAt: trialEnds?.toISOString() ?? null,
    trialDaysLeft,
    planLabel: paid ? PAID_PLAN.name : trialActive ? "Trial" : "Free",
  };
}

/** Paths still available when the trial has ended and no plan is active. */
export function isBillingExemptPath(pathname: string) {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return true;
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) return true;
  if (
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  ) {
    return true;
  }
  if (pathname.startsWith("/onboarding")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/p/") || pathname.startsWith("/pay/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  // Home stays reachable so the upgrade prompt can show.
  if (pathname === "/") return true;
  return false;
}
