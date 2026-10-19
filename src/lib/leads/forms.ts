import type { CSSProperties } from "react";
import { nanoid } from "nanoid";

export const LEAD_FORM_FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "terms",
] as const;

export type LeadFormFieldType = (typeof LEAD_FORM_FIELD_TYPES)[number];

export type LeadFormFieldOption = {
  id: string;
  label: string;
};

export type LeadFormFieldStyle = {
  labelColor?: string;
  labelSize?: number;
  inputBg?: string;
  inputBorder?: string;
  inputText?: string;
  inputRadius?: number;
};

export type LeadFormField = {
  id: string;
  type: LeadFormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: LeadFormFieldOption[];
  /** Used by `terms` — terms of service URL. */
  termsUrl?: string;
  /** Used by `terms` — terms link text (e.g. Terms). */
  termsLabel?: string;
  /** Used by `terms` — privacy policy URL. */
  privacyUrl?: string;
  /** Used by `terms` — privacy link text (e.g. Privacy Policy). */
  privacyLabel?: string;
  /** @deprecated Prefer privacyUrl — kept for older saved forms. */
  linkUrl?: string;
  /** @deprecated Prefer privacyLabel — kept for older saved forms. */
  linkLabel?: string;
  style?: LeadFormFieldStyle;
};

export type LeadFormTheme = {
  pageBg?: string;
  cardBg?: string;
  cardBorder?: string;
  cardBorderWidth?: number;
  cardRadius?: number;
  cardPadding?: number;
  accentColor?: string;
  titleColor?: string;
  titleSize?: number;
  subtitleColor?: string;
  labelColor?: string;
  labelSize?: number;
  inputBg?: string;
  inputBorder?: string;
  inputText?: string;
  inputRadius?: number;
  buttonBg?: string;
  buttonText?: string;
  buttonRadius?: number;
  buttonLabel?: string;
};

export const LEAD_FIELD_DRAG_TYPE = "application/x-lead-field-type";
export const LEAD_FIELD_REORDER_TYPE = "application/x-lead-field-id";

export type LeadFormSelection =
  | { type: "card" }
  | { type: "title" }
  | { type: "field"; fieldId: string }
  | { type: "button" };

export const DEFAULT_LEAD_FORM_THEME: Required<
  Pick<
    LeadFormTheme,
    | "pageBg"
    | "cardBg"
    | "cardBorder"
    | "cardBorderWidth"
    | "cardRadius"
    | "cardPadding"
    | "accentColor"
    | "titleColor"
    | "titleSize"
    | "subtitleColor"
    | "labelColor"
    | "labelSize"
    | "inputBg"
    | "inputBorder"
    | "inputText"
    | "inputRadius"
    | "buttonBg"
    | "buttonText"
    | "buttonRadius"
    | "buttonLabel"
  >
> = {
  pageBg: "#F0F1F3",
  cardBg: "#FFFFFF",
  cardBorder: "#E5E7EB",
  cardBorderWidth: 1,
  cardRadius: 24,
  cardPadding: 32,
  accentColor: "#2563EB",
  titleColor: "#111827",
  titleSize: 20,
  subtitleColor: "#9CA3AF",
  labelColor: "#374151",
  labelSize: 13,
  inputBg: "#FFFFFF",
  inputBorder: "#E5E7EB",
  inputText: "#111827",
  inputRadius: 12,
  buttonBg: "#2563EB",
  buttonText: "#FFFFFF",
  buttonRadius: 12,
  buttonLabel: "Send",
};

export const DEFAULT_LEAD_FORM_FIELDS: LeadFormField[] = [
  {
    id: "name",
    type: "text",
    label: "Name",
    required: true,
    placeholder: "Your name",
  },
  {
    id: "email",
    type: "email",
    label: "Email",
    required: true,
    placeholder: "you@company.com",
  },
  {
    id: "company",
    type: "text",
    label: "Company",
    required: false,
    placeholder: "Company name",
  },
  {
    id: "message",
    type: "textarea",
    label: "Message",
    required: false,
    placeholder: "How can we help?",
  },
];

export type LeadFormFieldPaletteItem = {
  type: LeadFormFieldType;
  label: string;
  description: string;
};

export const LEAD_FORM_FIELD_PALETTE: LeadFormFieldPaletteItem[] = [
  { type: "text", label: "Text", description: "Single-line text" },
  { type: "email", label: "Email", description: "Email address" },
  { type: "tel", label: "Phone", description: "Phone number" },
  { type: "textarea", label: "Long text", description: "Multi-line message" },
  { type: "select", label: "Dropdown", description: "Pick one option" },
  { type: "radio", label: "Radio", description: "Choose one" },
  { type: "checkbox", label: "Checkboxes", description: "Pick one or more" },
  {
    type: "terms",
    label: "Terms",
    description: "Consent checkbox with privacy link",
  },
  { type: "number", label: "Number", description: "Numeric input" },
  { type: "date", label: "Date", description: "Date picker" },
  { type: "url", label: "Website", description: "URL field" },
];

export const LEAD_FORM_FIELD_TYPE_LABELS: Record<LeadFormFieldType, string> = {
  text: "Text",
  email: "Email",
  tel: "Phone",
  url: "Website",
  number: "Number",
  date: "Date",
  textarea: "Long text",
  select: "Dropdown",
  radio: "Radio",
  checkbox: "Checkboxes",
  terms: "Terms / privacy",
};

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "proposal_sent",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

export function newLeadFormToken() {
  return nanoid(24);
}

export function newLeadFormFieldId() {
  return `field_${nanoid(10)}`;
}

export function newLeadFormOptionId() {
  return `opt_${nanoid(8)}`;
}

