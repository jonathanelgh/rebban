-- Lock down blog_posts: anyone can read published posts; only platform admins write.

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blog_posts_select_published ON public.blog_posts;
CREATE POLICY blog_posts_select_published
  ON public.blog_posts
  FOR SELECT
  USING (
    status = 'published'
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS blog_posts_admin_insert ON public.blog_posts;
CREATE POLICY blog_posts_admin_insert
  ON public.blog_posts
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS blog_posts_admin_update ON public.blog_posts;
CREATE POLICY blog_posts_admin_update
  ON public.blog_posts
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS blog_posts_admin_delete ON public.blog_posts;
CREATE POLICY blog_posts_admin_delete
  ON public.blog_posts
  FOR DELETE
  USING (public.is_platform_admin());

-- Anon should not mutate blog posts even if grants remain.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.blog_posts FROM anon;
GRANT SELECT ON public.blog_posts TO anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.blog_posts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
