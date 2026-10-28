-- Ephemeral drafts for the public free proposal generator (rebban.com lead magnet).
-- Accessed only via service-role API routes; no anon/authenticated policies.

create table if not exists public.free_proposal_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  amount numeric not null default 0,
  currency text not null default 'USD',
  client_name text,
  client_company text,
  freelancer_name text,
  email text,
  pdf_sent_at timestamptz,
  download_token_hash text,
  download_token_expires_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists free_proposal_drafts_ip_created_idx
  on public.free_proposal_drafts (ip_hash, created_at desc);

create index if not exists free_proposal_drafts_expires_idx
  on public.free_proposal_drafts (expires_at);

alter table public.free_proposal_drafts enable row level security;

comment on table public.free_proposal_drafts is
  'Marketing free-proposal drafts; service role only. Email set when PDF is delivered.';