export function fieldNeedsOptions(type: LeadFormFieldType) {
  return type === "select" || type === "radio" || type === "checkbox";
}

export function defaultOptionsForType(
  type: LeadFormFieldType
): LeadFormFieldOption[] | undefined {
  if (!fieldNeedsOptions(type)) return undefined;
  return [
    { id: newLeadFormOptionId(), label: "Option 1" },
    { id: newLeadFormOptionId(), label: "Option 2" },
    { id: newLeadFormOptionId(), label: "Option 3" },
  ];
}

export function createLeadFormField(type: LeadFormFieldType): LeadFormField {
  const meta = LEAD_FORM_FIELD_PALETTE.find((item) => item.type === type);
  const label = type === "terms" ? "I agree to the" : meta?.label || "Field";
  const field: LeadFormField = {
    id: newLeadFormFieldId(),
    type,
    label,
    required: type === "terms" ? true : false,
    placeholder:
      type === "textarea"
        ? "Type here…"
        : type === "email"
          ? "you@company.com"
          : type === "tel"
            ? "+1 555 000 0000"
            : type === "url"
              ? "https://"
              : type === "select" ||
                  type === "radio" ||
                  type === "checkbox" ||
                  type === "terms"
                ? undefined
                : `Enter ${label.toLowerCase()}`,
    options: defaultOptionsForType(type),
    termsUrl: type === "terms" ? "https://" : undefined,
    termsLabel: type === "terms" ? "Terms" : undefined,
    privacyUrl: type === "terms" ? "https://" : undefined,
    privacyLabel: type === "terms" ? "Privacy Policy" : undefined,
  };
  return field;
}

export function normalizeLeadFormFields(raw: unknown): LeadFormField[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_LEAD_FORM_FIELDS;
  return raw.map((item) => {
    if (!item || typeof item !== "object") {
      return createLeadFormField("text");
    }
    const rec = item as Record<string, unknown>;
    const type = (
      LEAD_FORM_FIELD_TYPES.includes(rec.type as LeadFormFieldType)
        ? rec.type
        : "text"
    ) as LeadFormFieldType;
    const options = Array.isArray(rec.options)
      ? rec.options
          .map((opt) => {
            if (!opt || typeof opt !== "object") return null;
            const o = opt as Record<string, unknown>;
            const id =
              typeof o.id === "string" && o.id
                ? o.id
                : newLeadFormOptionId();
            const label =
              typeof o.label === "string" && o.label.trim()
                ? o.label.trim()
                : "Option";
            return { id, label } satisfies LeadFormFieldOption;
          })
          .filter(Boolean) as LeadFormFieldOption[]
      : undefined;

    return {
      id:
        typeof rec.id === "string" && rec.id
          ? rec.id
          : newLeadFormFieldId(),
      type,
      label:
        typeof rec.label === "string" && rec.label.trim()
          ? rec.label.trim()
          : LEAD_FORM_FIELD_TYPE_LABELS[type],
      required: Boolean(rec.required),
      placeholder:
        typeof rec.placeholder === "string" ? rec.placeholder : undefined,
      options: fieldNeedsOptions(type)
        ? options && options.length > 0
          ? options
          : defaultOptionsForType(type)
        : undefined,
      termsUrl:
        type === "terms"
          ? typeof rec.termsUrl === "string"
            ? rec.termsUrl
            : "https://"
          : undefined,
      termsLabel:
        type === "terms"
          ? typeof rec.termsLabel === "string" && rec.termsLabel.trim()
            ? rec.termsLabel.trim()
            : "Terms"
          : undefined,
      privacyUrl:
        type === "terms"
          ? typeof rec.privacyUrl === "string"
            ? rec.privacyUrl
            : typeof rec.linkUrl === "string"
              ? rec.linkUrl
              : "https://"
          : undefined,
      privacyLabel:
        type === "terms"
          ? typeof rec.privacyLabel === "string" && rec.privacyLabel.trim()
            ? rec.privacyLabel.trim()
            : typeof rec.linkLabel === "string" && rec.linkLabel.trim()
              ? rec.linkLabel.trim()
              : "Privacy Policy"
          : undefined,
      style:
        rec.style && typeof rec.style === "object"
          ? (rec.style as LeadFormFieldStyle)
          : undefined,
    } satisfies LeadFormField;
  });
}

export function leadFormEmbedSnippet(appUrl: string, token: string) {
  const base = appUrl.replace(/\/$/, "");
  const src = `${base}/f/${token}`;
  return `<iframe src="${src}" title="Contact form" style="width:100%;min-height:520px;border:0;border-radius:16px;" loading="lazy"></iframe>`;
}

export function normalizeLeadFormTheme(
  theme: LeadFormTheme | null | undefined
): typeof DEFAULT_LEAD_FORM_THEME {
  return { ...DEFAULT_LEAD_FORM_THEME, ...(theme || {}) };
}

export function fieldInputStyle(
  theme: typeof DEFAULT_LEAD_FORM_THEME,
  field?: LeadFormField
): CSSProperties {
  const style = field?.style;
  return {
    backgroundColor: style?.inputBg || theme.inputBg,
    borderColor: style?.inputBorder || theme.inputBorder,
    color: style?.inputText || theme.inputText,
    borderRadius: `${style?.inputRadius ?? theme.inputRadius}px`,
  };
}

export function fieldLabelStyle(
  theme: typeof DEFAULT_LEAD_FORM_THEME,
  field?: LeadFormField
): CSSProperties {
  const style = field?.style;
  return {
    color: style?.labelColor || theme.labelColor,
    fontSize: `${style?.labelSize ?? theme.labelSize}px`,
  };
}

export function parseCheckboxValues(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function serializeCheckboxValues(values: string[]) {
  return values.join(",");
}
