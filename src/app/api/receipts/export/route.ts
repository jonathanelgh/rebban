import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { buildMonthExportZip } from "@/lib/receipts/export-month";
import { createReceiptSignedUrl } from "@/lib/receipts/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { year?: number; month?: number };
    const year = Number(body.year);
    const month = Number(body.month);
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json(
        { error: "Provide year and month (1-12)." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const admin = createAdminClient();
    const result = await buildMonthExportZip({
      db: admin,
      organizationId: entitlement.organizationId,
      year,
      month,
    });

    const { data: exportRow, error } = await supabase
      .from("receipt_exports")
      .insert({
        organization_id: entitlement.organizationId,
        year,
        month,
        storage_key: result.storageKey,
        expires_at: result.expiresAt,
        created_by: user.id,
        status: "ready",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const downloadUrl = await createReceiptSignedUrl(
      admin,
      result.storageKey,
      600
    );

    return NextResponse.json({
      ok: true,
      export: exportRow,
      downloadUrl,
      receiptCount: result.receiptCount,
      unfiledCount: result.unfiledCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export month.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
