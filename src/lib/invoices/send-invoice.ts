import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getAppUrl, sendInvoiceInviteEmail } from "@/lib/email/resend";
import { DEFAULT_INVOICE_SEND_MESSAGE } from "@/lib/invoices/send";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import {
  buildScheduledReminders,
  type ReminderSequenceKey,
} from "@/lib/invoices/reminders";
import { ensureInvoiceNumber } from "@/lib/invoices/numbering";
import {
  firstRecurrenceAt,
  type InvoiceRecurrenceInterval,
} from "@/lib/invoices/recurrence";

type Db = SupabaseClient<Database>;

export type SendInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      number: string;
      recipientEmail: string;
      url: string;
      status: string;
    }
  | { ok: false; error: string };

/**
 * Send an invoice by email and mark it sent. Org-scoped; usable from API or Assistant.
 */
export async function sendInvoiceForOrganization(options: {
  db: Db;
  invoiceId: string;
  organizationId: string;
  userId: string;
  message?: string;
  sequenceKey?: ReminderSequenceKey;
}): Promise<SendInvoiceResult> {
  const { db, invoiceId, organizationId, userId } = options;

  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .select(
      `id, number, status, currency, total, organization_id, client_id,
       created_by, sent_at, payment_token, due_date,
       recurrence_enabled, recurrence_interval, recurrence_weekday,
       recurrence_day_of_month, recurrence_next_at, recurrence_source_id`
    )
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (invoiceError || !invoice) {
    return { ok: false, error: invoiceError?.message || "Invoice not found." };
  }

  if (invoice.status === "void") {
    return { ok: false, error: "This invoice is voided and cannot be sent." };
  }
  if (invoice.status === "paid") {
    return { ok: false, error: "This invoice is already paid." };
  }

  let recipientEmail = "";
  let recipientName = "";

  if (invoice.client_id) {
    const { data: client } = await db
      .from("clients")
      .select("name, company, email")
      .eq("id", invoice.client_id)
      .maybeSingle();
    recipientEmail = client?.email?.toLowerCase() || "";
    recipientName = client?.name || client?.company || "";
  }

  if (!recipientEmail) {
    return {
      ok: false,
      error: "Add a client email before sending this invoice.",
    };
  }

  const { data: org } = await db
    .from("organizations")
    .select("name, default_reminder_sequence")
    .eq("id", organizationId)
    .maybeSingle();

  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const sequenceKey =
    options.sequenceKey ||
    (org?.default_reminder_sequence as ReminderSequenceKey | null) ||
    "none";

  if (sequenceKey !== "none" && !invoice.due_date) {
    return {
      ok: false,
      error: "Set a due date before enabling payment reminders.",
    };
  }

  await db.rpc("cancel_invoice_reminders", { p_invoice_id: invoice.id });

  let paymentToken = invoice.payment_token;
  if (!paymentToken) {
    paymentToken = nanoid(24);
  }

  const invoiceNumber = await ensureInvoiceNumber(db, {
    invoiceId: invoice.id,
    organizationId,
    currentNumber: invoice.number,
  });

  const invoiceUrl = `${getAppUrl()}/pay/${paymentToken}`;
  const amountLabel = formatInvoiceMoney(
    Number(invoice.total) || 0,
    invoice.currency || "USD"
  );
  const sendMessage = options.message?.trim() || DEFAULT_INVOICE_SEND_MESSAGE;

  const emailResult = await sendInvoiceInviteEmail({
    to: recipientEmail,
    recipientName,
    senderName: profile?.full_name,
    organizationName: org?.name || "Your freelancer",
    invoiceNumber,
    invoiceUrl,
    amountLabel,
    message: sendMessage,
    fromUserId: userId,
  });

  const now = new Date().toISOString();
  const nextStatus =
    invoice.status === "viewed" || invoice.status === "overdue"
      ? invoice.status
      : ("sent" as const);

  const recurrencePatch: Record<string, unknown> = {};
  if (
    invoice.recurrence_enabled &&
    !invoice.recurrence_source_id &&
    invoice.recurrence_interval
  ) {
    const nextAt = firstRecurrenceAt({
      interval: invoice.recurrence_interval as InvoiceRecurrenceInterval,
      weekday: invoice.recurrence_weekday,
      dayOfMonth: invoice.recurrence_day_of_month,
    });
    recurrencePatch.recurrence_last_sent_at = now;
    recurrencePatch.recurrence_next_at = nextAt.toISOString();
  }

  const { error: updateError } = await db
    .from("invoices")
    .update({
      status: nextStatus,
      sent_at: invoice.sent_at || now,
      payment_token: paymentToken,
      number: invoiceNumber,
      ...recurrencePatch,
    })
    .eq("id", invoice.id)
    .eq("organization_id", organizationId);

  if (updateError) {
    return {
      ok: false,
      error: updateError.message || "Invoice emailed, but status update failed.",
    };
  }

  const scheduled =
    sequenceKey === "none" || !invoice.due_date
      ? []
      : buildScheduledReminders({
          sequenceKey,
          dueDate: invoice.due_date,
        });

  if (scheduled.length > 0) {
    await db.from("invoice_reminders").insert(
      scheduled.map((step) => ({
        organization_id: organizationId,
        invoice_id: invoice.id,
        sequence_key: sequenceKey,
        step_index: step.stepIndex,
        offset_days: step.offsetDays,
        recipient_email: recipientEmail,
        recipient_name: recipientName || null,
        subject: step.subject,
        body: step.body,
        status: "pending" as const,
        scheduled_for: step.scheduledFor,
        created_by: userId,
      }))
    );
  }

  await db.from("invoice_events").insert({
    organization_id: organizationId,
    invoice_id: invoice.id,
    event_type: "sent",
    actor_type: "freelancer",
    actor_email: profile?.email || null,
    actor_name: profile?.full_name || null,
    metadata: {
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      invoice_url: invoiceUrl,
      sequence_key: sequenceKey,
      reminder_count: scheduled.length,
      channel: "assistant",
      provider:
        emailResult && "provider" in emailResult ? emailResult.provider : null,
    },
  });

  await db.rpc("create_user_notification", {
    p_organization_id: organizationId,
    p_user_id: invoice.created_by || userId,
    p_type: "invoice_sent",
    p_title: "Invoice sent",
    p_body: `Invoice ${invoiceNumber} was sent to ${recipientName || recipientEmail}.`,
    p_link: `/invoices/${invoice.id}/edit`,
    p_entity_type: "invoice",
    p_entity_id: invoice.id,
  });

  return {
    ok: true,
    invoiceId: invoice.id,
    number: invoiceNumber,
    recipientEmail,
    url: invoiceUrl,
    status: nextStatus,
  };
}
