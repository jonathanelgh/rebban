import { NextResponse } from "next/server";
import {
  loadAdminOrganizations,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { formatInvoiceMoney } from "@/lib/invoices/totals";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const { id } = await context.params;
    const orgs = await loadAdminOrganizations(gate.db);
    const org = orgs.find((o) => o.id === id);
    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const payments: Array<{
      id: string;
      number: string | null;
      status: string;
      amountLabel: string;
      currency: string;
      createdAt: string;
      hostedInvoiceUrl: string | null;
    }> = [];

    if (isStripeConfigured() && org.stripeCustomerId) {
      try {
        const stripe = getStripe();
        const invoices = await stripe.invoices.list({
          customer: org.stripeCustomerId,
          limit: 25,
        });
        for (const inv of invoices.data) {
          const amount = (inv.amount_paid || inv.total || 0) / 100;
          const currency = (inv.currency || "usd").toUpperCase();
          payments.push({
            id: inv.id,
            number: inv.number,
            status: inv.status || "unknown",
            amountLabel: formatInvoiceMoney(amount, currency),
            currency,
            createdAt: new Date(inv.created * 1000).toISOString(),
            hostedInvoiceUrl: inv.hosted_invoice_url || null,
          });
        }
      } catch (err) {
        console.error("admin org stripe invoices failed", err);
      }
    }

    return NextResponse.json({ organization: org, payments });
  } catch (error) {
    console.error("admin org detail failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load organization",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const { id } = await context.params;
    const { data: org } = await gate.db
      .from("organizations")
      .select("id, created_by, stripe_subscription_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
      isStripeConfigured() &&
      org.stripe_subscription_id
    ) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(org.stripe_subscription_id);
      } catch (err) {
        console.error("admin delete cancel subscription failed", err);
      }
    }

    const now = new Date().toISOString();
    const { error: orgError } = await gate.db
      .from("organizations")
      .update({
        deleted_at: now,
        stripe_subscription_status: "canceled",
        complimentary_pro: false,
        updated_at: now,
      })
      .eq("id", id);

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    if (org.created_by) {
      await gate.db
        .from("profiles")
        .update({ deleted_at: now })
        .eq("id", org.created_by)
        .is("deleted_at", null);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin org delete failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete user",
      },
      { status: 500 }
    );
  }
}
