-- ============================================================
--  planner-2026-06-10-audit-fixes.sql
--  Run once in the Supabase SQL editor (like planner-status-edited.sql).
--
--  Two fixes from the 2026-06-10 deep audit:
--
--  1. CASE-INSENSITIVE EDITOR EMAILS (defense in depth)
--     The live editor policies compare emails with plain `=`. The hub
--     rule is "assignee_email must be lowercase+trim everywhere" — the
--     pages now normalize on read AND write, but a legacy mixed-case
--     row or a mixed-case auth.email() would still make an editor
--     silently see no projects. planner-supabase-todos.sql already
--     uses lower() on both sides; this brings planner_items and
--     planner_editors in line with it.
--
--  2. MANAGER ACCESS TO TWEETS + TODO CATEGORIES
--     Managers are full co-owners (planner-managers.sql), but
--     planner_tweets and planner_todo_categories were added later and
--     never got the additive "managers manage X" policy. Result: a
--     manager opening a client's hub sees an EMPTY tweets planner and
--     no todo categories — planner.html queries them with the
--     creator's owner_id and RLS returns zero rows. This mirrors the
--     exact pattern used for planner_todos.
--     (If you'd rather keep tweets owner-only on purpose, delete
--      section 2a before running.)
-- ============================================================

-- ---- 1. Editor email comparisons → lower() on both sides ----

DROP POLICY IF EXISTS "editors read own profile" ON planner_editors;
CREATE POLICY "editors read own profile" ON planner_editors
  FOR SELECT
  USING (lower(email) = lower(auth.email()));

DROP POLICY IF EXISTS "editors update own profile" ON planner_editors;
CREATE POLICY "editors update own profile" ON planner_editors
  FOR UPDATE
  USING (lower(email) = lower(auth.email()))
  WITH CHECK (lower(email) = lower(auth.email()));

DROP POLICY IF EXISTS "editors see assigned items" ON planner_items;
CREATE POLICY "editors see assigned items" ON planner_items
  FOR SELECT
  USING (
    auth.uid() = owner_id
    OR lower(assignee_email) = lower(auth.email())
  );

DROP POLICY IF EXISTS "editors update assigned items" ON planner_items;
CREATE POLICY "editors update assigned items" ON planner_items
  FOR UPDATE
  USING (lower(assignee_email) = lower(auth.email()))
  WITH CHECK (lower(assignee_email) = lower(auth.email()));

-- One-time data scrub: lowercase+trim any legacy mixed-case emails
UPDATE planner_items
  SET assignee_email = lower(trim(assignee_email))
  WHERE assignee_email IS NOT NULL
    AND assignee_email <> lower(trim(assignee_email));

UPDATE planner_editors
  SET email = lower(trim(email))
  WHERE email IS NOT NULL
    AND email <> lower(trim(email));

-- ---- 2a. Managers act as co-owners on tweets ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='planner_tweets') THEN
    EXECUTE 'DROP POLICY IF EXISTS "managers manage tweets" ON planner_tweets';
    EXECUTE 'CREATE POLICY "managers manage tweets" ON planner_tweets
               FOR ALL
               USING (planner_is_manager_of(owner_id))
               WITH CHECK (planner_is_manager_of(owner_id))';
  END IF;
END $$;

-- ---- 2b. Managers act as co-owners on todo categories ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='planner_todo_categories') THEN
    EXECUTE 'DROP POLICY IF EXISTS "managers manage todo categories" ON planner_todo_categories';
    EXECUTE 'CREATE POLICY "managers manage todo categories" ON planner_todo_categories
               FOR ALL
               USING (planner_is_manager_of(owner_id))
               WITH CHECK (planner_is_manager_of(owner_id))';
  END IF;
END $$;

-- ============================================================
--  Done! Check: sign in as an editor whose email was saved with
--  capital letters → their assigned items now appear; open a client
--  hub as a manager → Tweets mode and todo categories now load.
-- ============================================================
