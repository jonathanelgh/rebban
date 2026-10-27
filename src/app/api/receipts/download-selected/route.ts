import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  buildSelectedReceiptsZip,
  loadSingleOriginal,
} from "@/lib/receipts/download-selected";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { receipt_ids?: string[] };
    const receiptIds = Array.isArray(body.receipt_ids)
      ? body.receipt_ids.map(String).filter(Boolean)
      : [];

    if (!receiptIds.length) {
      return NextResponse.json(
        { error: "Select at least one receipt." },
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

    if (receiptIds.length === 1) {
      const file = await loadSingleOriginal({
        db: admin,
        organizationId: entitlement.organizationId,
        receiptId: receiptIds[0],
      });

      await supabase.from("receipt_events").insert({
        receipt_id: receiptIds[0],
        organization_id: entitlement.organizationId,
        actor_id: user.id,
        event_type: "downloaded",
        new_values: { bulk: false } as Json,
      });

      return new NextResponse(new Uint8Array(file.bytes), {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
          "Content-Length": String(file.bytes.length),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const zip = await buildSelectedReceiptsZip({
      db: admin,
      organizationId: entitlement.organizationId,
      receiptIds,
    });

    for (const id of receiptIds) {
      await supabase.from("receipt_events").insert({
        receipt_id: id,
        organization_id: entitlement.organizationId,
        actor_id: user.id,
        event_type: "downloaded",
        new_values: { bulk: true, packed: zip.packed } as Json,
      });
    }

    return new NextResponse(new Uint8Array(zip.buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zip.filename}"`,
        "Content-Length": String(zip.buffer.length),
        "Cache-Control": "private, no-store",
        "X-Receipts-Packed": String(zip.packed),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to download receipts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
