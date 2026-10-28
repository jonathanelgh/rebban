import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertAllowedOrigin,
  buildInvoicePayload,
  buildInvoicePreview,
  clientMeta,
  freeInvoiceOptions,
  hashIp,
  jsonWithCors,
  payloadToJson,
} from "@/lib/free-invoice/public";

export const runtime = "nodejs";

const METHODS = "POST, OPTIONS";
const GENERATE_LIMIT_PER_HOUR = 30;

export async function OPTIONS(request: Request) {
  return freeInvoiceOptions(request, METHODS);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!assertAllowedOrigin(origin)) {
    return jsonWithCors(origin, METHODS, { error: "Origin not allowed" }, {
      status: 403,
    });
  }

  const { ip, userAgent } = clientMeta(request);
  const ipHash = hashIp(ip);
  const admin = createAdminClient();

  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("free_invoice_drafts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count || 0) >= GENERATE_LIMIT_PER_HOUR) {
      return jsonWithCors(
        origin,
        METHODS,
        { error: "Too many invoices from this network. Try again later." },
        { status: 429 }
      );
    }
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const built = buildInvoicePayload(body);
  if (built.error || !built.payload) {
    return jsonWithCors(
      origin,
      METHODS,
      { error: built.error || "Invalid invoice." },
      { status: 400 }
    );
  }

  const payload = built.payload;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: draft, error } = await admin
    .from("free_invoice_drafts")
    .insert({
      invoice_number: payload.number || "Invoice",
      payload: payloadToJson(payload),
      total: payload.total,
      currency: payload.currency,
      from_name: payload.fromName,
      bill_to_name: payload.billToName || payload.billToCompany,
      ip_hash: ipHash,
      user_agent: userAgent?.slice(0, 500) || null,
      expires_at: expiresAt,
    })
    .select("id, invoice_number")
    .single();

  if (error || !draft) {
    console.error("[free-invoice/generate] insert", error);
    return jsonWithCors(
      origin,
      METHODS,
      { error: "Could not save invoice draft." },
      { status: 500 }
    );
  }

  return jsonWithCors(origin, METHODS, {
    draftId: draft.id,
    preview: buildInvoicePreview(payload),
  });
}
