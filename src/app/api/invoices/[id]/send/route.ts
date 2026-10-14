import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl, sendInvoiceInviteEmail } from "@/lib/email/resend";
import { DEFAULT_INVOICE_SEND_MESSAGE } from "@/lib/invoices/send";
import { formatInvoiceMoney } from "@/lib/invoices/totals";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await context.params;
    const body = (await request.json()) as {
      recipientEmail?: string;
      recipientName?: string;
      message?: string;
    };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        `id, number, status, currency, total, organization_id, client_id,
         created_by, sent_at, payment_token`
      )
      .eq("id", invoiceId)
      .is("deleted_at", null)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: invoiceError?.message || "Invoice not found" },
        { status: 404 }
      );
    }

    if (invoice.status === "void") {
      return NextResponse.json(
        { error: "This invoice is voided and cannot be sent." },
        { status: 400 }
      );
    }

    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "This invoice is already paid." },
        { status: 400 }
      );
    }

    let recipientEmail = body.recipientEmail?.trim().toLowerCase() || "";
    let recipientName = body.recipientName?.trim() || "";

    if (invoice.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name, company, email")
        .eq("id", invoice.client_id)
        .maybeSingle();
      if (!recipientEmail) recipientEmail = client?.email?.toLowerCase() || "";
      if (!recipientName) {
        recipientName = client?.name || client?.company || "";
      }
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Add a client email before sending." },
        { status: 400 }
      );
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", invoice.organization_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    let paymentToken = invoice.payment_token;
    if (!paymentToken) {
      paymentToken = nanoid(24);
    }

    const invoiceUrl = `${getAppUrl()}/pay/${paymentToken}`;
    const amountLabel = formatInvoiceMoney(
      Number(invoice.total) || 0,
      invoice.currency || "USD"
    );
    const sendMessage =
      body.message?.trim() || DEFAULT_INVOICE_SEND_MESSAGE;

    const emailResult = await sendInvoiceInviteEmail({
      to: recipientEmail,
      recipientName,
      senderName: profile?.full_name,
      organizationName: org?.name || "Your freelancer",
      invoiceNumber: invoice.number,
      invoiceUrl,
      amountLabel,
      message: sendMessage,
      fromUserId: user.id,
    });

    const now = new Date().toISOString();
    const nextStatus =
      invoice.status === "viewed" || invoice.status === "overdue"
        ? invoice.status
        : ("sent" as const);

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: nextStatus,
        sent_at: invoice.sent_at || now,
        payment_token: paymentToken,
      })
      .eq("id", invoice.id)
      .eq("organization_id", invoice.organization_id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Invoice emailed, but status update failed." },
        { status: 500 }
      );
    }

    await supabase.from("invoice_events").insert({
      organization_id: invoice.organization_id,
      invoice_id: invoice.id,
      event_type: "sent",
      actor_type: "freelancer",
      actor_email: profile?.email || user.email || null,
      actor_name: profile?.full_name || null,
      metadata: {
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        invoice_url: invoiceUrl,
        provider:
          emailResult && "provider" in emailResult
            ? emailResult.provider
            : null,
      },
    });

    const invoiceLabel = invoice.number
      ? `Invoice ${invoice.number}`
      : "Invoice";
    const recipientLabel = recipientName || recipientEmail;
    await supabase.rpc("create_user_notification", {
      p_organization_id: invoice.organization_id,
      p_user_id: invoice.created_by || user.id,
      p_type: "invoice_sent",
      p_title: "Invoice sent",
      p_body: `${invoiceLabel} was sent to ${recipientLabel}.`,
      p_link: `/invoices/${invoice.id}/edit`,
      p_entity_type: "invoice",
      p_entity_id: invoice.id,
    });

    return NextResponse.json({
      ok: true,
      url: invoiceUrl,
      paymentToken,
      recipientEmail,
      status: nextStatus,
      provider:
        emailResult && "provider" in emailResult ? emailResult.provider : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
