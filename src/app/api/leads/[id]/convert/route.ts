import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgEntitlement } from "@/lib/billing/require-entitlement";
import { convertLeadToClient } from "@/lib/leads/convert";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      status?: "prospect" | "active";
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
    const organizationId = entitlement.organizationId;

    const result = await convertLeadToClient(supabase, {
      leadId: id,
      organizationId,
      userId: user.id,
      status: body.status || "prospect",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to convert lead";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
