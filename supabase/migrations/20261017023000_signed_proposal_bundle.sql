-- Bundle for post-sign PDF + confirmation email (SECURITY DEFINER; token-gated).
CREATE OR REPLACE FUNCTION public.get_signed_proposal_bundle(p_token text)
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
  events jsonb;
begin
  link := public.resolve_share_link(p_token);

  select * into prop from public.proposals
  where id = link.proposal_id and deleted_at is null;

  if prop.id is null then
    raise exception 'Proposal not found';
  end if;

  if prop.status <> 'accepted' then
    raise exception 'Proposal is not signed';
  end if;

  select * into org from public.organizations where id = prop.organization_id;
  select * into client_row from public.clients where id = prop.client_id;
  select * into sig from public.proposal_signatures where proposal_id = prop.id;
  select * into sender from public.profiles where id = prop.created_by;

  if sig.id is null then
    raise exception 'Signature not found';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'event_type', e.event_type,
      'actor_type', e.actor_type,
      'actor_name', e.actor_name,
      'actor_email', e.actor_email,
      'ip_address', e.ip_address,
      'user_agent', e.user_agent,
      'created_at', e.created_at,
      'metadata', e.metadata
    )
    order by e.created_at asc
  ), '[]'::jsonb)
  into events
  from public.proposal_events e
  where e.proposal_id = prop.id;

  return jsonb_build_object(
    'token', link.token,
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
    'signature', jsonb_build_object(
      'id', sig.id,
      'signer_name', sig.signer_name,
      'signer_email', sig.signer_email,
      'signer_title', sig.signer_title,
      'signer_company', sig.signer_company,
      'signed_at', sig.signed_at,
      'document_hash', sig.document_hash,
      'signature_type', sig.signature_type,
      'signature_text', sig.signature_text,
      'signature_image', sig.signature_image,
      'consent_text', sig.consent_text,
      'ip_address', sig.ip_address,
      'user_agent', sig.user_agent
    ),
    'events', events
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_signed_proposal_bundle(text) TO anon, authenticated;
