-- Proposals may target a lead (first engagement) or an existing client.
-- At least one of client_id / lead_id must be set.

-- Backfill: if any orphan rows exist, leave them and skip check (should be none).
-- Prefer failing loudly in app for new writes.

do $$
begin
  if exists (
    select 1 from public.proposals
    where deleted_at is null
      and client_id is null
      and lead_id is null
  ) then
    raise notice 'Some proposals have neither client_id nor lead_id; constraint not added yet.';
  else
    alter table public.proposals
      drop constraint if exists proposals_client_or_lead_chk;
    alter table public.proposals
      add constraint proposals_client_or_lead_chk
      check (client_id is not null or lead_id is not null);
  end if;
end $$;

-- Public proposal payload: fall back to lead when client is null.
create or replace function public.get_public_proposal(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  link public.proposal_share_links;
  prop public.proposals;
  org public.organizations;
  client_row public.clients;
  lead_row public.leads;
  sig public.proposal_signatures;
  sender public.profiles;
  recipient jsonb;
begin
  link := public.resolve_share_link(p_token);

  select * into prop from public.proposals
  where id = link.proposal_id and deleted_at is null;

  if prop.id is null then
    raise exception 'Proposal not found';
  end if;

  select * into org from public.organizations where id = prop.organization_id;
  select * into client_row from public.clients where id = prop.client_id;
  select * into lead_row from public.leads where id = prop.lead_id;
  select * into sig from public.proposal_signatures where proposal_id = prop.id;
  select * into sender from public.profiles where id = prop.created_by;

  if client_row.id is not null then
    recipient := jsonb_build_object(
      'id', client_row.id,
      'name', client_row.name,
      'company', client_row.company,
      'email', client_row.email
    );
  elsif lead_row.id is not null then
    recipient := jsonb_build_object(
      'id', lead_row.id,
      'name', lead_row.name,
      'company', lead_row.company,
      'email', lead_row.email
    );
  else
    recipient := null;
  end if;

  return jsonb_build_object(
    'token', link.token,
    'recipient_email', link.recipient_email,
    'recipient_name', link.recipient_name,
    'proposal', jsonb_build_object(
      'id', prop.id,
      'title', prop.title,
      'status', prop.status,
      'currency', prop.currency,
      'amount', prop.amount,
      'content', prop.content,
      'sent_at', prop.sent_at,
      'viewed_at', prop.viewed_at,
      'accepted_at', prop.accepted_at,
      'declined_at', prop.declined_at,
      'expires_at', prop.expires_at
    ),
    'organization', jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'logo_url', org.logo_url,
      'description', org.description
    ),
    'client', recipient,
    'sender', case when sender.id is null then null else jsonb_build_object(
      'full_name', sender.full_name,
      'email', sender.email
    ) end,
    'signature', case when sig.id is null then null else jsonb_build_object(
      'id', sig.id,
      'signer_name', sig.signer_name,
      'signer_email', sig.signer_email,
      'signed_at', sig.signed_at,
      'document_hash', sig.document_hash,
      'signature_type', sig.signature_type,
      'signature_text', sig.signature_text,
      'signature_image', sig.signature_image
    ) end
  );
end;
$function$;
