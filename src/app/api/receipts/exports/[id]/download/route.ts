import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { RECEIPT_BUCKET, MONTH_NAMES } from "@/lib/receipts/constants";

export const runtime = "nodejs";

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

    const { data: exportRow, error } = await supabase
      .from("receipt_exports")
      .select("*")
      .eq("id", id)
      .eq("organization_id", entitlement.organizationId)
      .maybeSingle();

    if (error || !exportRow?.storage_key) {
      return NextResponse.json(
        { error: error?.message || "Export not found." },
        { status: 404 }
      );
    }

    if (
      exportRow.expires_at &&
      new Date(exportRow.expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "This export link has expired. Ask the assistant to create it again." },
        { status: 410 }
      );
    }

    const admin = createAdminClient();
    const { data: blob, error: downloadError } = await admin.storage
      .from(RECEIPT_BUCKET)
      .download(exportRow.storage_key);

    if (downloadError || !blob) {
      return NextResponse.json(
        { error: downloadError?.message || "Failed to download export." },
        { status: 500 }
      );
    }

    const bytes = Buffer.from(await blob.arrayBuffer());
    const monthName = MONTH_NAMES[exportRow.month - 1] || String(exportRow.month);
    const filename = `receipts-${monthName}-${exportRow.year}.zip`.replace(
      /\s+/g,
      "-"
    );

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to download export.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
