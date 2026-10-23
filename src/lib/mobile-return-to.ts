/**
 * Sanitize OAuth returnTo for web paths and the Expo deep link scheme.
 */
export function sanitizeReturnTo(
  returnToRaw: string | null,
  fallback: string
): string {
  if (!returnToRaw) return fallback;

  if (
    returnToRaw.startsWith("/") &&
    !returnToRaw.startsWith("//") &&
    !returnToRaw.includes("://")
  ) {
    return returnToRaw;
  }

  // Native app deep link (rebban://…)
  if (
    returnToRaw.startsWith("rebban://") &&
    !returnToRaw.includes("\\") &&
    returnToRaw.length < 500
  ) {
    return returnToRaw;
  }

  return fallback;
}

export function redirectToReturnTo(appUrl: string, returnTo: string) {
  if (returnTo.startsWith("rebban://")) return returnTo;
  return `${appUrl}${returnTo}`;
}
