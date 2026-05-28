-- ============================================================================
--  planner-sponsor-kit-v2.sql — DEPRECATED, do not run
--
--  All of this file's contents have been merged into planner-sponsor-kit.sql
--  so the sponsor kit ships as a single idempotent migration. You can safely
--  delete this file — it is intentionally a no-op so accidentally running it
--  in Supabase does nothing.
--
--  → Run planner-sponsor-kit.sql instead. It's safe to re-run.
-- ============================================================================

do $$
begin
  raise notice
    'planner-sponsor-kit-v2.sql is deprecated. Run planner-sponsor-kit.sql instead.';
end $$;
