-- Blog automation: topic queue, schedule settings, and cover storage.

CREATE TABLE IF NOT EXISTS public.blog_automation_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  posts_per_day integer NOT NULL DEFAULT 2
    CHECK (posts_per_day >= 1 AND posts_per_day <= 4),
  publish_times text[] NOT NULL DEFAULT ARRAY['08:30', '17:30']::text[],
  timezone text NOT NULL DEFAULT 'Europe/Stockholm',
  author text NOT NULL DEFAULT 'Rebban',
  topic_batch_size integer NOT NULL DEFAULT 60
    CHECK (topic_batch_size >= 10 AND topic_batch_size <= 120),
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.blog_automation_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.blog_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  angle text NOT NULL DEFAULT '',
  category text NOT NULL,
  target_keyword text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}'::text[],
  similarity_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status = ANY (ARRAY[
      'queued'::text,
      'writing'::text,
      'published'::text,
      'skipped'::text,
      'failed'::text
    ])),
  priority integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'ai'
    CHECK (source = ANY (ARRAY['ai'::text, 'manual'::text])),
  blog_post_id uuid REFERENCES public.blog_posts (id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_topics_similarity_key_unique UNIQUE (similarity_key)
);

CREATE INDEX IF NOT EXISTS blog_topics_status_priority_idx
  ON public.blog_topics (status, priority DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS public.blog_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date date NOT NULL,
  slot_time text NOT NULL,
  topic_id uuid REFERENCES public.blog_topics (id) ON DELETE SET NULL,
  blog_post_id uuid REFERENCES public.blog_posts (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'started'
    CHECK (status = ANY (ARRAY[
      'started'::text,
      'published'::text,
      'failed'::text,
      'skipped'::text
    ])),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_automation_runs_slot_unique UNIQUE (slot_date, slot_time)
);

CREATE INDEX IF NOT EXISTS blog_automation_runs_slot_date_idx
  ON public.blog_automation_runs (slot_date DESC);

ALTER TABLE public.blog_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blog_automation_settings_admin ON public.blog_automation_settings;
CREATE POLICY blog_automation_settings_admin
  ON public.blog_automation_settings
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS blog_topics_admin ON public.blog_topics;
CREATE POLICY blog_topics_admin
  ON public.blog_topics
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS blog_automation_runs_admin ON public.blog_automation_runs;
CREATE POLICY blog_automation_runs_admin
  ON public.blog_automation_runs
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

REVOKE ALL ON public.blog_automation_settings FROM anon;
REVOKE ALL ON public.blog_topics FROM anon;
REVOKE ALL ON public.blog_automation_runs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_automation_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_automation_runs TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-covers',
  'blog-covers',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS blog_covers_public_read ON storage.objects;
CREATE POLICY blog_covers_public_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'blog-covers');

DROP POLICY IF EXISTS blog_covers_admin_write ON storage.objects;
CREATE POLICY blog_covers_admin_write
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'blog-covers' AND public.is_platform_admin())
  WITH CHECK (bucket_id = 'blog-covers' AND public.is_platform_admin());
