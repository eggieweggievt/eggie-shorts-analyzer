-- ============================================================================
--  planner-debut-checklist.sql
--  V2 update — Debut Checklist sync table
--
--  Run AFTER:
--    planner-supabase-v2.sql
--    planner-managers.sql   (for planner_is_manager_of)
--
--  Safe to re-run any time. Every statement uses IF NOT EXISTS / OR REPLACE.
--
--  One row per user, whole checklist stored as jsonb — same shape as
--  planner_habits_state. The page works signed-out via localStorage; this
--  table only powers cross-device sync for signed-in users.
-- ============================================================================

create table if not exists public.planner_debut_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- { tasks: [{id, name, cat, status, artist, cost, pay, due}],
  --   settings: { debutDate } }
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.planner_debut_state_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists planner_debut_state_touch on public.planner_debut_state;
create trigger planner_debut_state_touch
  before update on public.planner_debut_state
  for each row execute function public.planner_debut_state_touch_updated();

-- ---------------------------------------------------------------------------
--  RLS — owner + manager only (standard planner_* policy pair)
-- ---------------------------------------------------------------------------
alter table public.planner_debut_state enable row level security;

drop policy if exists "debut state owner all"   on public.planner_debut_state;
drop policy if exists "debut state manager all" on public.planner_debut_state;

create policy "debut state owner all"
  on public.planner_debut_state
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "debut state manager all"
  on public.planner_debut_state
  for all
  using (public.planner_is_manager_of(user_id))
  with check (public.planner_is_manager_of(user_id));

-- Done. debut-checklist.html will sync automatically once this runs.
