CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  path text NOT NULL,
  title text,
  referrer text,
  host text,
  visitor_id text,
  user_id uuid,
  article_id uuid REFERENCES public.blog_posts (id) ON DELETE SET NULL,
  article_slug text
);

CREATE INDEX analytics_events_occurred_at_idx
  ON public.analytics_events (occurred_at DESC);
CREATE INDEX analytics_events_event_name_idx
  ON public.analytics_events (event_name, occurred_at DESC);
CREATE INDEX analytics_events_article_idx
  ON public.analytics_events (article_id, occurred_at DESC)
  WHERE article_id IS NOT NULL;
CREATE INDEX analytics_events_path_idx
  ON public.analytics_events (path, occurred_at DESC);
CREATE INDEX analytics_events_visitor_idx
  ON public.analytics_events (visitor_id, occurred_at DESC)
  WHERE visitor_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_events_admin_select
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());
