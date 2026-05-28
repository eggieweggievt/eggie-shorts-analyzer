-- ============================================================
--  PLANNER MANAGER HUB V2 — Supabase migration
--  Run AFTER planner-managers.sql, in Supabase Dashboard → SQL Editor → New query.
--
--  Adds two tables that power the universal Manager Hub:
--    1. planner_client_profiles — manager's per-client metadata (display name
--       override, color, private notes the creator can NEVER see, pinned flag)
--    2. planner_comments — polymorphic comments on planner_items + planner_todos,
--       authored by owners / managers / editors with role tagging
--
--  Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. planner_client_profiles
--    One row per (manager, client) pair. The manager owns the row outright
--    and only THEY can read/write it — the client (owner_id) never sees these notes.
-- ============================================================
CREATE TABLE IF NOT EXISTS planner_client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,                          -- e.g. "Eggie 🐙" — manager-chosen label
  color text,                                 -- accent color for this client's card
  private_notes text,                         -- manager-only — never visible to the creator
  pinned boolean DEFAULT false,               -- pin to top of manager hub
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(manager_user_id, owner_id)
);

CREATE INDEX IF NOT EXISTS planner_client_profiles_manager_idx ON planner_client_profiles(manager_user_id);

ALTER TABLE planner_client_profiles ENABLE ROW LEVEL SECURITY;

-- The signed-in manager owns their profile rows. INSERT/UPDATE additionally
-- requires that they actually be an active manager of that owner_id (no junk rows
-- for clients they're not managing).
DROP POLICY IF EXISTS "managers read own client profiles" ON planner_client_profiles;
CREATE POLICY "managers read own client profiles" ON planner_client_profiles
  FOR SELECT
  USING (auth.uid() = manager_user_id);

DROP POLICY IF EXISTS "managers insert own client profiles" ON planner_client_profiles;
CREATE POLICY "managers insert own client profiles" ON planner_client_profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = manager_user_id
    AND planner_is_manager_of(owner_id)
  );

DROP POLICY IF EXISTS "managers update own client profiles" ON planner_client_profiles;
CREATE POLICY "managers update own client profiles" ON planner_client_profiles
  FOR UPDATE
  USING (auth.uid() = manager_user_id)
  WITH CHECK (auth.uid() = manager_user_id);

DROP POLICY IF EXISTS "managers delete own client profiles" ON planner_client_profiles;
CREATE POLICY "managers delete own client profiles" ON planner_client_profiles
  FOR DELETE
  USING (auth.uid() = manager_user_id);

-- Auto-bump updated_at on every write
CREATE OR REPLACE FUNCTION planner_client_profiles_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planner_client_profiles_touch ON planner_client_profiles;
CREATE TRIGGER planner_client_profiles_touch
  BEFORE UPDATE ON planner_client_profiles
  FOR EACH ROW EXECUTE FUNCTION planner_client_profiles_touch_updated_at();

-- ============================================================
-- 2. planner_comments — polymorphic comments on items + todos
--    parent_type = 'item' references planner_items.id
--    parent_type = 'todo' references planner_todos.id
--    author_role = 'owner' | 'manager' | 'editor'
-- ============================================================
CREATE TABLE IF NOT EXISTS planner_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- creator, for RLS routing
  parent_type text NOT NULL CHECK (parent_type IN ('item','todo')),
  parent_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('owner','manager','editor')),
  author_email text NOT NULL,                  -- cached for display
  author_label text,                            -- optional friendly name (e.g. manager's display_name from profile)
  body text NOT NULL CHECK (length(body) <= 4000),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planner_comments_parent_idx
  ON planner_comments(owner_id, parent_type, parent_id, created_at);
CREATE INDEX IF NOT EXISTS planner_comments_author_idx ON planner_comments(author_user_id);

ALTER TABLE planner_comments ENABLE ROW LEVEL SECURITY;

-- READ policies (additive — postgres OR's them together)
DROP POLICY IF EXISTS "owners read comments" ON planner_comments;
CREATE POLICY "owners read comments" ON planner_comments
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "managers read comments" ON planner_comments;
CREATE POLICY "managers read comments" ON planner_comments
  FOR SELECT
  USING (planner_is_manager_of(owner_id));

-- Editors see comments only on items they're assigned to (not on todos)
DROP POLICY IF EXISTS "editors read item comments" ON planner_comments;
CREATE POLICY "editors read item comments" ON planner_comments
  FOR SELECT
  USING (
    parent_type = 'item'
    AND EXISTS (
      SELECT 1 FROM planner_items
      WHERE planner_items.id = planner_comments.parent_id
        AND planner_items.assignee_email = auth.email()
    )
  );

-- INSERT policies — role tagging is enforced server-side: you can only post
-- comments tagged with a role you actually hold.
DROP POLICY IF EXISTS "owners insert comments" ON planner_comments;
CREATE POLICY "owners insert comments" ON planner_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND auth.uid() = author_user_id
    AND author_role = 'owner'
  );

DROP POLICY IF EXISTS "managers insert comments" ON planner_comments;
CREATE POLICY "managers insert comments" ON planner_comments
  FOR INSERT
  WITH CHECK (
    planner_is_manager_of(owner_id)
    AND auth.uid() = author_user_id
    AND author_role = 'manager'
  );

DROP POLICY IF EXISTS "editors insert item comments" ON planner_comments;
CREATE POLICY "editors insert item comments" ON planner_comments
  FOR INSERT
  WITH CHECK (
    parent_type = 'item'
    AND auth.uid() = author_user_id
    AND author_role = 'editor'
    AND EXISTS (
      SELECT 1 FROM planner_items
      WHERE planner_items.id = planner_comments.parent_id
        AND planner_items.assignee_email = auth.email()
        AND planner_items.owner_id = planner_comments.owner_id
    )
  );

-- UPDATE — only the author can edit their own comment body
DROP POLICY IF EXISTS "authors update own comments" ON planner_comments;
CREATE POLICY "authors update own comments" ON planner_comments
  FOR UPDATE
  USING (auth.uid() = author_user_id)
  WITH CHECK (auth.uid() = author_user_id);

-- DELETE — author can delete their own, owner/manager can override-delete
-- anything on their data (for moderation, e.g. removing spam)
DROP POLICY IF EXISTS "authors delete own comments" ON planner_comments;
CREATE POLICY "authors delete own comments" ON planner_comments
  FOR DELETE
  USING (auth.uid() = author_user_id);

DROP POLICY IF EXISTS "owners delete any comment" ON planner_comments;
CREATE POLICY "owners delete any comment" ON planner_comments
  FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "managers delete any comment" ON planner_comments;
CREATE POLICY "managers delete any comment" ON planner_comments
  FOR DELETE
  USING (planner_is_manager_of(owner_id));

-- Auto-bump updated_at
CREATE OR REPLACE FUNCTION planner_comments_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planner_comments_touch ON planner_comments;
CREATE TRIGGER planner_comments_touch
  BEFORE UPDATE ON planner_comments
  FOR EACH ROW EXECUTE FUNCTION planner_comments_touch_updated_at();

-- ============================================================
--  Done!
--
--  • Manager hub now uses planner_client_profiles for per-client display/notes.
--  • planner.html item modal + todo.html show a Comments section drawing from
--    planner_comments. Comments are tagged by role and visible to the right people.
--
--  If you haven't run planner-managers.sql yet, run that first — this file depends
--  on the planner_is_manager_of() helper from that migration.
-- ============================================================
