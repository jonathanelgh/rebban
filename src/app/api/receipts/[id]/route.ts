import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import type { Database, Json } from "@/types/database";
import { createReceiptSignedUrl } from "@/lib/receipts/storage";

export const runtime = "nodejs";

type PatchBody = {
  merchant?: string | null;
  receipt_date?: string | null;
  amount?: number | null;
  amount_minor?: number | null;
  currency?: string | null;
  tax_amount?: number | null;
  tax_amount_minor?: number | null;
  note?: string | null;
  category?: string | null;
  document_type?: Database["public"]["Enums"]["receipt_document_type"];
  mark_reviewed?: boolean;
  clear_duplicate?: boolean;
};

function toMinor(amount: number | null | undefined, currency: string | null) {
  if (amount == null || !currency) return null;
  const zero = new Set(["JPY", "KRW", "VND"]);
  const decimals = zero.has(currency.toUpperCase()) ? 0 : 2;
  return Math.round(amount * 10 ** decimals);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const { data: receipt, error } = await supabase
      .from("receipts")
      .select("*")
      .eq("id", id)
      .eq("organization_id", entitlement.organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !receipt) {
      return NextResponse.json(
        { error: error?.message || "Receipt not found" },
        { status: 404 }
      );
    }

    const { data: files } = await supabase
      .from("receipt_files")
      .select("*")
      .eq("receipt_id", id)
      .order("created_at", { ascending: true });

    const { data: extractions } = await supabase
      .from("receipt_extractions")
      .select("*")
      .eq("receipt_id", id)
      .order("extracted_at", { ascending: false })
      .limit(3);

    const { data: events } = await supabase
      .from("receipt_events")
      .select("*")
      .eq("receipt_id", id)
      .order("occurred_at", { ascending: false })
      .limit(30);

    let inbound = null;
    if (receipt.inbound_message_id) {
      const { data } = await supabase
        .from("receipt_inbound_messages")
        .select(
          "id, sender, recipient, subject, received_at, message_id, status, error"
        )
        .eq("id", receipt.inbound_message_id)
        .maybeSingle();
      inbound = data;
    }

    const original = (files || []).find((f) => f.role === "original") || (files || [])[0];
    let downloadUrl: string | null = null;
    if (original) {
      try {
        downloadUrl = await createReceiptSignedUrl(
          supabase,
          original.storage_key,
          180
        );
      } catch {
        downloadUrl = null;
      }
    }

    return NextResponse.json({
      receipt,
      files: files || [],
      extractions: extractions || [],
      events: events || [],
      inbound,
      downloadUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as PatchBody;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const { data: existing, error: existingError } = await supabase
      .from("receipts")
      .select("*")
      .eq("id", id)
      .eq("organization_id", entitlement.organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: existingError?.message || "Receipt not found" },
        { status: 404 }
      );
    }

    const patch: Database["public"]["Tables"]["receipts"]["Update"] = {};

    if ("merchant" in body) {
      patch.merchant = body.merchant?.trim() || null;
    }
    if ("receipt_date" in body) {
      const d = body.receipt_date?.trim() || null;
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return NextResponse.json(
          { error: "receipt_date must be YYYY-MM-DD" },
          { status: 400 }
        );
      }
      patch.receipt_date = d;
    }
    if ("currency" in body) {
      patch.currency = body.currency?.trim().toUpperCase() || null;
    }
    if ("amount_minor" in body) {
      patch.amount_minor = body.amount_minor;
    } else if ("amount" in body) {
      const currency = patch.currency ?? existing.currency;
      patch.amount_minor = toMinor(body.amount, currency);
    }
    if ("tax_amount_minor" in body) {
      patch.tax_amount_minor = body.tax_amount_minor;
    } else if ("tax_amount" in body) {
      const currency = patch.currency ?? existing.currency;
      patch.tax_amount_minor = toMinor(body.tax_amount, currency);
    }
    if ("note" in body) patch.note = body.note?.trim() || null;
    if ("category" in body) patch.category = body.category?.trim() || null;
    if ("document_type" in body && body.document_type) {
      patch.document_type = body.document_type;
    }
    if (body.mark_reviewed === true) {
      patch.review_status = "reviewed";
      patch.reviewed_at = new Date().toISOString();
      patch.reviewed_by = user.id;
    }
    if (body.clear_duplicate === true) {
      patch.is_possible_duplicate = false;
      patch.duplicate_of = null;
      if (existing.review_status === "possible_duplicate") {
        patch.review_status = "needs_review";
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("receipts")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", entitlement.organizationId)
      .select("*")
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || "Update failed" },
        { status: 500 }
      );
    }

    await supabase.from("receipt_events").insert({
      receipt_id: id,
      organization_id: entitlement.organizationId,
      actor_id: user.id,
      event_type: body.mark_reviewed ? "reviewed" : "updated",
      old_values: {
        merchant: existing.merchant,
        receipt_date: existing.receipt_date,
        amount_minor: existing.amount_minor,
        currency: existing.currency,
        review_status: existing.review_status,
      } as Json,
      new_values: patch as Json,
    });

    return NextResponse.json({ ok: true, receipt: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("receipts")
      .update({ deleted_at: now })
      .eq("id", id)
      .eq("organization_id", entitlement.organizationId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    await supabase.from("receipt_events").insert({
      receipt_id: id,
      organization_id: entitlement.organizationId,
      actor_id: user.id,
      event_type: "deleted",
      new_values: { deleted_at: now } as Json,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
