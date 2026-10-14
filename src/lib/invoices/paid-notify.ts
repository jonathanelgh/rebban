import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppUrl,
  sendInvoicePaidClientEmail,
  sendInvoicePaidFreelancerEmail,
} from "@/lib/email/resend";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { formatInvoiceMoney, lineAmount } from "@/lib/invoices/totals";

function formatPaidAt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * After an invoice is marked paid: email freelancer, email client with PDF,
 * log activity, and create an in-app alert. Failures are logged but do not
 * throw so the Stripe webhook can still acknowledge the event.
 */
export async function notifyInvoicePaid(options: {
  invoiceId: string;
  /** Prefer Stripe customer_details.email / customer_email when present */
  payerEmail?: string | null;
  payerName?: string | null;
}) {
  const admin = createAdminClient();
  const paidAt = new Date().toISOString();

  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select(
      `id, number, currency, total, subtotal, tax_total, tax_enabled, tax_rate,
       prices_include_tax, notes, issue_date, due_date, show_tax_id, tax_id,
       organization_id, client_id, created_by`
    )
    .eq("id", options.invoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (invoiceError || !invoice) {
    console.error("[invoice paid notify] invoice load failed", invoiceError?.message);
    return;
  }

  const [{ data: org }, { data: lines }, { data: client }, { data: profile }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("name, legal_name, address, tax_id")
        .eq("id", invoice.organization_id)
        .maybeSingle(),
      admin
        .from("invoice_line_items")
        .select("description, quantity, unit_price, amount, position")
        .eq("invoice_id", invoice.id)
        .order("position", { ascending: true }),
      invoice.client_id
        ? admin
            .from("clients")
            .select("name, company, email")
            .eq("id", invoice.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      invoice.created_by
        ? admin
            .from("profiles")
            .select("full_name, email")
            .eq("id", invoice.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const fromName =
    org?.legal_name?.trim() || org?.name?.trim() || "Your freelancer";
  const currency = invoice.currency || "USD";
  const amountLabel = formatInvoiceMoney(Number(invoice.total) || 0, currency);
  const invoiceLabel = invoice.number
    ? `Invoice ${invoice.number}`
    : "Invoice";
  const clientName =
    options.payerName?.trim() ||
    client?.name?.trim() ||
    client?.company?.trim() ||
    null;
  const clientEmail =
    options.payerEmail?.trim().toLowerCase() ||
    client?.email?.trim().toLowerCase() ||
    null;
  const freelancerEmail = profile?.email?.trim().toLowerCase() || null;
  const paidAtLabel = formatPaidAt(paidAt);
  const editorUrl = `${getAppUrl()}/invoices/${invoice.id}/edit`;

  const pdfLines = (lines || []).map((line) => ({
    description: line.description || "Item",
    quantity: line.quantity,
    unitPrice: line.unit_price,
    amount:
      Number(line.amount) ||
      lineAmount(line.quantity, line.unit_price),
  }));

  let pdf: Buffer | null = null;
  try {
    pdf = await buildInvoicePdf({
      number: invoice.number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      currency,
      notes: invoice.notes,
      fromName,
      fromAddress: org?.address || null,
      fromEmail: freelancerEmail,
      taxId: invoice.tax_id || org?.tax_id || null,
      showTaxId: Boolean(invoice.show_tax_id),
      billToName: client?.name || null,
      billToCompany: client?.company || null,
      billToEmail: clientEmail,
      lines: pdfLines,
      subtotal: Number(invoice.subtotal) || 0,
      taxEnabled: Boolean(invoice.tax_enabled),
      taxRate: Number(invoice.tax_rate) || 0,
      taxTotal: Number(invoice.tax_total) || 0,
      total: Number(invoice.total) || 0,
      pricesIncludeTax: Boolean(invoice.prices_include_tax),
    });
  } catch (err) {
    console.error(
      "[invoice paid notify] PDF failed",
      err instanceof Error ? err.message : err
    );
  }

  const pdfFilename = `${(invoice.number || "invoice").replace(/[^\w.-]+/g, "_")}.pdf`;

  let freelancerProvider: string | null = null;
  let clientProvider: string | null = null;

  if (freelancerEmail) {
    try {
      const result = await sendInvoicePaidFreelancerEmail({
        to: freelancerEmail,
        freelancerName: profile?.full_name,
        clientName,
        invoiceNumber: invoice.number,
        amountLabel,
        paidAtLabel,
        invoiceUrl: editorUrl,
      });
      freelancerProvider =
        result && "provider" in result ? result.provider : "resend";
    } catch (err) {
      console.error(
        "[invoice paid notify] freelancer email failed",
        err instanceof Error ? err.message : err
      );
    }
  }

  if (clientEmail && pdf) {
    try {
      const result = await sendInvoicePaidClientEmail({
        to: clientEmail,
        clientName,
        organizationName: fromName,
        invoiceNumber: invoice.number,
        amountLabel,
        paidAtLabel,
        fromName: profile?.full_name || fromName,
        pdf,
        pdfFilename,
      });
      clientProvider =
        result && "provider" in result ? result.provider : "resend";
    } catch (err) {
      console.error(
        "[invoice paid notify] client email failed",
        err instanceof Error ? err.message : err
      );
    }
  } else if (clientEmail && !pdf) {
    console.error("[invoice paid notify] skipped client email — no PDF");
  }

  await admin.from("invoice_events").insert({
    organization_id: invoice.organization_id,
    invoice_id: invoice.id,
    event_type: "paid",
    actor_type: "client",
    actor_email: clientEmail,
    actor_name: clientName,
    metadata: {
      amount: Number(invoice.total) || 0,
      currency,
      freelancer_emailed: Boolean(freelancerProvider),
      client_emailed: Boolean(clientProvider),
      freelancer_provider: freelancerProvider,
      client_provider: clientProvider,
      pdf_attached: Boolean(clientProvider),
    },
  });

  let notifyUserId = invoice.created_by;
  if (!notifyUserId) {
    const { data: members } = await admin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", invoice.organization_id)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);
    const owner = members?.find((m) => m.role === "owner");
    const adminMember = members?.find((m) => m.role === "admin");
    notifyUserId = owner?.user_id || adminMember?.user_id || null;
  }

  if (notifyUserId) {
    const { error: notifyError } = await admin.rpc("create_user_notification", {
      p_organization_id: invoice.organization_id,
      p_user_id: notifyUserId,
      p_type: "invoice_paid",
      p_title: "Invoice paid",
      p_body: `${invoiceLabel} was paid by ${clientName || clientEmail || "a client"} · ${amountLabel}.`,
      p_link: `/invoices/${invoice.id}/edit`,
      p_entity_type: "invoice",
      p_entity_id: invoice.id,
    });
    if (notifyError) {
      console.error(
        "[invoice paid notify] alert failed",
        notifyError.message
      );
    }
  } else {
    console.error("[invoice paid notify] no freelancer user to alert");
  }
}
