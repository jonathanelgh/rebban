export type LeadFormConfirmationVia = "rebban" | "connected";

export const DEFAULT_CONFIRMATION_EMAIL_SUBJECT = "Thanks for reaching out";

export const DEFAULT_CONFIRMATION_EMAIL_BODY = `Hi {{name}},

Thanks for getting in touch. We received your message and will get back to you soon.

Best`;

export function normalizeConfirmationVia(
  value: string | null | undefined
): LeadFormConfirmationVia {
  return value === "connected" ? "connected" : "rebban";
}

export function renderConfirmationTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value?.trim() ? value.trim() : "";
  });
}

export function extractSubmitterEmail(values: Record<string, string>) {
  const direct = values.email?.trim();
  if (direct && direct.includes("@")) return direct;

  for (const [key, value] of Object.entries(values)) {
    if (!value?.trim()) continue;
    if (key.toLowerCase().includes("email") && value.includes("@")) {
      return value.trim();
    }
  }
  return null;
}

export function extractSubmitterName(values: Record<string, string>) {
  return (
    values.name?.trim() ||
    values.full_name?.trim() ||
    values.fullName?.trim() ||
    null
  );
}
