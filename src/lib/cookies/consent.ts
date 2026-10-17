export const COOKIE_CONSENT_KEY = "rebban_cookie_consent";
export const COOKIE_CONSENT_VERSION = 1;

export type CookieConsentPreferences = {
  version: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

export type CookieConsentChoice = Omit<CookieConsentPreferences, "version" | "necessary" | "updatedAt">;

export const COOKIE_PREFERENCES_EVENT = "rebban:open-cookie-preferences";

export function openCookiePreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT));
}

export function readCookieConsent(): CookieConsentPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
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
  if (typeof window !== "undefined") {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefs));
  }
  return prefs;
}

export function acceptAllCookies(): CookieConsentPreferences {
  return writeCookieConsent({ analytics: true, marketing: true });
}

export function rejectNonEssentialCookies(): CookieConsentPreferences {
  return writeCookieConsent({ analytics: false, marketing: false });
}
