export type MarketplaceProfile = {
  services: string;
  experience: string;
  skills: string;
  rates: string;
  portfolio: string;
};

export const EMPTY_MARKETPLACE_PROFILE: MarketplaceProfile = {
  services: "",
  experience: "",
  skills: "",
  rates: "",
  portfolio: "",
};

const MAX_FIELD = 8000;

function cleanField(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, MAX_FIELD);
}

export function asMarketplaceProfile(raw: unknown): MarketplaceProfile {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    services: cleanField(obj.services),
    experience: cleanField(obj.experience),
    skills: cleanField(obj.skills),
    rates: cleanField(obj.rates),
    portfolio: cleanField(obj.portfolio),
  };
}

export function marketplaceProfileHasContent(profile: MarketplaceProfile) {
  return Boolean(
    profile.services ||
      profile.experience ||
      profile.skills ||
      profile.rates ||
      profile.portfolio
  );
}

/** Flatten for the bid-draft AI prompt. */
export function formatMarketplaceProfileForPrompt(
  profile: MarketplaceProfile,
  options?: { includePortfolioLinks?: boolean }
): string {
  const includePortfolioLinks = options?.includePortfolioLinks !== false;
  const parts: string[] = [];
  if (profile.services) {
    parts.push(`What I do / services:\n${profile.services}`);
  }
  if (profile.experience) {
    parts.push(`Experience / CV summary:\n${profile.experience}`);
  }
  if (profile.skills) {
    parts.push(`Skills & stack:\n${profile.skills}`);
  }
  if (profile.rates) {
    parts.push(`Rates & pricing notes:\n${profile.rates}`);
  }
  if (includePortfolioLinks && profile.portfolio) {
    parts.push(
      `Portfolio / proof (only use real links from here):\n${profile.portfolio}`
    );
  }
  return parts.join("\n\n");
}
