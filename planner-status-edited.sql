-- ============================================================
--  Add the 'edited' status to planner_items
--  ------------------------------------------------------------
--  The live database has a CHECK constraint (planner_items_status_check)
--  that only allows the original statuses, so saving status='edited'
--  fails with:  violates check constraint "planner_items_status_check".
--
--  This migration swaps that constraint for one that also allows 'edited'
--  (the editor's "Mark as edited" handoff stage, which sits between
--   Editing and Scheduled on the creator's planner).
--
--  HOW TO RUN:  Supabase dashboard → SQL Editor → paste this → Run.
--  Safe to run more than once.
-- ============================================================

ALTER TABLE planner_items
  DROP CONSTRAINT IF EXISTS planner_items_status_check;

ALTER TABLE planner_items
  ADD CONSTRAINT planner_items_status_check
  CHECK (status IN (
    'idea',
    'script',
    'recording',
    'editing',
    'edited',      -- NEW: editor marked their cut done → handed back to creator
    'scheduled',
    'posted',
    'archived'
  ));
