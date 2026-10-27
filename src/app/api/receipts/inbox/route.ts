import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  ensureReceiptInbox,
  rotateReceiptInbox,
} from "@/lib/receipts/inbox";

export const runtime = "nodejs";

export async function GET() {
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

    const inbox = await ensureReceiptInbox(
      supabase,
      entitlement.organizationId,
      user.id
    );

    const { data: recent } = await supabase
      .from("receipt_inbound_messages")
      .select(
        "id, sender, recipient, subject, received_at, status, error, created_at"
      )
      .eq("organization_id", entitlement.organizationId)
      .order("received_at", { ascending: false })
      .limit(15);

    const messageIds = (recent || []).map((row) => row.id);
    const receiptsByMessage: Record<
      string,
      Array<{
        id: string;
        original_filename: string | null;
        receipt_date: string | null;
        review_status: string;
        merchant: string | null;
      }>
    > = {};

    if (messageIds.length) {
      const { data: linked } = await supabase
        .from("receipts")
        .select(
          "id, inbound_message_id, original_filename, receipt_date, review_status, merchant"
        )
        .eq("organization_id", entitlement.organizationId)
        .in("inbound_message_id", messageIds)
        .is("deleted_at", null);

      for (const row of linked || []) {
        if (!row.inbound_message_id) continue;
        if (!receiptsByMessage[row.inbound_message_id]) {
          receiptsByMessage[row.inbound_message_id] = [];
        }
        receiptsByMessage[row.inbound_message_id].push({
          id: row.id,
          original_filename: row.original_filename,
          receipt_date: row.receipt_date,
          review_status: row.review_status,
          merchant: row.merchant,
        });
      }
    }

    return NextResponse.json({
      inbox,
      recentInbound: (recent || []).map((row) => ({
        ...row,
        receipts: receiptsByMessage[row.id] || [],
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load receipt inbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      confirm?: boolean;
    };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    if (body.action === "rotate") {
      if (body.confirm !== true) {
        return NextResponse.json(
          {
            error:
              "Rotating your receipt email requires confirm=true. The old address will stop working.",
          },
          { status: 400 }
        );
      }
      const inbox = await rotateReceiptInbox(
        supabase,
        entitlement.organizationId,
        user.id
      );
      return NextResponse.json({ ok: true, inbox });
    }

    const inbox = await ensureReceiptInbox(
      supabase,
      entitlement.organizationId,
      user.id
    );
    return NextResponse.json({ ok: true, inbox });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update inbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
