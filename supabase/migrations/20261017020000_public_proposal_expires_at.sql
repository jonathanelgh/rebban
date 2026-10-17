-- Include proposal expires_at on the public client link payload.
CREATE OR REPLACE FUNCTION public.get_public_proposal(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  link public.proposal_share_links;
  prop public.proposals;
  org public.organizations;
  client_row public.clients;
  sig public.proposal_signatures;
  sender public.profiles;
begin
  link := public.resolve_share_link(p_token);

  select * into prop from public.proposals
  where id = link.proposal_id and deleted_at is null;

  if prop.id is null then
    raise exception 'Proposal not found';
  end if;

  select * into org from public.organizations where id = prop.organization_id;
  select * into client_row from public.clients where id = prop.client_id;
  select * into sig from public.proposal_signatures where proposal_id = prop.id;
  select * into sender from public.profiles where id = prop.created_by;

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
    'client', case when client_row.id is null then null else jsonb_build_object(
      'id', client_row.id,
      'name', client_row.name,
      'company', client_row.company,
      'email', client_row.email
    ) end,
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
      'signature_text', sig.signature_text
    ) end
  );
end;
$function$;
