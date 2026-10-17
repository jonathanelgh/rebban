import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import {
  convertProposalToProject,
  type ConvertProposalInput,
} from "@/lib/projects/convert-from-proposal";
import type { InvoiceKind, ProjectBillingType } from "@/lib/projects/billing";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: proposalId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entitlement = await requireOrgEntitlement(supabase, user.id);
    if ("response" in entitlement) return entitlement.response;

    const body = (await request.json()) as Partial<ConvertProposalInput> & {
      invoiceKind?: InvoiceKind;
      billingType?: ProjectBillingType;
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Project name is required." },
        { status: 400 }
      );
    }

    const invoiceKind = (body.invoiceKind || "none") as InvoiceKind;
    if (!["none", "deposit", "retainer", "full"].includes(invoiceKind)) {
      return NextResponse.json(
        { error: "Invalid invoice option." },
        { status: 400 }
      );
    }

    const result = await convertProposalToProject(supabase, {
      proposalId,
      userId: user.id,
      organizationId: entitlement.organizationId,
      name: body.name.trim(),
      description: body.description || null,
      startDate: body.startDate || null,
      billingType: body.billingType,
      invoiceKind,
      depositAmount: body.depositAmount,
      retainerAutoInvoice: body.retainerAutoInvoice,
      retainerDayOfMonth: body.retainerDayOfMonth,
      generateAiTasks: Boolean(body.generateAiTasks),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not convert proposal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
