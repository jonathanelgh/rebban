import {
  emailDetailCard,
  escapeHtml,
  rebbanEmailLayout,
} from "@/lib/email/brand";
import { getFromEmail, getResend } from "@/lib/email/resend";

const DEFAULT_NOTIFY_TO = "jonathan@rebban.com";

export function lifecycleNotifyTo() {
  return (
    process.env.LIFECYCLE_NOTIFY_EMAIL?.trim() || DEFAULT_NOTIFY_TO
  ).toLowerCase();
}

async function sendLifecycleEmail(options: {
  subject: string;
  title: string;
  bodyHtml: string;
  details: Array<{ label: string; value: string }>;
}) {
  const resend = getResend();
  const html = rebbanEmailLayout({
    preheader: options.subject,
    title: options.title,
    bodyHtml: `
      <p style="margin:0 0 12px;">${options.bodyHtml}</p>
      ${emailDetailCard(options.details)}
    `,
    footerNote: "Internal Rebban notification",
  });

  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: lifecycleNotifyTo(),
    subject: options.subject,
    html,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id || null };
}

export async function notifyNewSignup(options: {
  fullName?: string | null;
  email?: string | null;
  organizationName?: string | null;
  source?: string | null;
}) {
  const name = options.fullName?.trim() || "Someone";
  const email = options.email?.trim() || "unknown";
  const org = options.organizationName?.trim() || "Unknown";
  const source = options.source?.trim() || "signup";

  return sendLifecycleEmail({
    subject: `Celebration! New signup: ${name}`,
    title: "New signup on Rebban",
    bodyHtml: `${escapeHtml(name)} just created an account. Time to celebrate.`,
    details: [
      { label: "Name", value: name },
      { label: "Email", value: email },
      { label: "Workspace", value: org },
      { label: "Source", value: source },
    ],
  });
}

export async function notifyNewSubscription(options: {
  fullName?: string | null;
  email?: string | null;
  organizationName?: string | null;
  organizationId?: string | null;
  planInterval?: string | null;
  subscriptionStatus?: string | null;
}) {
  const name =
    options.fullName?.trim() ||
    options.organizationName?.trim() ||
    "A freelancer";
  const email = options.email?.trim() || "unknown";
  const org = options.organizationName?.trim() || "Unknown";
  const interval =
    options.planInterval === "year"
      ? "Yearly"
      : options.planInterval === "month"
        ? "Monthly"
        : options.planInterval?.trim() || "Pro";
  const status = options.subscriptionStatus?.trim() || "active";

  return sendLifecycleEmail({
    subject: `Celebration! New Pro subscriber: ${name}`,
    title: "New Rebban Pro subscription",
    bodyHtml: `${escapeHtml(name)} just subscribed to Pro (${escapeHtml(interval)}). Big win.`,
    details: [
      { label: "Name", value: name },
      { label: "Email", value: email },
      { label: "Workspace", value: org },
      { label: "Plan", value: interval },
      { label: "Status", value: status },
      ...(options.organizationId
        ? [{ label: "Org ID", value: options.organizationId }]
        : []),
    ],
  });
}
