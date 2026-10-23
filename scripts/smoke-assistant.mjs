/**
 * One-off smoke: phone utils + MVP tools against Supabase.
 * Run: node --import tsx scripts/smoke-assistant.mjs
 * Or: npx tsx scripts/smoke-assistant.ts
 */
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function normalizeWhatsAppPhone(input) {
  return String(input || "").replace(/[^0-9]/g, "");
}

const phone = normalizeWhatsAppPhone("+46 70-123 45 67");
console.log("phone", phone, phone.length >= 8);

process.env.WHATSAPP_WEBHOOK_SECRET = "test-secret";
const body = JSON.stringify({ from: "46701234567", body: "hi" });
const sig = crypto
  .createHmac("sha256", "test-secret")
  .update(body)
  .digest("hex");
console.log("hmac", sig.length === 64);

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: membership, error: memErr } = await db
  .from("organization_members")
  .select("user_id, organization_id")
  .limit(1)
  .maybeSingle();
if (memErr || !membership) {
  console.error("membership", memErr);
  process.exit(1);
}

const { data: lead, error: leadErr } = await db
  .from("leads")
  .insert({
    organization_id: membership.organization_id,
    name: "Sarah Smoke",
    company: "Studio North",
    notes: "Website redesign ~€3000",
    source: "whatsapp",
    status: "new",
    created_by: membership.user_id,
  })
  .select("id, name, company, source")
  .single();
console.log("add_lead", leadErr?.message || lead);

const { data: unpaid, error: unpaidErr } = await db
  .from("invoices")
  .select("id, number, status, total")
  .eq("organization_id", membership.organization_id)
  .is("deleted_at", null)
  .in("status", ["sent", "viewed", "overdue"])
  .limit(5);
console.log(
  "unpaid",
  unpaidErr?.message || `${unpaid?.length ?? 0} invoices`
);

const { data: client } = await db
  .from("clients")
  .select("id, name, company")
  .eq("organization_id", membership.organization_id)
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

if (client) {
  const { data: invoice, error: invErr } = await db
    .from("invoices")
    .insert({
      organization_id: membership.organization_id,
      client_id: client.id,
      status: "draft",
      currency: "EUR",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      created_by: membership.user_id,
      subtotal: 1200,
      tax_total: 0,
      total: 1200,
      payment_token: "smoke" + Date.now(),
      tax_enabled: false,
      tax_rate: 0,
      prices_include_tax: false,
      show_tax_id: false,
      show_logo: true,
    })
    .select("id, status, total")
    .single();
  console.log("draft_invoice", invErr?.message || invoice);
  if (invoice) {
    await db
      .from("invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", invoice.id);
    console.log("cleaned draft");
  }
} else {
  console.log("draft_invoice skipped (no client in this org)");
}

if (lead?.id) {
  await db.from("leads").delete().eq("id", lead.id);
  console.log("cleaned lead");
}

const { data: tables } = await db
  .from("assistant_whatsapp_links")
  .select("id")
  .limit(1);
console.log("assistant_whatsapp_links reachable", Array.isArray(tables));

console.log("SMOKE_OK");
