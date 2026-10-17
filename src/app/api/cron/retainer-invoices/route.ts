import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppUrl,
  sendInvoiceInviteEmail,
} from "@/lib/email/resend";
import { DEFAULT_INVOICE_SEND_MESSAGE } from "@/lib/invoices/send";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { createProjectInvoice } from "@/lib/projects/create-invoice-from-project";
import { advanceRetainerInvoiceAt } from "@/lib/projects/billing";
import { ensureInvoiceNumber } from "@/lib/invoices/numbering";

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

async function processRetainerInvoices() {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: dueProjects, error } = await db
    .from("projects")
    .select(
      "id, name, organization_id, client_id, proposal_id, created_by, retainer_amount, retainer_currency, retainer_day_of_month, retainer_next_invoice_at"
    )
    .eq("retainer_auto_invoice", true)
    .eq("status", "active")
    .is("deleted_at", null)
    .lte("retainer_next_invoice_at", nowIso)
    .order("retainer_next_invoice_at", { ascending: true })
    .limit(25);

  if (error) throw new Error(error.message);

  let created = 0;
  let sent = 0;
  let failed = 0;

  for (const project of dueProjects || []) {
    try {
      const amount = Number(project.retainer_amount) || 0;
      if (amount <= 0 || !project.client_id) {
        failed += 1;
        continue;
      }

      const monthLabel = new Date().toLocaleString("en-GB", {
        month: "long",
        year: "numeric",
      });

      const userId = project.created_by || "";
      if (!userId) {
        failed += 1;
        continue;
      }

      const invoice = await createProjectInvoice(db, {
        organizationId: project.organization_id,
        clientId: project.client_id,
        projectId: project.id,
        proposalId: project.proposal_id,
        userId,
        currency: project.retainer_currency || "USD",
        description: `Retainer — ${project.name} (${monthLabel})`,
        amount,
        notes: `Automatic retainer invoice for ${project.name}`,
      });
      created += 1;

      const [{ data: client }, { data: org }, { data: profile }] =
        await Promise.all([
          db
            .from("clients")
            .select("name, email")
            .eq("id", project.client_id)
            .maybeSingle(),
          db
            .from("organizations")
            .select("name")
            .eq("id", project.organization_id)
            .maybeSingle(),
          db
            .from("profiles")
            .select("full_name, email")
            .eq("id", userId)
            .maybeSingle(),
        ]);

      const recipientEmail = client?.email?.trim().toLowerCase() || "";
      if (recipientEmail) {
        const { data: fullInvoice } = await db
          .from("invoices")
          .select("id, number, total, currency, payment_token, due_date")
          .eq("id", invoice.id)
          .maybeSingle();

        let paymentToken = fullInvoice?.payment_token;
        if (!paymentToken) {
          paymentToken = nanoid(24);
          await db
            .from("invoices")
            .update({ payment_token: paymentToken })
            .eq("id", invoice.id);
        }

        const invoiceNumber = await ensureInvoiceNumber(db, {
          invoiceId: invoice.id,
          organizationId: project.organization_id,
          currentNumber: fullInvoice?.number || invoice.number,
        });

        await sendInvoiceInviteEmail({
          to: recipientEmail,
          recipientName: client?.name,
          senderName: profile?.full_name,
          organizationName: org?.name || "Your freelancer",
          invoiceNumber,
          amountLabel: formatInvoiceMoney(
            Number(fullInvoice?.total || amount),
            fullInvoice?.currency || project.retainer_currency || "USD"
          ),
          invoiceUrl: `${getAppUrl()}/pay/${paymentToken}`,
          message: DEFAULT_INVOICE_SEND_MESSAGE,
          fromUserId: userId,
        });

        await db
          .from("invoices")
          .update({
            status: "sent",
            number: invoiceNumber,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id);

        sent += 1;
      }

      const nextAt = advanceRetainerInvoiceAt(
        project.retainer_day_of_month || 1,
        project.retainer_next_invoice_at || nowIso
      );

      await db
        .from("projects")
        .update({
          retainer_last_invoiced_at: nowIso,
          retainer_next_invoice_at: nextAt.toISOString(),
          updated_at: nowIso,
        })
        .eq("id", project.id);
    } catch (err) {
      console.error(
        "[retainer invoices] project failed",
        project.id,
        err instanceof Error ? err.message : err
      );
      failed += 1;
    }
  }

  return { scanned: dueProjects?.length || 0, created, sent, failed };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processRetainerInvoices();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Retainer cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
