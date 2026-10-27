import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { convertLeadToClient } from "@/lib/leads/convert";

type Db = SupabaseClient<Database>;

function cleanEmail(value: unknown) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email.slice(0, 320);
}

function cleanName(value: unknown, fallback = "New client") {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 160);
  return name || fallback;
}

/**
 * Find an existing client/lead by email, or create lead + client.
 */
export async function resolveClientForExtension(
  db: Db,
  options: {
    organizationId: string;
    userId: string;
    email?: string | null;
    name?: string | null;
    company?: string | null;
    notes?: string | null;
    source?: string;
  }
) {
  const email = cleanEmail(options.email);
  const name = cleanName(options.name, email ? email.split("@")[0] : "New client");
  const company = String(options.company || "").trim().slice(0, 160) || null;
  const notes = String(options.notes || "").trim().slice(0, 4000) || null;
  const source = options.source || "email";

  if (email) {
    const { data: existingClient } = await db
      .from("clients")
      .select("id, name, email")
      .eq("organization_id", options.organizationId)
      .is("deleted_at", null)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (existingClient) {
      return {
        clientId: existingClient.id,
        clientName: existingClient.name,
        createdClient: false,
        createdLead: false,
        leadId: null as string | null,
      };
    }

    const { data: existingLead } = await db
      .from("leads")
      .select("id, name, converted_client_id")
      .eq("organization_id", options.organizationId)
      .is("deleted_at", null)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (existingLead?.converted_client_id) {
      return {
        clientId: existingLead.converted_client_id,
        clientName: existingLead.name,
        createdClient: false,
        createdLead: false,
        leadId: existingLead.id,
      };
    }

    if (existingLead) {
      const converted = await convertLeadToClient(db, {
        leadId: existingLead.id,
        organizationId: options.organizationId,
        userId: options.userId,
        status: "prospect",
      });
      return {
        clientId: converted.clientId,
        clientName: existingLead.name,
        createdClient: converted.created,
        createdLead: false,
        leadId: existingLead.id,
      };
    }
  }

  const { data: lead, error: leadError } = await db
    .from("leads")
    .insert({
      organization_id: options.organizationId,
      created_by: options.userId,
      name,
      email,
      company,
      notes,
      source,
      status: "new",
    })
    .select("id, name")
    .single();

  if (leadError || !lead) {
    throw new Error(leadError?.message || "Could not create lead.");
  }

  const converted = await convertLeadToClient(db, {
    leadId: lead.id,
    organizationId: options.organizationId,
    userId: options.userId,
    status: "prospect",
  });

  return {
    clientId: converted.clientId,
    clientName: lead.name,
    createdClient: true,
    createdLead: true,
    leadId: lead.id,
  };
}
