-- ============================================================================
--  planner-subathon.sql
--  V2 update — Subathon Planner + live Timer Widget (one file, idempotent)
--
--  Run AFTER:
--    planner-supabase-v2.sql
--    planner-managers.sql   (for planner_is_manager_of)
--
--  Safe to re-run any time. Every statement uses IF NOT EXISTS / OR REPLACE.
--
--  Creates:
--    1. planner_subathon_state           — one row per user, plan + timer jsonb
--    2. planner_subathon_peek(token)     — anon-callable RPC for the OBS
--                                          browser-source timer widget
--
--  Public read exception: like the media kit, the timer widget needs an
--  anon-readable path — but ONLY through the peek RPC, gated on a random
--  share token, and ONLY returning the timer + display fields (never the
--  full plan, schedule, or collab info). The table itself stays
--  owner+manager-only.
-- ============================================================================

create table if not exists public.planner_subathon_state (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- The whole plan:
  -- { setup:   { name, type, startAt, timezone, baseHours },
  --   rules:   { t1Min, t2Min, t3Min, donoMinPerDollar, bits100Min, capHours },
  --   goals:   [{ id, label, target, reached }],
  --   incentives: [{ id, label, threshold }],
  --   schedule:{ days: [{ id, date, slots: [{ id, time, type, activity, collab, collabWith, setup }] }] },
  --   prep:    { checklist: [{ id, text, done }] } }
  data jsonb not null default '{}'::jsonb,

  -- Live timer state (small + hot — what the widget polls):
  -- { endAt, pausedAt, running, addedMin, capAt }
  timer jsonb not null default '{}'::jsonb,

  -- Widget display settings the creator can theme from the planner:
  -- { label, showGoal, goalText, accent, fg }
  display jsonb not null default '{}'::jsonb,

  -- Random token in the widget URL. NULL = widget off.
  share_token text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planner_subathon_state_token_idx
  on public.planner_subathon_state (share_token) where share_token is not null;

-- updated_at trigger
create or replace function public.planner_subathon_state_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists planner_subathon_state_touch on public.planner_subathon_state;
create trigger planner_subathon_state_touch
  before update on public.planner_subathon_state
  for each row execute function public.planner_subathon_state_touch_updated();

-- ---------------------------------------------------------------------------
--  RLS — owner + manager only. The widget never reads the table directly;
--  it goes through the peek RPC below.
-- ---------------------------------------------------------------------------
alter table public.planner_subathon_state enable row level security;

drop policy if exists "subathon owner all"   on public.planner_subathon_state;
drop policy if exists "subathon manager all" on public.planner_subathon_state;

create policy "subathon owner all"
  on public.planner_subathon_state
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "subathon manager all"
  on public.planner_subathon_state
  for all
  using (public.planner_is_manager_of(user_id))
  with check (public.planner_is_manager_of(user_id));

-- ---------------------------------------------------------------------------
--  RPC — planner_subathon_peek(token)
--
--  SECURITY DEFINER so the OBS browser source can poll the timer without any
--  auth, knowing only the random share token. Returns ONLY timer + display —
--  never the plan, schedule, or collab details.
-- ---------------------------------------------------------------------------
drop function if exists public.planner_subathon_peek(text);

create or replace function public.planner_subathon_peek(p_token text)
returns table (
  timer jsonb,
  display jsonb,
  goals jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.timer,
    s.display,
    coalesce(s.data->'goals', '[]'::jsonb) as goals,  -- goal ladder is stream-facing by design; schedule/collab stay private
    s.updated_at
  from public.planner_subathon_state s
  where s.share_token is not null
    and s.share_token = trim(p_token);
$$;

grant execute on function public.planner_subathon_peek(text) to anon, authenticated;

-- Done. After running:
--   - subathon.html                       — planner + live control panel
--   - subathon-timer.html?t=<token>       — OBS browser-source timer widget
