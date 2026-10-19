export type LeadSourceRow = {
  id: string;
  name: string;
  icon: string | null;
  image_url: string | null;
  keywords: string[];
  sort_order: number;
  is_active: boolean;
};

/** Fallback catalog if the DB table isn't loaded yet. */
export const FALLBACK_LEAD_SOURCES: LeadSourceRow[] = [
  {
    id: "website",
    name: "Website",
    icon: "website",
    image_url: null,
    keywords: ["web", "site", "organic"],
    sort_order: 10,
    is_active: true,
  },
  {
    id: "form",
    name: "Website form",
    icon: "form",
    image_url: null,
    keywords: ["embed", "lead form", "contact form"],
    sort_order: 20,
    is_active: true,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "whatsapp",
    image_url: null,
    keywords: ["wa", "chat", "message"],
    sort_order: 30,
    is_active: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: "instagram",
    image_url: null,
    keywords: ["ig", "reels", "dm"],
    sort_order: 40,
    is_active: true,
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: "facebook",
    image_url: null,
    keywords: ["fb", "meta", "messenger"],
    sort_order: 50,
    is_active: true,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: "linkedin",
    image_url: null,
    keywords: ["li", "professional"],
    sort_order: 60,
    is_active: true,
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    icon: "twitter",
    image_url: null,
    keywords: ["x", "tweet", "twitter"],
    sort_order: 70,
    is_active: true,
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: "tiktok",
    image_url: null,
    keywords: ["tt", "short video"],
    sort_order: 80,
    is_active: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "youtube",
    image_url: null,
    keywords: ["yt", "video"],
    sort_order: 90,
    is_active: true,
  },
  {
    id: "google",
    name: "Google",
    icon: "google",
    image_url: null,
    keywords: ["ads", "search", "seo", "gmb"],
    sort_order: 100,
    is_active: true,
  },
  {
    id: "email",
    name: "Email",
    icon: "email",
    image_url: null,
    keywords: ["mail", "inbox"],
    sort_order: 110,
    is_active: true,
  },
  {
    id: "phone",
    name: "Phone",
    icon: "phone",
    image_url: null,
    keywords: ["call", "mobile", "tel"],
    sort_order: 120,
    is_active: true,
  },
  {
    id: "referral",
    name: "Referral",
    icon: "referral",
    image_url: null,
    keywords: ["word of mouth", "recommend", "intro"],
    sort_order: 130,
    is_active: true,
  },
  {
    id: "event",
    name: "Event / networking",
    icon: "event",
    image_url: null,
    keywords: ["meetup", "conference", "networking"],
    sort_order: 140,
    is_active: true,
  },
  {
    id: "manual",
    name: "Manual entry",
    icon: "manual",
    image_url: null,
    keywords: ["added", "internal"],
    sort_order: 150,
    is_active: true,
  },
  {
    id: "other",
    name: "Other",
    icon: "other",
    image_url: null,
    keywords: ["misc", "unknown"],
    sort_order: 160,
    is_active: true,
  },
];

export function normalizeLeadSourceRow(raw: {
  id: string;
  name: string;
  icon?: string | null;
  image_url?: string | null;
  keywords?: string[] | null;
  sort_order?: number | null;
  is_active?: boolean | null;
}): LeadSourceRow {
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon || null,
    image_url: raw.image_url || null,
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    sort_order: raw.sort_order ?? 100,
    is_active: raw.is_active !== false,
  };
}

export function findLeadSource(
  sources: LeadSourceRow[],
  id: string
): LeadSourceRow | null {
  return sources.find((source) => source.id === id) || null;
}

export function leadSourceLabel(
  sources: LeadSourceRow[],
  id: string
): string {
  return findLeadSource(sources, id)?.name || id || "Other";
}

export function resolveLeadSource(
  sources: LeadSourceRow[],
  id: string
): LeadSourceRow {
  return (
    findLeadSource(sources, id) || {
      id: id || "other",
      name: id || "Other",
      icon: "other",
      image_url: null,
      keywords: [],
      sort_order: 999,
      is_active: true,
    }
  );
}
