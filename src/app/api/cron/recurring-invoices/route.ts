import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppUrl,
  sendInvoiceInviteEmail,
} from "@/lib/email/resend";
import { DEFAULT_INVOICE_SEND_MESSAGE } from "@/lib/invoices/send";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { cloneRecurringInvoice } from "@/lib/invoices/clone-recurring";
import { ensureInvoiceNumber } from "@/lib/invoices/numbering";
import {
  advanceRecurrenceAt,
  type InvoiceRecurrenceInterval,
} from "@/lib/invoices/recurrence";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

async function processRecurringInvoices() {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("invoices")
    .select(
      `id, number, organization_id, client_id, created_by, currency, total,
       recurrence_interval, recurrence_weekday, recurrence_day_of_month,
       recurrence_next_at`
    )
    .eq("recurrence_enabled", true)
    .is("recurrence_source_id", null)
    .is("deleted_at", null)
    .lte("recurrence_next_at", nowIso)
    .not("recurrence_interval", "is", null)
    .order("recurrence_next_at", { ascending: true })
    .limit(25);

  if (error) throw new Error(error.message);

  let created = 0;
  let sent = 0;
  let failed = 0;

  for (const source of due || []) {
    try {
      if (!source.recurrence_interval) {
        failed += 1;
        continue;
      }

      const clone = await cloneRecurringInvoice(db, source.id);
      created += 1;

      const [{ data: client }, { data: org }, { data: profile }] =
        await Promise.all([
          db
            .from("clients")
            .select("name, email")
            .eq("id", source.client_id)
            .maybeSingle(),
          db
            .from("organizations")
            .select("name")
            .eq("id", source.organization_id)
            .maybeSingle(),
          source.created_by
            ? db
                .from("profiles")
                .select("full_name, email")
                .eq("id", source.created_by)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

      const recipientEmail = client?.email?.trim().toLowerCase() || "";
      if (recipientEmail) {
        const paymentToken = (
          await db
            .from("invoices")
            .select("payment_token")
            .eq("id", clone.id)
            .maybeSingle()
        ).data?.payment_token;

        const invoiceNumber = await ensureInvoiceNumber(db, {
          invoiceId: clone.id,
          organizationId: source.organization_id,
          currentNumber: clone.number,
        });

        await sendInvoiceInviteEmail({
          to: recipientEmail,
          recipientName: client?.name,
          senderName: profile?.full_name,
          organizationName: org?.name || "Your freelancer",
          invoiceNumber,
          amountLabel: formatInvoiceMoney(clone.total, clone.currency),
          invoiceUrl: `${getAppUrl()}/pay/${paymentToken}`,
          message: DEFAULT_INVOICE_SEND_MESSAGE,
          fromUserId: source.created_by || undefined,
        });

        await db
          .from("invoices")
          .update({
            status: "sent",
            number: invoiceNumber,
            sent_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", clone.id);

        await db.from("invoice_events").insert({
          organization_id: source.organization_id,
          invoice_id: clone.id,
          event_type: "sent",
          actor_type: "system",
          metadata: {
            recurring: true,
            source_invoice_id: source.id,
            recipient_email: recipientEmail,
          },
        });

        sent += 1;
      }

      const nextAt = advanceRecurrenceAt({
        interval: source.recurrence_interval as InvoiceRecurrenceInterval,
        weekday: source.recurrence_weekday,
        dayOfMonth: source.recurrence_day_of_month,
        fromIso: source.recurrence_next_at || nowIso,
      });

      await db
        .from("invoices")
        .update({
          recurrence_last_sent_at: nowIso,
          recurrence_next_at: nextAt.toISOString(),
          updated_at: nowIso,
        })
        .eq("id", source.id);
    } catch (err) {
      console.error(
        "[recurring invoices] source failed",
        source.id,
        err instanceof Error ? err.message : err
      );
      failed += 1;
    }
  }

  return { scanned: due?.length || 0, created, sent, failed };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processRecurringInvoices();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Recurring invoices cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
