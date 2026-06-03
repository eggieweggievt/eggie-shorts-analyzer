-- ============================================================
--  Weekly Review → Creator Check-In (9-section format)
--  Shipped: 2026-06-03
--  Powers: the restructured review.html
--
--  Adds the new check-in fields. Run IN ADDITION to
--  planner-weekly-review.sql — nothing is replaced or dropped.
--
--  Section mapping:
--    1. Last Week Recap   → last_week_recap (new)
--    2. Biggest Win       → wins            (existing)
--    3. Content Check     → content_notes   (existing)
--    4. Community Check   → community_notes (new)
--    5. Mental Check      → energy_notes    (existing)
--    6. Current Struggles → slipped         (existing)
--    7. Next Week         → next_week_plan  (new)
--    8. Support Check     → support_needs   (new)
--    9. One Main Goal     → main_goal       (new)
--
--  Old columns (open_loops, follow_ups, next_week) are kept so past
--  reviews stay readable — review.html shows them read-only when present.
--
--  Idempotent; safe to re-run.
-- ============================================================

alter table public.planner_weekly_reviews
  add column if not exists last_week_recap text not null default '',
  add column if not exists community_notes text not null default '',
  add column if not exists next_week_plan  text not null default '',
  add column if not exists support_needs   text not null default '',
  add column if not exists main_goal       text not null default '';
