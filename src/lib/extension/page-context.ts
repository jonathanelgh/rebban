export type ExtensionPageContext = "marketplace" | "email" | "web";

export function detectExtensionPageContext(pageUrl?: string | null): {
  context: ExtensionPageContext;
  platform: "upwork" | "freelancer" | "gmail" | "outlook" | "other";
} {
  let host = "";
  try {
    host = new URL(String(pageUrl || ""))
      .hostname.replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    host = "";
  }

  if (host.includes("upwork.com")) {
    return { context: "marketplace", platform: "upwork" };
  }
  if (host.includes("freelancer.com")) {
    return { context: "marketplace", platform: "freelancer" };
  }
  if (
    host.includes("mail.google.com") ||
    host === "gmail.com" ||
    host.endsWith(".gmail.com")
  ) {
    return { context: "email", platform: "gmail" };
  }
  if (
    host.includes("outlook.live.com") ||
    host.includes("outlook.office.com") ||
    host.includes("outlook.office365.com") ||
    host.includes("mail.yahoo.com") ||
    host.includes("proton.me") ||
    host.includes("mail.proton")
  ) {
    return { context: "email", platform: "outlook" };
  }

  return { context: "web", platform: "other" };
}
