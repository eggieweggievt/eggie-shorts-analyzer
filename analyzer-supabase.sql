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
--  V3.1 — CREATOR PROFILE FIELDS
--  Extends analyzer_user_prefs so the analyzer can bias suggestions
--  to YOUR niche, voice, and audience instead of generic advice.
-- ============================================================
DO $$ BEGIN
  -- Primary niche (gaming, chatting, art, variety, music, tech, lifestyle, irl, asmr, vrchat, ...)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='niche_primary') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN niche_primary text;
  END IF;
  -- Secondary niches (array — for variety creators that cover 2-3 categories)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='niche_secondary') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN niche_secondary jsonb DEFAULT '[]'::jsonb;
  END IF;
  -- VTuber type — pngtuber | 2d_live2d | 3d | irl | none
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='vtuber_type') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN vtuber_type text;
  END IF;
  -- Content forms — array of shorts | long-form | livestream
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='content_forms') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN content_forms jsonb DEFAULT '[]'::jsonb;
  END IF;
  -- Voice/tone — array of chaotic | chill | energetic | wholesome | edgy | dry-humor | sweet | sharp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='voice_tone') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN voice_tone jsonb DEFAULT '[]'::jsonb;
  END IF;
  -- Target audience — free text ("who are you making this for?")
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='target_audience') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN target_audience text;
  END IF;
  -- Platforms — array of youtube | twitch | tiktok | instagram | x | kick
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='platforms') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN platforms jsonb DEFAULT '[]'::jsonb;
  END IF;
  -- Goals — subscribers | watch-time | community | brand-deals | algorithm-pickup
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='goals') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN goals jsonb DEFAULT '[]'::jsonb;
  END IF;
  -- Topic synonyms — {"Elden Ring": ["soulslike", "fromsoft"]}
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='topic_synonyms') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN topic_synonyms jsonb DEFAULT '{}'::jsonb;
  END IF;
  -- Onboarding completion timestamp — null = needs onboarding modal
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='onboarded_at') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN onboarded_at timestamptz;
  END IF;
  -- V3.2 — Candidate tags: pool of preferred tags that are ALWAYS candidates but only
  -- picked if they fit (different from sticky_tags which are force-injected).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='analyzer_user_prefs' AND column_name='candidate_tags') THEN
    ALTER TABLE analyzer_user_prefs ADD COLUMN candidate_tags jsonb DEFAULT '[]'::jsonb;
  END IF;
END$$;

-- ============================================================
--  V3.2 — TAG RATINGS (thumbs-up / thumbs-down on suggested hashtags)
--  Mirrors analyzer_title_ratings but for hashtags. Lets the analyzer
--  learn which tags the user accepts vs rejects across many runs.
-- ============================================================
CREATE TABLE IF NOT EXISTS analyzer_tag_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid REFERENCES analyzer_runs(id) ON DELETE SET NULL,
  tag text NOT NULL,                                  -- normalized lower-case, no '#'
  rating int NOT NULL CHECK (rating IN (-1, 0, 1)),   -- -1 dislike, 1 like, 0 neutral/skip
  source text,                                        -- where the suggestion came from: 'detection' | 'niche' | 'sticky' | 'winner' | 'candidate' | 'synonym'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tag_ratings_user_idx ON analyzer_tag_ratings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tag_ratings_tag_idx ON analyzer_tag_ratings(user_id, tag);

ALTER TABLE analyzer_tag_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own tag ratings" ON analyzer_tag_ratings;
CREATE POLICY "users manage own tag ratings" ON analyzer_tag_ratings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
--  Done! Reload analyzer.html — you'll see a "Sign in" pill in the header.
--  After signing in: saved runs, thumbs-up titles, sticky tags, posted-perf logging,
--  + V3.1 creator profile (niche / voice / audience) that biases every suggestion.
-- ============================================================
