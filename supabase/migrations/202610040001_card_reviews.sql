-- Inherit the existing card ID type instead of assuming integer vs bigint.
CREATE TABLE public.card_reviews AS
SELECT id AS card_id FROM public.card_versions WITH NO DATA;
ALTER TABLE public.card_reviews
  ADD PRIMARY KEY (card_id),
  ADD FOREIGN KEY (card_id) REFERENCES public.card_versions(id) ON DELETE CASCADE,
  ADD COLUMN youtube_video_id text NOT NULL CHECK (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  ADD COLUMN title text NOT NULL,
  ADD COLUMN channel_title text NOT NULL,
  ADD COLUMN thumbnail_url text NOT NULL;

ALTER TABLE public.card_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public review reads" ON public.card_reviews
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.card_reviews TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.card_reviews FROM anon, authenticated;
GRANT ALL ON public.card_reviews TO service_role;
