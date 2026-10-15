export const ONBOARDING_STEPS = [
  "welcome",
  "profile",
  "invoicing",
  "tax",
  "email",
  "done",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export const COUNTRY_OPTIONS = [
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "DK", label: "Denmark" },
  { code: "FI", label: "Finland" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "NL", label: "Netherlands" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "PT", label: "Portugal" },
  { code: "IE", label: "Ireland" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "OTHER", label: "Other" },
] as const;

export const CURRENCY_OPTIONS = [
  "SEK",
  "NOK",
  "DKK",
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
] as const;

/** Common freelancer / indie-agency industries for onboarding. */
export const INDUSTRY_OPTIONS = [
  { value: "design", label: "Design & Branding" },
  { value: "web_dev", label: "Web Development" },
  { value: "software", label: "Software Engineering" },
  { value: "product", label: "Product Management" },
  { value: "marketing", label: "Marketing & Growth" },
  { value: "content", label: "Content & Copywriting" },
  { value: "video", label: "Video & Motion" },
  { value: "photography", label: "Photography" },
  { value: "illustration", label: "Illustration & Art" },
  { value: "ux_research", label: "UX Research" },
  { value: "consulting", label: "Business Consulting" },
  { value: "strategy", label: "Strategy & Advisory" },
  { value: "finance", label: "Finance & Accounting" },
  { value: "legal", label: "Legal Services" },
  { value: "hr", label: "HR & Recruiting" },
  { value: "coaching", label: "Coaching & Training" },
  { value: "architecture", label: "Architecture & Interior" },
  { value: "engineering", label: "Engineering & Technical" },
  { value: "data", label: "Data & Analytics" },
  { value: "ai_ml", label: "AI & Machine Learning" },
  { value: "devops", label: "DevOps & Cloud" },
  { value: "cybersecurity", label: "Cybersecurity" },
  { value: "sales", label: "Sales & Business Development" },
  { value: "pr", label: "PR & Communications" },
  { value: "social_media", label: "Social Media" },
  { value: "seo", label: "SEO & SEM" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "healthcare", label: "Healthcare & Wellness" },
  { value: "education", label: "Education & EdTech" },
  { value: "music", label: "Music & Audio" },
  { value: "writing", label: "Writing & Journalism" },
  { value: "translation", label: "Translation & Localization" },
  { value: "project_mgmt", label: "Project Management" },
  { value: "other", label: "Other" },
] as const;

export type IndustryValue = (typeof INDUSTRY_OPTIONS)[number]["value"];

export function industryLabel(value: string | null | undefined) {
  if (!value) return null;
  return INDUSTRY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function firstNameFrom(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function normalizeWebsite(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
