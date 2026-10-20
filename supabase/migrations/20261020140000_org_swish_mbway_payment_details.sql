-- Local mobile payment details for invoices (Sweden Swish, Portugal MB Way).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS payment_swish text,
  ADD COLUMN IF NOT EXISTS payment_mbway text;

COMMENT ON COLUMN public.organizations.payment_swish IS
  'Swedish Swish phone number shown on invoices for manual payment';
COMMENT ON COLUMN public.organizations.payment_mbway IS
  'Portuguese MB Way phone number shown on invoices for manual payment';

CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv public.invoices;
  org public.organizations;
  client_row public.clients;
  lines jsonb;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Not found';
  end if;

  select * into inv
  from public.invoices
  where payment_token = trim(p_token)
    and deleted_at is null;

  if inv.id is null then
    raise exception 'Not found';
  end if;

  select * into org from public.organizations where id = inv.organization_id;
  select * into client_row from public.clients where id = inv.client_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'description', li.description,
        'quantity', li.quantity,
        'unit_price', li.unit_price,
        'amount', li.amount,
        'position', li.position
      )
      order by li.position asc
    ),
    '[]'::jsonb
  )
  into lines
  from public.invoice_line_items li
  where li.invoice_id = inv.id;

  return jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', inv.id,
      'number', inv.number,
      'status', inv.status,
      'currency', inv.currency,
      'subtotal', inv.subtotal,
      'tax_total', inv.tax_total,
      'total', inv.total,
      'due_date', inv.due_date,
      'issue_date', inv.issue_date,
      'notes', inv.notes,
      'paid_at', inv.paid_at,
      'show_logo', inv.show_logo,
      'banner_url', inv.banner_url,
      'late_fee_enabled', inv.late_fee_enabled,
      'late_fee_percent', inv.late_fee_percent,
      'tax_enabled', inv.tax_enabled,
      'tax_rate', inv.tax_rate,
      'prices_include_tax', inv.prices_include_tax,
      'show_tax_id', inv.show_tax_id,
      'tax_id', inv.tax_id,
      'show_shipping_address', inv.show_shipping_address,
      'shipping_address', inv.shipping_address,
      'show_reference', inv.show_reference,
      'reference_number', inv.reference_number,
      'organization_id', inv.organization_id,
      'client_id', inv.client_id,
      'stripe_checkout_session_id', inv.stripe_checkout_session_id
    ),
    'organization', case when org.id is null then null else jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'legal_name', org.legal_name,
      'logo_url', org.logo_url,
      'address', org.address,
      'tax_id', org.tax_id,
      'currency', org.currency,
      'stripe_account_id', org.stripe_account_id,
      'stripe_charges_enabled', org.stripe_charges_enabled,
      'payment_iban', org.payment_iban,
      'payment_bankgiro', org.payment_bankgiro,
      'payment_swish', org.payment_swish,
      'payment_mbway', org.payment_mbway
    ) end,
    'client', case when client_row.id is null then null else jsonb_build_object(
      'name', client_row.name,
      'company', client_row.company,
      'email', client_row.email
    ) end,
    'lines', lines
  );
end;
$function$;
