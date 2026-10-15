import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppUrl,
  sendInvoiceReminderEmail,
} from "@/lib/email/resend";
import { formatInvoiceMoney } from "@/lib/invoices/totals";

export const runtime = "nodejs";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

async function processDueReminders() {
  const supabase = createAdminClient();
  const { data: due, error } = await supabase.rpc(
    "claim_due_invoice_reminders",
    { p_limit: 25 }
  );

  if (error) throw new Error(error.message);

  const rows = due || [];
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const row of rows) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select(
        "id, number, status, total, currency, organization_id, created_by, payment_token"
      )
      .eq("id", row.invoice_id)
      .maybeSingle();

    if (
      !invoice ||
      invoice.status === "paid" ||
      invoice.status === "void"
    ) {
      await supabase
        .from("invoice_reminders")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      cancelled += 1;
      continue;
    }

    if (!invoice.payment_token) {
      await supabase
        .from("invoice_reminders")
        .update({
          status: "failed",
          error: "Payment link missing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    const [{ data: org }, { data: profile }] = await Promise.all([
      supabase
        .from("organizations")
        .select("name")
        .eq("id", invoice.organization_id)
        .maybeSingle(),
      invoice.created_by
        ? supabase
            .from("profiles")
            .select("full_name")
            .eq("id", invoice.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const invoiceUrl = `${getAppUrl()}/pay/${invoice.payment_token}`;
    const amountLabel = formatInvoiceMoney(
      Number(invoice.total) || 0,
      invoice.currency || "USD"
    );
    const invoiceLabel = invoice.number
      ? `Invoice ${invoice.number}`
      : "Invoice";

    try {
      await sendInvoiceReminderEmail({
        to: row.recipient_email,
        recipientName: row.recipient_name,
        senderName: profile?.full_name,
        organizationName: org?.name || "Your freelancer",
        invoiceNumber: invoice.number,
        invoiceUrl,
        amountLabel,
        subject: row.subject,
        body: row.body,
        fromUserId: invoice.created_by || row.created_by,
        useAdmin: true,
      });

      await supabase
        .from("invoice_reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", row.id);

      await supabase.from("invoice_events").insert({
        organization_id: invoice.organization_id,
        invoice_id: invoice.id,
        event_type: "reminder_sent",
        actor_type: "system",
        actor_email: row.recipient_email,
        actor_name: row.recipient_name,
        metadata: {
          reminder_id: row.id,
          step_index: row.step_index,
          sequence_key: row.sequence_key,
          offset_days: row.offset_days,
        },
      });

      if (invoice.created_by) {
        await supabase.rpc("create_user_notification", {
          p_organization_id: invoice.organization_id,
          p_user_id: invoice.created_by,
          p_type: "invoice_reminder_sent",
          p_title: "Payment reminder sent",
          p_body: `Reminder ${row.step_index + 1} for ${invoiceLabel} was emailed to ${row.recipient_email}.`,
          p_link: `/invoices/${invoice.id}/edit`,
          p_entity_type: "invoice",
          p_entity_id: invoice.id,
        });
      }

      sent += 1;
    } catch (err) {
      await supabase
        .from("invoice_reminders")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "Send failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { claimed: rows.length, sent, failed, cancelled };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invoice reminder cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
