import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { RECEIPT_BUCKET } from "@/lib/receipts/constants";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

export async function GET(
  request: Request,
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
      .select("id, original_filename")
      .eq("id", id)
      .eq("organization_id", entitlement.organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const { data: file } = await supabase
      .from("receipt_files")
      .select("storage_key, original_filename, mime_type")
      .eq("receipt_id", id)
      .eq("organization_id", entitlement.organizationId)
      .eq("role", "original")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!file?.storage_key) {
      return NextResponse.json(
        { error: "Original file not found in storage." },
        { status: 404 }
      );
    }

    const admin = createAdminClient();
    const redirect = new URL(request.url).searchParams.get("redirect") !== "0";

    if (redirect) {
      const { data: signed, error: signError } = await admin.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrl(file.storage_key, 120, {
          download: file.original_filename || receipt.original_filename || "receipt",
        });
      if (signError || !signed?.signedUrl) {
        return NextResponse.json(
          { error: signError?.message || "Failed to create download URL." },
          { status: 500 }
        );
      }

      await supabase.from("receipt_events").insert({
        receipt_id: id,
        organization_id: entitlement.organizationId,
        actor_id: user.id,
        event_type: "downloaded",
        new_values: { storage_key: file.storage_key } as Json,
      });

      return NextResponse.redirect(signed.signedUrl);
    }

    const { data: blob, error: downloadError } = await admin.storage
      .from(RECEIPT_BUCKET)
      .download(file.storage_key);

    if (downloadError || !blob) {
      return NextResponse.json(
        { error: downloadError?.message || "Failed to download file." },
        { status: 500 }
      );
    }

    const filename =
      file.original_filename || receipt.original_filename || "receipt";
    const bytes = Buffer.from(await blob.arrayBuffer());

    await supabase.from("receipt_events").insert({
      receipt_id: id,
      organization_id: entitlement.organizationId,
      actor_id: user.id,
      event_type: "downloaded",
      new_values: { storage_key: file.storage_key } as Json,
    });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": file.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to download receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
