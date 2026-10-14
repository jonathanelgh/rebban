import { createClient } from "@/lib/supabase/client";

const ORG_ASSETS_BUCKET = "org-assets";

/** Resolve a stored org-assets path (or absolute URL) to a browser-usable URL. */
export function publicOrgAssetUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const supabase = createClient();
  const { data } = supabase.storage.from(ORG_ASSETS_BUCKET).getPublicUrl(pathOrUrl);
  return data.publicUrl || null;
}

export function invoiceBannerStoragePath(organizationId: string, invoiceId: string, ext: string) {
  const safeExt = ext === "jpeg" ? "jpg" : ext;
  return `${organizationId}/invoices/${invoiceId}/banner.${safeExt}`;
}

export { ORG_ASSETS_BUCKET };
