-- ============================================================
--  CONTENT PILLARS — 2026-06-14
--  Run in Supabase Dashboard -> SQL Editor -> New query.
--
--  Adds a persistent "content pillars" model: named themes that a creator's
--  ideas are grouped into. The grouping is computed ON-DEVICE in planner.html
--  (a small MiniLM embedding model clusters ideas by meaning), then the result
--  is saved here so pillars tag every card, filter the board, and feed the
--  Optimizer. Nothing is computed in the cloud.
--
--  Safe to re-run — every statement is guarded (IF NOT EXISTS / DROP POLICY IF
--  EXISTS), matching the planner-supabase-v2.sql conventions.
-- ============================================================

-- 1. Pillars table — one row per content theme, owned by the creator.
CREATE TABLE IF NOT EXISTS planner_pillars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled pillar',
  color text DEFAULT '#90A5FF',
  description text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planner_pillars_owner_idx ON planner_pillars(owner_id, sort_order);

ALTER TABLE planner_pillars ENABLE ROW LEVEL SECURITY;

-- Owners manage their own pillars.
DROP POLICY IF EXISTS "owners manage own pillars" ON planner_pillars;
CREATE POLICY "owners manage own pillars" ON planner_pillars
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Editors can READ the pillars of creators who have assigned them an item, so an
-- editor's view can show which theme a card belongs to (mirrors the brand-kit grant).
DROP POLICY IF EXISTS "editors read pillars" ON planner_pillars;
CREATE POLICY "editors read pillars" ON planner_pillars
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM planner_items
      WHERE planner_items.owner_id = planner_pillars.owner_id
        AND lower(planner_items.assignee_email) = lower(auth.email())
    )
  );

-- Managers (co-owners) manage pillars for hubs they manage — only created if the
-- manager helper exists (it ships with the managers migration), so this file is
-- safe to run on installs that don't use managers.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'planner_is_manager_of') THEN
    EXECUTE 'DROP POLICY IF EXISTS "managers manage pillars" ON planner_pillars';
    EXECUTE 'CREATE POLICY "managers manage pillars" ON planner_pillars FOR ALL USING (planner_is_manager_of(owner_id)) WITH CHECK (planner_is_manager_of(owner_id))';
  END IF;
END$$;

-- 2. Link planner_items to a pillar. ON DELETE SET NULL so deleting a pillar just
--    unassigns its items — it never deletes the ideas themselves.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='pillar_id') THEN
    ALTER TABLE planner_items ADD COLUMN pillar_id uuid REFERENCES planner_pillars(id) ON DELETE SET NULL;
  END IF;
END$$;
CREATE INDEX IF NOT EXISTS planner_items_pillar_idx ON planner_items(owner_id, pillar_id);

-- ============================================================
--  Done! Reload planner.html -> the 🧩 Pillars panel now SAVES your themes:
--  each card gets a pillar tag, the board gains a pillar filter, and your
--  pillars feed the Optimizer's niche detection. Re-running grouping reuses
--  your renamed/recoloured pillars instead of churning them.
-- ============================================================
