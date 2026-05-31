-- ============================================================
--  Weekly Review — planner_weekly_reviews
--  Shipped: 2026-05-30
--  Powers: review.html
--
--  One row per user per week. week_start is the LOCAL Monday of the
--  week (a plain date, computed client-side from the user's clock —
--  see the localDateKey/mondayOf helpers in review.html). Storing a
--  plain date (not a timestamptz) sidesteps the UTC day-rollover bug
--  from the Personal-OS guide's Part 8 #2.
--
--  Roles: owner + manager (additive). NO editor, NO public — a weekly
--  retro is the creator's (and their delegated manager's) business only.
--
--  Idempotent: safe to re-run. Depends on planner_is_manager_of(uuid)
--  from planner-managers.sql already existing.
-- ============================================================

create table if not exists public.planner_weekly_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  week_start    date not null,                 -- local Monday, YYYY-MM-DD
  wins          text  not null default '',
  slipped       text  not null default '',
  open_loops    text  not null default '',
  follow_ups    text  not null default '',
  content_notes text  not null default '',
  energy_notes  text  not null default '',     -- spoon-theory / wellbeing line
  next_week     jsonb not null default '[]'::jsonb,  -- array of up to 3 strings
  sealed_at     timestamptz,                   -- null = still a draft
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists planner_weekly_reviews_user_week_idx
  on public.planner_weekly_reviews (user_id, week_start desc);

-- ------------------------------------------------------------
--  RLS
-- ------------------------------------------------------------
alter table public.planner_weekly_reviews enable row level security;

-- Owner: full access to their own rows.
drop policy if exists "owner all weekly_reviews" on public.planner_weekly_reviews;
create policy "owner all weekly_reviews" on public.planner_weekly_reviews
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Manager: full access (additive), mirrors the pattern at the bottom of
-- planner-managers.sql. Owner policy stays untouched.
drop policy if exists "managers manage weekly_reviews" on public.planner_weekly_reviews;
create policy "managers manage weekly_reviews" on public.planner_weekly_reviews
  for all
  using (planner_is_manager_of(user_id))
  with check (planner_is_manager_of(user_id));

-- ------------------------------------------------------------
--  updated_at touch trigger
-- ------------------------------------------------------------
create or replace function public.planner_weekly_reviews_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists planner_weekly_reviews_touch on public.planner_weekly_reviews;
create trigger planner_weekly_reviews_touch
  before update on public.planner_weekly_reviews
  for each row execute function public.planner_weekly_reviews_touch();
