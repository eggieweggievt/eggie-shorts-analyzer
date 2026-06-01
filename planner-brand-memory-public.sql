-- ============================================================
--  CREATOR MEMORY — headless-read view of the SAFE subset
--  Run in Supabase Dashboard → SQL Editor → New query
--  ------------------------------------------------------------
--  WHY: the headless scheduled tasks (VidIQ trend/tag/title refresh)
--  run without a logged-in session and want the non-private brand
--  fields — niche, voice, series, word bank — to bias suggestions.
--  This view exposes ONLY those fields (never `facts` or `links`).
--
--  ⚠️ SECURITY (changed for public launch — 2026-06-01)
--  ------------------------------------------------------------
--  This view USED TO be granted to the `anon` role. That was unsafe
--  once more than one creator uses the hub: a plain Postgres view runs
--  with its owner's rights and BYPASSES the base table's row-level
--  security, so `anon` could read EVERY creator's profile + series via
--    GET /rest/v1/planner_brand_memory_public?select=*
--
--  Fix: the view is now `security_invoker = true`, so it enforces
--  planner_brand_memory's per-user RLS against whoever queries it:
--    • a signed-in creator sees only their OWN row
--    • `anon` sees nothing (no grant)
--    • the scheduled task must now authenticate with the SERVICE-ROLE
--      key (which has BYPASSRLS) — the same secret the trend-refresh
--      task already uses to WRITE analyzer_trends. Reads then return
--      all rows as before. Keep that key server-side only; never ship
--      it to the browser.
-- ============================================================

-- Drop first so re-running picks up column / option changes cleanly.
DROP VIEW IF EXISTS planner_brand_memory_public;

CREATE VIEW planner_brand_memory_public
  WITH (security_invoker = true) AS
  SELECT
    user_id,
    profile,   -- identity + voice + niche + word bank (no private notes live here)
    series     -- recurring formats (safe to share)
    -- NOTE: `facts` and `links` are intentionally NOT exposed — those can hold
    --       private boundaries, lore, schedules. Automations don't need them.
  FROM planner_brand_memory;

-- Authenticated callers may read the view, but security_invoker means RLS still
-- applies, so they only ever see their own row. The service-role key bypasses
-- RLS and reads everything (used by the headless scheduled task). `anon` is
-- intentionally NOT granted — revoke it in case an older migration added it.
REVOKE ALL ON planner_brand_memory_public FROM anon;
GRANT SELECT ON planner_brand_memory_public TO authenticated;

-- ============================================================
--  Scheduled tasks read it server-side with the SERVICE-ROLE key:
--    GET {SUPABASE_URL}/rest/v1/planner_brand_memory_public?select=*
--    headers: apikey + Authorization: Bearer {SERVICE_ROLE key}
--  Single-creator hub → take the row with the most-filled profile.
-- ============================================================
