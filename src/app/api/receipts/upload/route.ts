import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { createReceiptFromUpload } from "@/lib/receipts/create-upload";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const single = form.get("file");
    if (single instanceof File) files.push(single);

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }
    if (files.length > 20) {
      return NextResponse.json(
        { error: "Upload up to 20 files at a time." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const results: Array<Record<string, unknown>> = [];

    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await createReceiptFromUpload({
        db: admin,
        organizationId: entitlement.organizationId,
        userId: user.id,
        filename: file.name || "receipt",
        bytes,
        declaredMime: file.type,
        extractNow: true,
      });
      results.push(
        result.ok
          ? { ok: true, receipt: result.receipt }
          : { ok: false, error: result.error, receiptId: result.receiptId }
      );
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: okCount > 0,
      results,
      uploaded: okCount,
      failed: results.length - okCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload receipts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
