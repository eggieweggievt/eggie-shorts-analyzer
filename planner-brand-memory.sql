-- ============================================================
--  CREATOR MEMORY — Supabase migration
--  Run this in Supabase Dashboard → SQL Editor → New query
--  ------------------------------------------------------------
--  Borrowed idea (from Odysseus' "memory / skills"): keep one
--  persistent profile of who YOU are — voice, audience, series,
--  word bank, links, freeform facts — so every current tool can
--  personalise, and any tool can be handed a clean profile
--  "this is the creator" context string instead of generic output.
--
--  Shape mirrors planner_habits_state: a single user-keyed row of
--  jsonb. localStorage-first; this table is just cross-device sync.
-- ============================================================

CREATE TABLE IF NOT EXISTS planner_brand_memory (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Identity + voice + audience + channel basics. This is the SINGLE creator
  -- profile — the Shorts Analyzer reads canonical fields straight off it.
  -- { creator_name, pronouns, tagline, vibe, emoji_style, audience,
  --   adjectives[], signature_phrases[], always_words[], never_words[],
  --   niche_primary, vtuber_type,              -- single canonical values
  --   content_forms[], platforms[], goals[], voice_tone[] }  -- multi canonical
  -- Canonical values match analyzer.html PROFILE_OPTIONS exactly.
  profile jsonb DEFAULT '{}'::jsonb,
  -- Recurring formats/series: [ { id, name, desc } ]
  series jsonb DEFAULT '[]'::jsonb,
  -- Links the creator wants on hand: [ { id, label, url } ]
  links jsonb DEFAULT '[]'::jsonb,
  -- Freeform memory entries (the Odysseus "facts" idea): [ { id, text } ]
  facts jsonb DEFAULT '[]'::jsonb,
  -- Page settings (last tab, etc.)
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_brand_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own brand memory" ON planner_brand_memory;
CREATE POLICY "users manage own brand memory" ON planner_brand_memory
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
--  Done! Reload brand-memory.html — sign in to sync your Creator
--  Memory across devices. Without sign-in, it lives in your browser.
--
--  OPTIONAL (future): other tools can read this row to build profile
--  context for the creator. If you ever want managers/editors
--  to read (not write) a creator's memory, add a SELECT policy keyed
--  on planner_is_manager_of(user_id) — same pattern as the planner.
-- ============================================================
