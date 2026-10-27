-- Freelancer context for marketplace bid drafts (Upwork / Freelancer.com, etc.)
alter table public.profiles
  add column if not exists marketplace_profile jsonb not null default '{}'::jsonb;

comment on column public.profiles.marketplace_profile is
  'Structured About-you context for Chrome extension marketplace bid drafts: services, experience/CV, skills, rates, portfolio.';
