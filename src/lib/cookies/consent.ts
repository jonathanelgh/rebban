/**
 * Shared cookie consent for rebban.com + app.rebban.com.
 *
 * Consent is collected on the marketing site (rebban.com). Both sites must
 * read/write the same cookie on Domain=.rebban.com so users are not prompted
 * twice. Shape:
 *
 *   Name: rebban_cookie_consent
 *   Value: encodeURIComponent(JSON.stringify({
 *     version: 1,
 *     necessary: true,
 *     analytics: boolean,
 *     marketing: boolean,
 *     updatedAt: ISO string
 *   }))
 *   Attributes: Domain=.rebban.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure
 */

export const COOKIE_CONSENT_KEY = "rebban_cookie_consent";
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type CookieConsentPreferences = {
  version: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

export type CookieConsentChoice = Omit<
  CookieConsentPreferences,
  "version" | "necessary" | "updatedAt"
>;

export const COOKIE_PREFERENCES_EVENT = "rebban:open-cookie-preferences";

export function openCookiePreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT));
}

function sharedCookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host === "rebban.com" || host.endsWith(".rebban.com")) {
    return ".rebban.com";
  }
  return null;
}

function parseConsent(raw: string): CookieConsentPreferences | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CookieConsentPreferences>;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    if (typeof parsed.analytics !== "boolean") return null;
    if (typeof parsed.marketing !== "boolean") return null;
    return {
      version: COOKIE_CONSENT_VERSION,
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function readDocumentCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function readCookieConsent(): CookieConsentPreferences | null {
  if (typeof window === "undefined") return null;

  const fromCookie = readDocumentCookie(COOKIE_CONSENT_KEY);
  if (fromCookie) {
    const parsed = parseConsent(fromCookie);
    if (parsed) return parsed;
  }

  // One-time migrate from older app-only localStorage (not shared across sites).
  try {
    const legacy = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!legacy) return null;
    const parsed = parseConsent(legacy);
    if (!parsed) return null;
    writeCookieConsent({
      analytics: parsed.analytics,
      marketing: parsed.marketing,
    });
    window.localStorage.removeItem(COOKIE_CONSENT_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function writeCookieConsent(
  choice: CookieConsentChoice
): CookieConsentPreferences {
  const prefs: CookieConsentPreferences = {
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
    updatedAt: new Date().toISOString(),
  };

  if (typeof document !== "undefined") {
    const domain = sharedCookieDomain();
    const parts = [
      `${COOKIE_CONSENT_KEY}=${encodeURIComponent(JSON.stringify(prefs))}`,
      "Path=/",
      `Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}`,
      "SameSite=Lax",
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (window.location.protocol === "https:") parts.push("Secure");
    document.cookie = parts.join("; ");
  }

  return prefs;
}

export function acceptAllCookies(): CookieConsentPreferences {
  return writeCookieConsent({ analytics: true, marketing: true });
}

export function rejectNonEssentialCookies(): CookieConsentPreferences {
  return writeCookieConsent({ analytics: false, marketing: false });
}
