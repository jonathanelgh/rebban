import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getReceiptInboundDomain } from "./constants";
import { generateInboxToken, hashInboxToken } from "./hash";

type Db = SupabaseClient<Database>;

export function buildReceiptDisplayAddress(token: string) {
  const domain = getReceiptInboundDomain();
  return `receipts+${token}@${domain}`;
}

/** Extract inbox token from a To / Received-For address. */
export function extractInboxTokenFromAddress(address: string | null | undefined) {
  if (!address) return null;
  const email = address.trim().toLowerCase();
  const match =
    email.match(/^receipts\+([a-z0-9_-]+)@/i) ||
    email.match(/^([a-z0-9_-]+)@/i);
  return match?.[1] || null;
}

export async function getActiveReceiptInbox(
  db: Db,
  organizationId: string
) {
  const { data, error } = await db
    .from("receipt_inboxes")
    .select("id, organization_id, display_address, active, created_at, rotated_at")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function addressUsesCurrentDomain(displayAddress: string) {
  const domain = getReceiptInboundDomain().toLowerCase();
  return displayAddress.trim().toLowerCase().endsWith(`@${domain}`);
}

/** Keep token; rewrite display address when inbound domain changes. */
async function syncInboxDisplayDomain(
  db: Db,
  inbox: {
    id: string;
    organization_id: string;
    display_address: string;
    active: boolean;
    created_at: string;
    rotated_at: string | null;
  }
) {
  if (addressUsesCurrentDomain(inbox.display_address)) return inbox;

  const token = extractInboxTokenFromAddress(inbox.display_address);
  if (!token) return inbox;

  const displayAddress = buildReceiptDisplayAddress(token);
  const { data, error } = await db
    .from("receipt_inboxes")
    .update({ display_address: displayAddress })
    .eq("id", inbox.id)
    .select("id, organization_id, display_address, active, created_at, rotated_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function ensureReceiptInbox(
  db: Db,
  organizationId: string,
  userId: string | null
) {
  const existing = await getActiveReceiptInbox(db, organizationId);
  if (existing) {
    return syncInboxDisplayDomain(db, existing);
  }

  const token = generateInboxToken();
  const displayAddress = buildReceiptDisplayAddress(token);
  const { data, error } = await db
    .from("receipt_inboxes")
    .insert({
      organization_id: organizationId,
      token_hash: hashInboxToken(token),
      display_address: displayAddress,
      active: true,
      created_by: userId,
    })
    .select("id, organization_id, display_address, active, created_at, rotated_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function rotateReceiptInbox(
  db: Db,
  organizationId: string,
  userId: string | null
) {
  const now = new Date().toISOString();
  await db
    .from("receipt_inboxes")
    .update({ active: false, rotated_at: now })
    .eq("organization_id", organizationId)
    .eq("active", true);

  const token = generateInboxToken();
  const displayAddress = buildReceiptDisplayAddress(token);
  const { data, error } = await db
    .from("receipt_inboxes")
    .insert({
      organization_id: organizationId,
      token_hash: hashInboxToken(token),
      display_address: displayAddress,
      active: true,
      created_by: userId,
      rotated_at: now,
    })
    .select("id, organization_id, display_address, active, created_at, rotated_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function resolveInboxByRecipient(
  db: Db,
  recipients: string[]
) {
  for (const recipient of recipients) {
    const token = extractInboxTokenFromAddress(recipient);
    if (!token) continue;
    const tokenHash = hashInboxToken(token);
    const { data } = await db
      .from("receipt_inboxes")
      .select("id, organization_id, display_address, active")
      .eq("token_hash", tokenHash)
      .eq("active", true)
      .maybeSingle();
    if (data) {
      return { inbox: data, recipient };
    }
  }
  return null;
}
