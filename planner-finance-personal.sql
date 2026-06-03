-- ============================================================
--  Finance — personal-expense flag
--  Shipped: 2026-06-02
--  Powers: the "🏠 Personal expense" toggle + Business/Personal
--  filter added to finance.html.
--
--  Personal expenses are tracked in the ledger but kept OUT of all
--  business/tax math (deductions, net taxable, set-aside, reports).
--  Income rows are never personal.
--
--  Idempotent; safe to re-run.
-- ============================================================

alter table public.planner_finance_entries
  add column if not exists is_personal boolean not null default false;

-- Optional: speeds up the Business/Personal ledger filter for big ledgers.
create index if not exists planner_finance_entries_owner_personal_idx
  on public.planner_finance_entries (owner_id, is_personal);
