-- Blog categories as a first-class table; posts/topics reference by FK.

CREATE TABLE IF NOT EXISTS public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_categories_name_unique UNIQUE (name),
  CONSTRAINT blog_categories_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS blog_categories_sort_idx
  ON public.blog_categories (sort_order ASC, name ASC);

INSERT INTO public.blog_categories (name, slug, sort_order)
VALUES
  ('Workflow', 'workflow', 10),
  ('Invoicing', 'invoicing', 20),
  ('Proposals', 'proposals', 30),
  ('Time tracking', 'time-tracking', 40),
  ('Mindset', 'mindset', 50),
  ('Clients', 'clients', 60),
  ('Projects', 'projects', 70),
  ('Pricing', 'pricing', 80)
ON CONFLICT (slug) DO NOTHING;

-- Capture any free-text categories already in use.
INSERT INTO public.blog_categories (name, slug, sort_order)
SELECT DISTINCT
  trim(category) AS name,
  trim(both '-' from lower(regexp_replace(trim(category), '[^a-zA-Z0-9]+', '-', 'g'))) AS slug,
  100
FROM (
  SELECT category FROM public.blog_posts WHERE nullif(trim(category), '') IS NOT NULL
  UNION
  SELECT category FROM public.blog_topics WHERE nullif(trim(category), '') IS NOT NULL
) AS existing
WHERE trim(category) <> ''
  AND trim(both '-' from lower(regexp_replace(trim(category), '[^a-zA-Z0-9]+', '-', 'g'))) <> ''
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.blog_categories (id);

ALTER TABLE public.blog_topics
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.blog_categories (id);

UPDATE public.blog_posts p
SET category_id = c.id
FROM public.blog_categories c
WHERE p.category_id IS NULL
  AND lower(trim(p.category)) = lower(c.name);

UPDATE public.blog_topics t
SET category_id = c.id
FROM public.blog_categories c
WHERE t.category_id IS NULL
  AND lower(trim(t.category)) = lower(c.name);

-- Fallback any remaining rows to Workflow.
UPDATE public.blog_posts
SET category_id = (SELECT id FROM public.blog_categories WHERE slug = 'workflow' LIMIT 1)
WHERE category_id IS NULL;

UPDATE public.blog_topics
SET category_id = (SELECT id FROM public.blog_categories WHERE slug = 'workflow' LIMIT 1)
WHERE category_id IS NULL;

ALTER TABLE public.blog_posts
  ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE public.blog_topics
  ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS category;
ALTER TABLE public.blog_topics DROP COLUMN IF EXISTS category;

CREATE INDEX IF NOT EXISTS blog_posts_category_id_idx
  ON public.blog_posts (category_id);

CREATE INDEX IF NOT EXISTS blog_topics_category_id_idx
  ON public.blog_topics (category_id);

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blog_categories_select ON public.blog_categories;
CREATE POLICY blog_categories_select
  ON public.blog_categories
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS blog_categories_admin_write ON public.blog_categories;
CREATE POLICY blog_categories_admin_write
  ON public.blog_categories
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

REVOKE ALL ON public.blog_categories FROM anon;
GRANT SELECT ON public.blog_categories TO anon;

REVOKE ALL ON public.blog_categories FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_categories TO authenticated;
