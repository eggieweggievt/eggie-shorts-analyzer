-- ============================================================
--  PLANNER TODOS — Supabase migration
--  Run this in Supabase Dashboard -> SQL Editor -> New query
--  Adds the customizable To-Do list that ships alongside the planner.
--
--  ⚠️  PREREQUISITE: Run planner-supabase-v2.sql FIRST.
--      This migration foreign-keys to planner_items for the
--      "link a task to a content idea" feature. The other tables
--      below (categories, focus_sessions) don't depend on it, but
--      the FK on planner_todos.linked_item_id needs planner_items
--      to exist. If you run this on a brand-new project without
--      v2.sql first, the planner_todos CREATE TABLE will error.
--
--  Tables created:
--    planner_todos            -- the tasks themselves
--    planner_todo_categories  -- user-defined categories (color + label)
--    planner_focus_sessions   -- pomodoro / focus log (powers streak + stats)
--
--  Plays nicely with the existing planner: a todo can optionally link
--  to a planner_items row via linked_item_id.
--
--  Safe to re-run. RLS mirrors planner_items: owner full access,
--  optional editor read for tasks attached to items assigned to them.
-- ============================================================

-- Sanity check: make sure planner_items exists before we FK to it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planner_items') THEN
    RAISE EXCEPTION 'planner_items table not found. Run planner-supabase-v2.sql first, then re-run this script.';
  END IF;
END$$;

-- 1. Categories  ----------------------------------------------
CREATE TABLE IF NOT EXISTS planner_todo_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text DEFAULT '#90A5FF',
  icon text DEFAULT '',
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planner_todo_categories_owner_idx
  ON planner_todo_categories(owner_id, position);

ALTER TABLE planner_todo_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners manage own todo categories" ON planner_todo_categories;
CREATE POLICY "owners manage own todo categories" ON planner_todo_categories
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 2. Todos  ----------------------------------------------------
CREATE TABLE IF NOT EXISTS planner_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- core
  title text NOT NULL,
  notes text,
  bucket text NOT NULL DEFAULT 'today',
    -- 'today' | 'week' | 'later' | 'done'
  position int DEFAULT 0,                       -- ordering within bucket
  is_priority boolean DEFAULT false,            -- star
  is_done boolean DEFAULT false,
  completed_at timestamptz,

  -- scheduling
  due_at timestamptz,
  snoozed_until timestamptz,

  -- recurrence -- when not null, completing the todo spawns the next instance
  recurrence text,                              -- 'daily' | 'weekly' | 'weekdays' | 'monthly' | custom 'every:N:days' etc.
  recurrence_days jsonb DEFAULT '[]'::jsonb,    -- [0..6] for custom weekly (Sun=0)

  -- structure
  subtasks jsonb DEFAULT '[]'::jsonb,           -- [{id, text, done}]
  tags jsonb DEFAULT '[]'::jsonb,               -- ['admin','content', ...]
  category_id uuid REFERENCES planner_todo_categories(id) ON DELETE SET NULL,

  -- planner integration
  linked_item_id uuid REFERENCES planner_items(id) ON DELETE SET NULL,

  -- focus
  focus_minutes int DEFAULT 0,                  -- accumulated pomodoro time
  estimated_minutes int,                        -- optional estimate

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planner_todos_owner_idx
  ON planner_todos(owner_id, bucket, position);
CREATE INDEX IF NOT EXISTS planner_todos_due_idx
  ON planner_todos(owner_id, due_at);
CREATE INDEX IF NOT EXISTS planner_todos_linked_item_idx
  ON planner_todos(linked_item_id);

ALTER TABLE planner_todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners manage own todos" ON planner_todos;
CREATE POLICY "owners manage own todos" ON planner_todos
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Optional: editors assigned to a linked planner_item can READ the related todos.
-- (Useful if you ever want editor-visible task lists. Owners still own writes.)
DROP POLICY IF EXISTS "editors read todos for assigned items" ON planner_todos;
CREATE POLICY "editors read todos for assigned items" ON planner_todos
  FOR SELECT
  USING (
    auth.uid() = owner_id
    OR (
      linked_item_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM planner_items
        WHERE planner_items.id = planner_todos.linked_item_id
          AND planner_items.assignee_email = auth.email()
      )
    )
  );

-- 3. Focus sessions  -------------------------------------------
--  Records every completed pomodoro / focus block so the page can
--  draw the weekly chart and streak counter without re-deriving it.
CREATE TABLE IF NOT EXISTS planner_focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  todo_id uuid REFERENCES planner_todos(id) ON DELETE SET NULL,
  minutes int NOT NULL,
  kind text DEFAULT 'focus',                    -- 'focus' | 'break' | 'manual'
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planner_focus_sessions_owner_idx
  ON planner_focus_sessions(owner_id, started_at DESC);

ALTER TABLE planner_focus_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners manage own focus sessions" ON planner_focus_sessions;
CREATE POLICY "owners manage own focus sessions" ON planner_focus_sessions
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ============================================================
--  Done! Reload todo.html (or planner.html) -- the to-do list
--  will light up automatically.
-- ============================================================
