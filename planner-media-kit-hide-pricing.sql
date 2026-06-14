-- ===========================================================================
--  planner-media-kit-hide-pricing.sql  (run once in Supabase SQL editor)
-- ---------------------------------------------------------------------------
--  FIX: "hidden" (staged) media-kit prices were leaking to the public.
--
--  The media kit UI lets a creator stage a price and flag it `hidden`, promising
--  it "stays saved, just hidden from the public view." But that hiding was only
--  done client-side (media-kit.html filters `!p.hidden` at render). The underlying
--  data still reached anonymous viewers two ways:
--    1. planner_media_kit_peek() returned the raw `pricing` jsonb (hidden rows and
--       their amounts included).
--    2. A blanket anon SELECT policy ("media kit public read") let anyone run
--       `select * from planner_media_kit where is_public = true` and read EVERY
--       column of the row directly — bypassing the curated RPC entirely.
--
--  This migration closes both:
--    • Rebuilds planner_media_kit_peek() to strip `hidden:true` entries from
--      `pricing` server-side, before the row ever leaves the database.
--    • Drops the broad anon/authenticated table-read policy. Public viewers
--      already load exclusively through the RPC (media-kit.html
--      loadPublicKitBySlug). Owners/managers keep their own RLS policies, so
--      editing (media-kit.html, sponsor-pitch.html) is unaffected.
--
--  Idempotent: safe to re-run.
-- ===========================================================================

-- 1) Stop exposing the full table to anonymous callers. Public reads go through
--    planner_media_kit_peek() only; owner + manager policies remain in place.
drop policy if exists "media kit public read" on public.planner_media_kit;

-- 2) Rebuild the public peek RPC so hidden pricing never leaves the server.
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
  -- v4.1
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
    k.services_offered,
    -- pricing with hidden:true rows removed (defensive: treat missing flag as visible)
    (select coalesce(jsonb_agg(elem), '[]'::jsonb)
       from jsonb_array_elements(coalesce(k.pricing, '[]'::jsonb)) elem
      where coalesce((elem->>'hidden')::boolean, false) = false) as pricing,
    k.brand_colors, k.contact_email,
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
