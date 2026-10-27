import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { processReceiptExtraction } from "@/lib/receipts/process";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
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

    const { data: receipt } = await supabase
      .from("receipts")
      .select("id")
      .eq("id", id)
      .eq("organization_id", entitlement.organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    await supabase
      .from("receipts")
      .update({ review_status: "processing" })
      .eq("id", id);

    const admin = createAdminClient();
    const result = await processReceiptExtraction(admin, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const { data: refreshed } = await supabase
      .from("receipts")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json({ ok: true, receipt: refreshed, status: result.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Re-extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
