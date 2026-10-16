export type SendBlockReason =
  | "do_not_contact"
  | "invalid_email"
  | "bounced"
  | "not_interested"
  | "already_contacted"
  | "missing_subject"
  | "missing_body";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function initialSendIdempotencyKey(leadId: string) {
  return `initial:${leadId}`;
}

export function canSendInitialOutreach(lead: {
  email: string;
  do_not_contact: boolean;
  bounce_status: string | null;
  outreach_status: string;
  gmail_message_id: string | null;
  last_contacted_at: string | null;
  subject_line: string | null;
  initial_email_body: string | null;
}): { ok: true } | { ok: false; reason: SendBlockReason; message: string } {
  if (lead.do_not_contact) {
    return {
      ok: false,
      reason: "do_not_contact",
      message: "Lead is marked do not contact.",
    };
  }

  const email = lead.email?.trim() || "";
  if (!email || !isValidEmail(email)) {
    return {
      ok: false,
      reason: "invalid_email",
      message: "Lead email is missing or invalid.",
    };
  }

  if (lead.bounce_status === "permanent" || lead.outreach_status === "bounced") {
    return {
      ok: false,
      reason: "bounced",
      message: "Lead email bounced permanently.",
    };
  }

  if (lead.outreach_status === "not_interested") {
    return {
      ok: false,
      reason: "not_interested",
      message: "Lead is marked not interested.",
    };
  }

  if (lead.gmail_message_id || lead.last_contacted_at) {
    return {
      ok: false,
      reason: "already_contacted",
      message: "Initial outreach was already sent for this lead.",
    };
  }

  if (!lead.subject_line?.trim()) {
    return {
      ok: false,
      reason: "missing_subject",
      message: "Subject line is required before sending.",
    };
  }

  if (!lead.initial_email_body?.trim()) {
    return {
      ok: false,
      reason: "missing_body",
      message: "Initial email body is required before sending.",
    };
  }

  return { ok: true };
}
