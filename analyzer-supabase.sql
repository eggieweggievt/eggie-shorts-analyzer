-- ============================================================
--  ANALYZER BACKEND — Supabase migration
--  Run this in Supabase Dashboard → SQL Editor → New query
--  Adds: saved analyses (history), title learning, sticky tags,
--        posted-performance feedback, community trend data sync.
-- ============================================================

-- 1) User preferences — sticky tags, channel info, personal content profile
CREATE TABLE IF NOT EXISTS analyzer_user_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  channel_url text,
  sticky_tags jsonb DEFAULT '[]'::jsonb,                -- always include these in the mix
  blocked_tags jsonb DEFAULT '[]'::jsonb,               -- never suggest these
  preferred_content_types jsonb DEFAULT '[]'::jsonb,    -- learned from past runs
  preferred_template_weights jsonb DEFAULT '{}'::jsonb, -- {curiosity: 1.2, shock: 0.9, ...}
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE analyzer_user_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own prefs" ON analyzer_user_prefs;
CREATE POLICY "users manage own prefs" ON analyzer_user_prefs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) Saved analyses — every analyzer run the user wants to keep
CREATE TABLE IF NOT EXISTS analyzer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  description text,                                     -- the user's quickContext
  platform text,                                        -- youtube_shorts | tiktok | etc.
  short_type text,                                      -- the picked content-type pill
  hashtags jsonb DEFAULT '[]'::jsonb,
  detected_topics jsonb DEFAULT '{}'::jsonb,
  generated_titles jsonb DEFAULT '[]'::jsonb,           -- the titles we suggested
  picked_title text,                                    -- which one the user actually used
  score int,
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  thumbnail_url text,
  -- Posted performance — filled in by the user after they ship
  posted_at timestamptz,
  posted_url text,
  actual_views int,
  actual_likes int,
  actual_comments int,
  actual_shares int,
  performance_notes text,
  -- Bookkeeping
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analyzer_runs_user_idx ON analyzer_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analyzer_runs_posted_idx ON analyzer_runs(user_id, posted_at DESC) WHERE posted_at IS NOT NULL;

ALTER TABLE analyzer_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own runs" ON analyzer_runs;
CREATE POLICY "users manage own runs" ON analyzer_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Title rating feedback — every thumbs up/down on a generated title
CREATE TABLE IF NOT EXISTS analyzer_title_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid REFERENCES analyzer_runs(id) ON DELETE SET NULL,
  generated_title text NOT NULL,
  template_category text,        -- 'curiosity' | 'shock' | 'vtuber' | etc.
  subject_text text,             -- what the template's noun slot held
  rating int NOT NULL CHECK (rating IN (-1, 0, 1)),  -- -1 dislike, 1 like, 0 neutral/skip
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS title_ratings_user_idx ON analyzer_title_ratings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS title_ratings_template_idx ON analyzer_title_ratings(user_id, template_category);

ALTER TABLE analyzer_title_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own ratings" ON analyzer_title_ratings;
CREATE POLICY "users manage own ratings" ON analyzer_title_ratings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) Community trends data — single shared cache for outliers / trending / keywords
--    Read-only for authenticated users; only an admin role writes.
CREATE TABLE IF NOT EXISTS analyzer_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,            -- 'outliers' | 'trending' | 'keywords' | 'titles' | 'channels'
  niche text DEFAULT 'vtuber',   -- future-proof for multi-niche
  data jsonb NOT NULL,
  source text,                   -- e.g. 'vidiq_outliers'
  notes text,
  refreshed_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS trends_kind_idx ON analyzer_trends(kind, niche, refreshed_at DESC);

ALTER TABLE analyzer_trends ENABLE ROW LEVEL SECURITY;
-- Anyone signed in can read trends
DROP POLICY IF EXISTS "anyone reads trends" ON analyzer_trends;
CREATE POLICY "anyone reads trends" ON analyzer_trends
  FOR SELECT
  USING (true);
-- Only the admin can write — uses a custom claim or just disable writes from anon entirely.
-- For now the scheduled task pushes via service-role key, which bypasses RLS.

-- ============================================================
--  Done! Reload analyzer.html — you'll see a "Sign in" pill in the header.
--  After signing in: saved runs, thumbs-up titles, sticky tags, posted-perf logging.
-- ============================================================
