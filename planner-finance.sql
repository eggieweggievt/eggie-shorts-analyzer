-- ============================================================
--  Finance & Tax tracker — planner_finance_*
--  Shipped: 2026-05-31
--  Powers: finance.html
--
--  Roles: owner + manager. NO editor, NO public — finances are the
--  creator's (and a permitted manager's) business only.
--
--  Manager access is gated three ways:
--    1. Per-row `manager_visible` flag (categories, entries, savings).
--    2. A master switch `planner_finance_settings.hide_all_from_manager`.
--    3. The usual `planner_is_manager_of()` delegation check.
--  All three are combined in the planner_finance_mgr_ok() helper, so a
--  manager only ever sees a row when: they're a delegate, the master
--  switch is OFF, AND that specific row is marked visible.
--
--  Idempotent; safe to re-run. Depends on planner_is_manager_of(uuid)
--  from planner-managers.sql.
-- ============================================================

-- ------------------------------------------------------------
--  Settings (one row per owner)
-- ------------------------------------------------------------
create table if not exists public.planner_finance_settings (
  owner_id              uuid primary key references auth.users(id) on delete cascade,
  base_currency         text    not null default 'CAD',
  tax_setaside_pct      numeric(5,2) not null default 25,
  gst_registered        boolean not null default false,
  business_number       text,
  hide_all_from_manager boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ------------------------------------------------------------
--  Categories (income + expense buckets, per owner)
-- ------------------------------------------------------------
create table if not exists public.planner_finance_categories (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('income','expense')),
  name            text not null,
  manager_visible boolean not null default true,
  sort            int  not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists planner_finance_categories_owner_idx
  on public.planner_finance_categories (owner_id, kind, sort);

-- ------------------------------------------------------------
--  Entries (the income/expense ledger)
-- ------------------------------------------------------------
create table if not exists public.planner_finance_entries (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('income','expense')),
  category_id       uuid references public.planner_finance_categories(id) on delete set null,
  category_name     text,                         -- denormalized for CSV / resilience
  amount            numeric(14,2) not null default 0,
  occurred_on       date not null default current_date,
  counterparty      text,                          -- payer (income) / vendor (expense)
  description       text,
  business_use_pct  int  not null default 100,     -- expenses: % used for business
  is_deductible     boolean not null default true, -- expenses
  gst_treatment     text,                          -- income: 'taxable' | 'zero_rated' | 'exempt'
  tax_amount        numeric(14,2) not null default 0, -- GST/HST collected (income) or paid/ITC (expense)
  manager_visible   boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists planner_finance_entries_owner_date_idx
  on public.planner_finance_entries (owner_id, occurred_on desc);
create index if not exists planner_finance_entries_owner_kind_idx
  on public.planner_finance_entries (owner_id, kind);

-- ------------------------------------------------------------
--  Savings goals / project funds
-- ------------------------------------------------------------
create table if not exists public.planner_finance_savings (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  target_amount   numeric(14,2) not null default 0,
  saved_amount    numeric(14,2) not null default 0,
  color           text default '#90A5FF',
  notes           text,
  manager_visible boolean not null default true,
  sort            int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists planner_finance_savings_owner_idx
  on public.planner_finance_savings (owner_id, sort);

-- ------------------------------------------------------------
--  Helper: may the current user (as a manager) see this owner's finances?
--  SECURITY DEFINER so the settings read inside it bypasses RLS (no recursion).
-- ------------------------------------------------------------
create or replace function public.planner_finance_mgr_ok(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select planner_is_manager_of(p_owner)
     and not coalesce(
       (select hide_all_from_manager from public.planner_finance_settings where owner_id = p_owner),
       false
     );
$$;

-- ============================================================
--  RLS
-- ============================================================
alter table public.planner_finance_settings   enable row level security;
alter table public.planner_finance_categories enable row level security;
alter table public.planner_finance_entries    enable row level security;
alter table public.planner_finance_savings    enable row level security;

-- ---- settings ----
drop policy if exists "owner all fin_settings" on public.planner_finance_settings;
create policy "owner all fin_settings" on public.planner_finance_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "manager read fin_settings" on public.planner_finance_settings;
create policy "manager read fin_settings" on public.planner_finance_settings
  for select using (planner_finance_mgr_ok(owner_id));

-- ---- categories ----
drop policy if exists "owner all fin_categories" on public.planner_finance_categories;
create policy "owner all fin_categories" on public.planner_finance_categories
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "manager fin_categories" on public.planner_finance_categories;
create policy "manager fin_categories" on public.planner_finance_categories
  for all
  using (manager_visible and planner_finance_mgr_ok(owner_id))
  with check (manager_visible and planner_finance_mgr_ok(owner_id));

-- ---- entries ----
drop policy if exists "owner all fin_entries" on public.planner_finance_entries;
create policy "owner all fin_entries" on public.planner_finance_entries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "manager fin_entries" on public.planner_finance_entries;
create policy "manager fin_entries" on public.planner_finance_entries
  for all
  using (manager_visible and planner_finance_mgr_ok(owner_id))
  with check (manager_visible and planner_finance_mgr_ok(owner_id));

-- ---- savings ----
drop policy if exists "owner all fin_savings" on public.planner_finance_savings;
create policy "owner all fin_savings" on public.planner_finance_savings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "manager fin_savings" on public.planner_finance_savings;
create policy "manager fin_savings" on public.planner_finance_savings
  for all
  using (manager_visible and planner_finance_mgr_ok(owner_id))
  with check (manager_visible and planner_finance_mgr_ok(owner_id));

-- ============================================================
--  updated_at touch triggers
-- ============================================================
create or replace function public.planner_finance_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists planner_finance_settings_touch on public.planner_finance_settings;
create trigger planner_finance_settings_touch before update on public.planner_finance_settings
  for each row execute function public.planner_finance_touch();

drop trigger if exists planner_finance_entries_touch on public.planner_finance_entries;
create trigger planner_finance_entries_touch before update on public.planner_finance_entries
  for each row execute function public.planner_finance_touch();

drop trigger if exists planner_finance_savings_touch on public.planner_finance_savings;
create trigger planner_finance_savings_touch before update on public.planner_finance_savings
  for each row execute function public.planner_finance_touch();
