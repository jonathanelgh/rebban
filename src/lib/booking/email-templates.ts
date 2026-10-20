export type BookingEmailKind = "confirmation" | "reminder_1d" | "reminder_1h";

export type BookingEmailTemplateVars = {
  guest_name: string;
  host_name: string;
  title: string;
  when: string;
  timezone: string;
  where: string;
  meeting_url: string;
  organization: string;
};

export const DEFAULT_BOOKING_EMAIL_SUBJECTS: Record<BookingEmailKind, string> = {
  confirmation: "Looking forward to our {{title}}, {{guest_name}}",
  reminder_1d: "Quick reminder: we meet tomorrow for {{title}}",
  reminder_1h: "See you soon: {{title}} starts in about an hour",
};

export const DEFAULT_BOOKING_EMAIL_BODIES: Record<BookingEmailKind, string> = {
  confirmation:
    "Hi {{guest_name}},\n\nThanks for booking. I'm looking forward to our {{title}}. I've locked in the time below. If anything comes up and you need to reschedule, just reply to this email.\n\nTalk soon,\n{{host_name}}",
  reminder_1d:
    "Hi {{guest_name}},\n\nJust a friendly heads-up that our {{title}} is tomorrow. Looking forward to chatting with you.\n\nSee you then,\n{{host_name}}",
  reminder_1h:
    "Hi {{guest_name}},\n\nQuick note that our {{title}} starts in about an hour. Looking forward to speaking with you shortly. I've included the meeting link again below so you can jump in easily.\n\n{{host_name}}",
};


export const BOOKING_EMAIL_PLACEHOLDER_HINT =
  "Placeholders: {{guest_name}}, {{host_name}}, {{title}}, {{when}}, {{timezone}}, {{where}}, {{meeting_url}}, {{organization}}";

export type BookingEmailSettings = {
  confirmation_email_subject: string | null;
  confirmation_email_body: string | null;
  reminder_1d_enabled: boolean;
  reminder_1d_subject: string | null;
  reminder_1d_body: string | null;
  reminder_1h_enabled: boolean;
  reminder_1h_subject: string | null;
  reminder_1h_body: string | null;
};

export function defaultBookingEmailSettings(): BookingEmailSettings {
  return {
    confirmation_email_subject: DEFAULT_BOOKING_EMAIL_SUBJECTS.confirmation,
    confirmation_email_body: DEFAULT_BOOKING_EMAIL_BODIES.confirmation,
    reminder_1d_enabled: true,
    reminder_1d_subject: DEFAULT_BOOKING_EMAIL_SUBJECTS.reminder_1d,
    reminder_1d_body: DEFAULT_BOOKING_EMAIL_BODIES.reminder_1d,
    reminder_1h_enabled: true,
    reminder_1h_subject: DEFAULT_BOOKING_EMAIL_SUBJECTS.reminder_1h,
    reminder_1h_body: DEFAULT_BOOKING_EMAIL_BODIES.reminder_1h,
  };
}

export function renderBookingEmailTemplate(
  template: string,
  vars: BookingEmailTemplateVars
) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key as keyof BookingEmailTemplateVars];
    return value?.trim() ? value.trim() : "";
  });
}

export function resolveBookingEmailCopy(
  kind: BookingEmailKind,
  settings: Partial<BookingEmailSettings> | null | undefined,
  vars: BookingEmailTemplateVars
) {
  const subjectTemplate =
    (kind === "confirmation"
      ? settings?.confirmation_email_subject
      : kind === "reminder_1d"
        ? settings?.reminder_1d_subject
        : settings?.reminder_1h_subject
    )?.trim() || DEFAULT_BOOKING_EMAIL_SUBJECTS[kind];

  const bodyTemplate =
    (kind === "confirmation"
      ? settings?.confirmation_email_body
      : kind === "reminder_1d"
        ? settings?.reminder_1d_body
        : settings?.reminder_1h_body
    )?.trim() || DEFAULT_BOOKING_EMAIL_BODIES[kind];

  return {
    subject: renderBookingEmailTemplate(subjectTemplate, vars),
    body: renderBookingEmailTemplate(bodyTemplate, vars),
  };
}

export function isBookingReminderEnabled(
  kind: "reminder_1d" | "reminder_1h",
  settings: Partial<BookingEmailSettings> | null | undefined
) {
  if (kind === "reminder_1d") {
    return settings?.reminder_1d_enabled !== false;
  }
  return settings?.reminder_1h_enabled !== false;
}
