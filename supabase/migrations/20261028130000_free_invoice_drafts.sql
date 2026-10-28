-- Ephemeral drafts for the public free invoice generator (rebban.com lead magnet).
-- Accessed only via service-role API routes; no anon/authenticated policies.

create table if not exists public.free_invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  payload jsonb not null default '{}'::jsonb,
  total numeric not null default 0,
  currency text not null default 'USD',
  from_name text,
  bill_to_name text,
  email text,
  pdf_sent_at timestamptz,
  download_token_hash text,
  download_token_expires_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists free_invoice_drafts_ip_created_idx
  on public.free_invoice_drafts (ip_hash, created_at desc);

create index if not exists free_invoice_drafts_expires_idx
  on public.free_invoice_drafts (expires_at);

alter table public.free_invoice_drafts enable row level security;

comment on table public.free_invoice_drafts is
  'Marketing free-invoice drafts; service role only. Email set when PDF is delivered.';
