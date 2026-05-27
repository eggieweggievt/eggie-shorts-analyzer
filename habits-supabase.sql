-- ============================================================
--  HABITS — Supabase migration
--  Run this in Supabase Dashboard → SQL Editor → New query
--  Adds a single user-keyed row for habit state (habits, logs, settings).
--  Backs up the localStorage-first habit tracker for cross-device sync.
-- ============================================================

CREATE TABLE IF NOT EXISTS planner_habits_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- User's enabled habits + any custom edits to the built-in library
  habits jsonb DEFAULT '[]'::jsonb,
  -- Log map: { 'YYYY-MM-DD': { habit_id: value, ... } }
  -- value is boolean for daily / weekly habits, number for count habits
  logs jsonb DEFAULT '{}'::jsonb,
  -- User settings: energy_mode, last_view, etc.
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_habits_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own habits" ON planner_habits_state;
CREATE POLICY "users manage own habits" ON planner_habits_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
--  Done! Reload habits.html — Sign in to sync your local habits + logs
--  across devices. Without sign-in, everything stays in your browser.
-- ============================================================
