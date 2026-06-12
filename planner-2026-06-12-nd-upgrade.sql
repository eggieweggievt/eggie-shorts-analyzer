-- ============================================================
--  planner-2026-06-12-nd-upgrade.sql
--  Run once in the Supabase SQL editor.
--
--  Part of the neurodivergent-friendly upgrade wave:
--
--  planner_items.next_action — "the very next physical step" field.
--  Card titles describe OUTCOMES ("Gremlin ranked video"); ADHD task
--  initiation needs the literal next ACTION ("trim the first 3 sec").
--  Shown on the kanban card face and on the editor dashboard.
--
--  Safe to re-run. The planner degrades gracefully if this hasn't
--  been run yet (it strips the column and retries, same as the V2
--  columns), so deploy order doesn't matter.
-- ============================================================

ALTER TABLE planner_items
  ADD COLUMN IF NOT EXISTS next_action text;

-- ============================================================
--  Done! Open any planner card → the "▸ Very next action" field
--  sits under the title; whatever you type renders on the card.
-- ============================================================
