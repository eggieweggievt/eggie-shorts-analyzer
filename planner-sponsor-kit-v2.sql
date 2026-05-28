-- ============================================================================
--  planner-sponsor-kit-v2.sql
--  V4.1 — Sponsor / Media Kit field extensions
--
--  Adds 10 fields requested after cross-referencing eggieweggie.ca/#media-kit:
--    1. total_views_all_platforms     — aggregate cross-platform reach
--    2. aggregate_engagement_rate     — single number across socials
--    3. posting_schedule              — cadence by content type
--    4. stream_schedule               — stream-specific schedule details
--    5. content_rating + notes        — all-ages / mature / 18+
--    6. active_partnerships           — current sponsors with promo codes
--    7. group_affiliation             — VTuber group / collective / agency
--    8. management_clients            — creators you manage
--    9. merch_links                   — storefronts + affiliate merch
--   10. discord                       — community server invite + metadata
--   (+ past_creator_collabs           — distinct from brand past_sponsorships)
--
--  All ALTERs use IF NOT EXISTS — safe to re-run.
--  The peek RPC is recreated to return the new columns.
--
--  Run AFTER: planner-sponsor-kit.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. New columns
-- ---------------------------------------------------------------------------

alter table public.planner_media_kit
  add column if not exists total_views_all_platforms text;         -- "3M+", "12M lifetime", etc. free-form

alter table public.planner_media_kit
  add column if not exists aggregate_engagement_rate numeric(5,2); -- e.g. 11.00 for "~11%"

-- Posting cadence — independent of stream schedule so creators who don't stream
-- can still describe their posting rhythm.
-- Each row: { kind, frequency, notes }
--   kind = 'stream' | 'longform' | 'short' | 'community' | 'newsletter' | 'other'
--   frequency = "4x/week" / "weekly" / "daily" / etc.
alter table public.planner_media_kit
  add column if not exists posting_schedule jsonb default '[]'::jsonb;

-- Stream-specific schedule. Object shape:
-- { days_per_week, start_time, end_time, timezone, days_of_week:[],
--   multistream_to:[platform...], notes }
alter table public.planner_media_kit
  add column if not exists stream_schedule jsonb default '{}'::jsonb;

-- Content rating: 'all-ages' | 'mature' | '18-plus'.
-- Sponsors filter aggressively on this; surface it loudly.
alter table public.planner_media_kit
  add column if not exists content_rating text default 'all-ages';

alter table public.planner_media_kit
  add column if not exists content_rating_notes text;

-- Active partnerships (distinct from past_sponsorships which is "what we did").
-- Each row: { brand, blurb, link, promo_code, discount, logo_url, since }
alter table public.planner_media_kit
  add column if not exists active_partnerships jsonb default '[]'::jsonb;

-- Group / collective / agency affiliation. Object shape:
-- { name, role, link, blurb, members: [{name, link}] }
alter table public.planner_media_kit
  add column if not exists group_affiliation jsonb default '{}'::jsonb;

-- Creators the user manages or has managed. Demonstrates business chops.
-- Each row: { name, link, role, current, since, notes }
alter table public.planner_media_kit
  add column if not exists management_clients jsonb default '[]'::jsonb;

-- Merch / storefronts / affiliate storefronts.
-- Each row: { label, url, kind, notes }
--   kind = 'storefront' | 'affiliate' | 'partnership' | 'tip-jar' | 'other'
alter table public.planner_media_kit
  add column if not exists merch_links jsonb default '[]'::jsonb;

-- Discord community. Object shape:
-- { invite_url, server_name, member_count, vibe, joined_via }
alter table public.planner_media_kit
  add column if not exists discord jsonb default '{}'::jsonb;

-- Past creator collabs (distinct from past_sponsorships which is brand-side).
-- Each row: { name, link, notes }
alter table public.planner_media_kit
  add column if not exists past_creator_collabs jsonb default '[]'::jsonb;

-- ---------------------------------------------------------------------------
--  2. Update the public peek RPC to return the new columns
--
--  CREATE OR REPLACE on a function with a different RETURNS TABLE signature
--  errors out, so we DROP+CREATE. Safe because GRANTs are reapplied below.
-- ---------------------------------------------------------------------------

drop function if exists public.planner_media_kit_peek(text);

create or replace function public.planner_media_kit_peek(p_slug text)
returns table (
  user_id uuid,
  slug text,
  display_name text,
  tagline text,
  bio text,
  avatar_url text,
  banner_url text,
  location text,
  languages text[],
  pronouns text,
  niche_primary text,
  niche_secondary text,
  vibe_tags text[],
  content_pillars jsonb,
  platforms jsonb,
  audience_demographics jsonb,
  top_content jsonb,
  past_sponsorships jsonb,
  services_offered text[],
  pricing jsonb,
  brand_colors text[],
  contact_email text,
  booking_link text,
  social_handles jsonb,
  last_stats_update_at timestamptz,
  theme text,
  -- v2 additions
  total_views_all_platforms text,
  aggregate_engagement_rate numeric,
  posting_schedule jsonb,
  stream_schedule jsonb,
  content_rating text,
  content_rating_notes text,
  active_partnerships jsonb,
  group_affiliation jsonb,
  management_clients jsonb,
  merch_links jsonb,
  discord jsonb,
  past_creator_collabs jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    k.user_id, k.slug, k.display_name, k.tagline, k.bio,
    k.avatar_url, k.banner_url, k.location, k.languages, k.pronouns,
    k.niche_primary, k.niche_secondary, k.vibe_tags, k.content_pillars,
    k.platforms, k.audience_demographics, k.top_content, k.past_sponsorships,
    k.services_offered, k.pricing, k.brand_colors, k.contact_email,
    k.booking_link, k.social_handles, k.last_stats_update_at, k.theme,
    k.total_views_all_platforms, k.aggregate_engagement_rate,
    k.posting_schedule, k.stream_schedule,
    k.content_rating, k.content_rating_notes,
    k.active_partnerships, k.group_affiliation, k.management_clients,
    k.merch_links, k.discord, k.past_creator_collabs,
    k.updated_at
  from public.planner_media_kit k
  where k.is_public = true
    and (k.slug = lower(trim(p_slug))
         or k.user_id::text = lower(trim(p_slug)));
$$;

grant execute on function public.planner_media_kit_peek(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
--  Done. The page renders these columns; missing data falls back to "—" or
--  skipped sections, so a kit created before this migration still works.
-- ---------------------------------------------------------------------------
