-- Global lead source catalog (managed in DB; app reads at runtime).

CREATE TABLE public.lead_sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  icon text,
  image_url text,
  keywords text[] NOT NULL DEFAULT '{}'::text[],
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_sources_active_sort_idx
  ON public.lead_sources (is_active, sort_order, name);

CREATE TRIGGER lead_sources_updated_at
  BEFORE UPDATE ON public.lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_sources_select
  ON public.lead_sources FOR SELECT
  TO authenticated
  USING (is_active = true);

GRANT SELECT ON public.lead_sources TO authenticated;
GRANT ALL ON public.lead_sources TO service_role;

INSERT INTO public.lead_sources (id, name, icon, keywords, sort_order) VALUES
  ('website',  'Website',            'website',  ARRAY['web','site','organic'], 10),
  ('form',     'Website form',       'form',     ARRAY['embed','lead form','contact form'], 20),
  ('whatsapp', 'WhatsApp',           'whatsapp', ARRAY['wa','chat','message'], 30),
  ('instagram','Instagram',          'instagram',ARRAY['ig','reels','dm'], 40),
  ('facebook', 'Facebook',           'facebook', ARRAY['fb','meta','messenger'], 50),
  ('linkedin', 'LinkedIn',           'linkedin', ARRAY['li','professional'], 60),
  ('twitter',  'X (Twitter)',        'twitter',  ARRAY['x','tweet','twitter'], 70),
  ('tiktok',   'TikTok',             'tiktok',   ARRAY['tt','short video'], 80),
  ('youtube',  'YouTube',            'youtube',  ARRAY['yt','video'], 90),
  ('google',   'Google',             'google',   ARRAY['ads','search','seo','gmb'], 100),
  ('email',    'Email',              'email',    ARRAY['mail','inbox'], 110),
  ('phone',    'Phone',              'phone',    ARRAY['call','mobile','tel'], 120),
  ('referral', 'Referral',           'referral', ARRAY['word of mouth','recommend','intro'], 130),
  ('event',    'Event / networking', 'event',    ARRAY['meetup','conference','networking'], 140),
  ('manual',   'Manual entry',       'manual',   ARRAY['added','internal'], 150),
  ('other',    'Other',              'other',    ARRAY['misc','unknown'], 160)
ON CONFLICT (id) DO NOTHING;
