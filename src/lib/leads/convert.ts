import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;

export async function convertLeadToClient(
  supabase: Db,
  options: {
    leadId: string;
    organizationId: string;
    userId: string;
    status?: "prospect" | "active";
  }
) {
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id, name, email, phone, company, website, notes, converted_client_id, organization_id"
    )
    .eq("id", options.leadId)
    .eq("organization_id", options.organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead not found.");

  if (lead.converted_client_id) {
    return { clientId: lead.converted_client_id, created: false as const };
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      organization_id: options.organizationId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      website: lead.website,
      notes: lead.notes,
      status: options.status || "prospect",
      created_by: options.userId,
    })
    .select("id")
    .single();

  if (clientError) throw new Error(clientError.message);

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      converted_client_id: client.id,
      converted_at: new Date().toISOString(),
      status: "won",
    })
    .eq("id", lead.id);

  if (updateError) throw new Error(updateError.message);

  return { clientId: client.id, created: true as const };
}

/**
 * On proposal accept/sign: ensure a client exists (convert lead if needed),
 * mark the lead won, and activate the client.
 */
export async function markLeadWonFromProposal(
  supabase: Db,
  proposalId: string,
  options?: { userId?: string | null }
) {
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("id, lead_id, client_id, organization_id, created_by")
    .eq("id", proposalId)
    .maybeSingle();

  if (error || !proposal) return;

  let clientId = proposal.client_id;

  if (!clientId && proposal.lead_id) {
    const userId =
      options?.userId || proposal.created_by || null;
    if (!userId) return;

    const converted = await convertLeadToClient(supabase, {
      leadId: proposal.lead_id,
      organizationId: proposal.organization_id,
      userId,
      status: "active",
    });
    clientId = converted.clientId;

    await supabase
      .from("proposals")
      .update({ client_id: clientId })
      .eq("id", proposal.id)
      .is("client_id", null);
  }

  if (proposal.lead_id) {
    await supabase
      .from("leads")
      .update({
        status: "won",
        converted_client_id: clientId,
        converted_at: new Date().toISOString(),
        proposal_id: proposal.id,
      })
      .eq("id", proposal.lead_id)
      .is("deleted_at", null);
  }

  if (clientId) {
    await supabase
      .from("clients")
      .update({ status: "active" })
      .eq("id", clientId)
      .eq("status", "prospect");
  }
}
