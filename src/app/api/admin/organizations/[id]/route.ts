import { NextResponse } from "next/server";
import {
  loadAdminOrganizations,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { subscriptionPeriodEndIso } from "@/lib/stripe/billing-customer";

type RouteContext = { params: Promise<{ id: string }> };

async function countRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  table: string,
  organizationId: string,
  softDelete = true
) {
  let query = db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (softDelete) {
    query = query.is("deleted_at", null);
  }
  const { count, error } = await query;
  if (error) {
    console.error(`admin count ${table} failed`, error.message);
    return 0;
  }
  return count || 0;
}

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

    const { data: orgExtras } = await gate.db
      .from("organizations")
      .select(
        "stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted"
      )
      .eq("id", id)
      .maybeSingle();

    const [
      clients,
      invoices,
      proposals,
      leads,
      leadForms,
      tasks,
      timeEntries,
      projects,
    ] = await Promise.all([
      countRows(gate.db, "clients", id),
      countRows(gate.db, "invoices", id),
      countRows(gate.db, "proposals", id),
      countRows(gate.db, "leads", id),
      countRows(gate.db, "lead_forms", id),
      countRows(gate.db, "tasks", id),
      countRows(gate.db, "time_entries", id),
      countRows(gate.db, "projects", id),
    ]);

    const [{ data: gmailRows }, { data: outlookRows }] = await Promise.all([
      gate.db
        .from("gmail_connections")
        .select("email, connected_at, revoked_at, user_id")
        .eq("organization_id", id)
        .is("revoked_at", null)
        .order("connected_at", { ascending: false }),
      gate.db
        .from("outlook_connections")
        .select("email, connected_at, revoked_at, user_id")
        .eq("organization_id", id)
        .is("revoked_at", null)
        .order("connected_at", { ascending: false }),
    ]);

    const gmail = gmailRows?.[0] || null;
    const outlook = outlookRows?.[0] || null;

    const payments: Array<{
      id: string;
      number: string | null;
      status: string;
      amountLabel: string;
      currency: string;
      createdAt: string;
      hostedInvoiceUrl: string | null;
    }> = [];

    let connectConnectedAt: string | null = null;
    let subscription: {
      status: string | null;
      subscribedAt: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      priceId: string | null;
    } | null = null;

    if (isStripeConfigured()) {
      const stripe = getStripe();

      if (orgExtras?.stripe_account_id) {
        try {
          const account = await stripe.accounts.retrieve(
            orgExtras.stripe_account_id
          );
          if (account.created) {
            connectConnectedAt = new Date(account.created * 1000).toISOString();
          }
        } catch (err) {
          console.error("admin org connect account failed", err);
        }
      }

      if (org.stripeSubscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(
            org.stripeSubscriptionId
          );
          subscription = {
            status: sub.status,
            subscribedAt: sub.created
              ? new Date(sub.created * 1000).toISOString()
              : null,
            currentPeriodEnd: subscriptionPeriodEndIso(sub),
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            priceId: sub.items.data[0]?.price?.id || null,
          };
        } catch (err) {
          console.error("admin org subscription retrieve failed", err);
        }
      }

      if (org.stripeCustomerId) {
        try {
          const stripeInvoices = await stripe.invoices.list({
            customer: org.stripeCustomerId,
            limit: 25,
          });
          for (const inv of stripeInvoices.data) {
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
    }

    return NextResponse.json({
      organization: {
        ...org,
        stripeAccountId: orgExtras?.stripe_account_id ?? null,
        stripeChargesEnabled: Boolean(orgExtras?.stripe_charges_enabled),
        stripePayoutsEnabled: Boolean(orgExtras?.stripe_payouts_enabled),
        stripeDetailsSubmitted: Boolean(orgExtras?.stripe_details_submitted),
      },
      usage: {
        clients,
        invoices,
        proposals,
        leads,
        leadForms,
        tasks,
        timeEntries,
        projects,
      },
      connect: {
        connected: Boolean(orgExtras?.stripe_account_id),
        accountId: orgExtras?.stripe_account_id ?? null,
        chargesEnabled: Boolean(orgExtras?.stripe_charges_enabled),
        payoutsEnabled: Boolean(orgExtras?.stripe_payouts_enabled),
        detailsSubmitted: Boolean(orgExtras?.stripe_details_submitted),
        connectedAt: connectConnectedAt,
      },
      email: {
        gmail: gmail
          ? {
              connected: true,
              email: gmail.email,
              connectedAt: gmail.connected_at,
            }
          : { connected: false, email: null, connectedAt: null },
        outlook: outlook
          ? {
              connected: true,
              email: outlook.email,
              connectedAt: outlook.connected_at,
            }
          : { connected: false, email: null, connectedAt: null },
      },
      subscription,
      payments,
    });
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

    if (isStripeConfigured() && org.stripe_subscription_id) {
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
