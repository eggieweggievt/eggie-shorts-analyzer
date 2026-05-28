-- ============================================================================
--  planner-sponsor-kit.sql
--  V4 — Sponsor / Media Kit + Pitch Builder (one file, idempotent)
--
--  Run AFTER:
--    planner-supabase-v2.sql
--    planner-managers.sql
--    planner-manager-hub-v2.sql
--    planner-managers-open-invites.sql
--
--  Safe to re-run any time. Every statement uses IF NOT EXISTS / OR REPLACE.
--
--  Creates:
--    1. planner_media_kit            — public-readable creator media kit
--    2. planner_sponsor_pitches      — per-brand pitch drafts (owner/manager only)
--    3. planner_media_kit_peek(slug) — anon-callable RPC, slug → public row
--    4. planner_media_kit_claim_slug — auth RPC, validates + claims a slug
--
--  Public read exception: planner_media_kit is the ONLY planner_* table with
--  anon SELECT — gated on is_public = true. All other planner_* tables stay
--  strict owner+manager. If you copy RLS from another planner_ table, you'll
--  miss this.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. planner_media_kit — all columns, in one CREATE TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.planner_media_kit (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Friendly slug for sharing. Defaults to user_id::text initially.
  slug text unique not null,

  -- Visibility toggle — gates the public read policy below.
  is_public boolean not null default false,

  -- Identity
  display_name text,
  tagline text,
  bio text,
  avatar_url text,
  banner_url text,
  location text,
  languages text[] default '{}',
  pronouns text,

  -- Niche / vibe
  niche_primary text,
  niche_secondary text,
  vibe_tags text[] default '{}',
  content_pillars jsonb default '[]'::jsonb,

  -- Per-platform stats. Each row:
  -- { platform, label, url, handle, subscribers, avg_views, avg_live_viewers,
  --   engagement_rate, last_updated, notes }
  platforms jsonb default '[]'::jsonb,

  -- Audience demographics — age_brackets / gender_split / top_countries /
  -- top_interests. Also stashes _blurb (the contact CTA copy) to avoid a
  -- separate column.
  audience_demographics jsonb default '{}'::jsonb,

  -- Standout content + brand history
  top_content jsonb default '[]'::jsonb,
  past_sponsorships jsonb default '[]'::jsonb,

  -- Services + pricing
  services_offered text[] default '{}',
  pricing jsonb default '[]'::jsonb,        -- each entry has `hidden` to stage prices

  -- Visual brand + contact
  brand_colors text[] default '{}',
  contact_email text,
  booking_link text,
  social_handles jsonb default '{}'::jsonb,

  -- Housekeeping
  last_stats_update_at timestamptz,
  theme text default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ---------- V4.1 extensions (cross-ref with eggieweggie.ca/#media-kit) ----------

  -- Aggregate cross-platform stats — sponsors love rolled-up numbers
  total_views_all_platforms text,                -- "3M+", free-form
  aggregate_engagement_rate numeric(5,2),        -- e.g. 11.00 for "~11%"

  -- Posting cadence. Each row: { kind, frequency, notes }
  --   kind = 'stream' | 'longform' | 'short' | 'community' | 'newsletter' | 'other'
  posting_schedule jsonb default '[]'::jsonb,

  -- Stream-specific schedule. Object:
  -- { days_per_week, start_time, end_time, timezone, days_of_week[],
  --   multistream_to[], notes }
  stream_schedule jsonb default '{}'::jsonb,

  -- Content rating — sponsors filter on this aggressively, surface it loudly.
  content_rating text default 'all-ages',        -- 'all-ages' | 'mature' | '18-plus'
  content_rating_notes text,

  -- Active partnerships (distinct from past_sponsorships).
  -- Each row: { brand, blurb, link, promo_code, discount, logo_url, since }
  active_partnerships jsonb default '[]'::jsonb,

  -- Group / collective / agency affiliation. Object:
  -- { name, role, link, blurb, members: [{name, link}] }
  group_affiliation jsonb default '{}'::jsonb,

  -- Creators the user manages or has managed. Demonstrates business chops.
  -- Each row: { name, link, role, current, since, notes }
  management_clients jsonb default '[]'::jsonb,

  -- Merch / storefronts / affiliate storefronts.
  -- Each row: { label, url, kind, notes }
  --   kind = 'storefront' | 'affiliate' | 'partnership' | 'tip-jar' | 'other'
  merch_links jsonb default '[]'::jsonb,

  -- Discord community.
  -- { invite_url, server_name, member_count, vibe }
  discord jsonb default '{}'::jsonb,

  -- Past creator collabs (distinct from past_sponsorships which is brand-side).
  -- Each row: { name, link, notes }
  past_creator_collabs jsonb default '[]'::jsonb
);

-- ---------------------------------------------------------------------------
--  Safety net: if anyone ran an older planner-sponsor-kit.sql (without the
--  V4.1 columns), top them up here. ADD COLUMN IF NOT EXISTS is a no-op when
--  the column already exists, so this is fully idempotent.
-- ---------------------------------------------------------------------------

alter table public.planner_media_kit add column if not exists total_views_all_platforms text;
alter table public.planner_media_kit add column if not exists aggregate_engagement_rate numeric(5,2);
alter table public.planner_media_kit add column if not exists posting_schedule jsonb default '[]'::jsonb;
alter table public.planner_media_kit add column if not exists stream_schedule jsonb default '{}'::jsonb;
alter table public.planner_media_kit add column if not exists content_rating text default 'all-ages';
alter table public.planner_media_kit add column if not exists content_rating_notes text;
alter table public.planner_media_kit add column if not exists active_partnerships jsonb default '[]'::jsonb;
alter table public.planner_media_kit add column if not exists group_affiliation jsonb default '{}'::jsonb;
alter table public.planner_media_kit add column if not exists management_clients jsonb default '[]'::jsonb;
alter table public.planner_media_kit add column if not exists merch_links jsonb default '[]'::jsonb;
alter table public.planner_media_kit add column if not exists discord jsonb default '{}'::jsonb;
alter table public.planner_media_kit add column if not exists past_creator_collabs jsonb default '[]'::jsonb;

-- Indexes
create index if not exists planner_media_kit_slug_idx
  on public.planner_media_kit (slug);
create index if not exists planner_media_kit_is_public_idx
  on public.planner_media_kit (is_public) where is_public = true;

-- updated_at trigger
create or replace function public.planner_media_kit_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists planner_media_kit_touch on public.planner_media_kit;
create trigger planner_media_kit_touch
  before update on public.planner_media_kit
  for each row execute function public.planner_media_kit_touch_updated();

-- ---------------------------------------------------------------------------
--  RLS — planner_media_kit
-- ---------------------------------------------------------------------------
alter table public.planner_media_kit enable row level security;

drop policy if exists "media kit owner all"   on public.planner_media_kit;
drop policy if exists "media kit manager all" on public.planner_media_kit;
drop policy if exists "media kit public read" on public.planner_media_kit;

create policy "media kit owner all"
  on public.planner_media_kit
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "media kit manager all"
  on public.planner_media_kit
  for all
  using (public.planner_is_manager_of(user_id))
  with check (public.planner_is_manager_of(user_id));

-- Public (anon + auth): SELECT only, only when is_public = true.
create policy "media kit public read"
  on public.planner_media_kit
  for select
  to anon, authenticated
  using (is_public = true);


-- ---------------------------------------------------------------------------
--  2. planner_sponsor_pitches — pitch drafts (owner + manager only)
-- ---------------------------------------------------------------------------
create table if not exists public.planner_sponsor_pitches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Pitch identity
  name text,                         -- "Pitch to Nerdy By Nature" (creator-set)
  brand_name text,
  brand_url text,
  brand_description text,

  -- Pitch shape
  sponsorship_type text,             -- 'product_seeding' | 'paid_integration' |
                                     -- 'affiliate' | 'long_term_ambassador' |
                                     -- 'stream_sponsor' | 'gifted_collab' |
                                     -- 'event' | 'other'
  tone text default 'warm',          -- 'warm' | 'professional' | 'playful' | 'casual'
  goals text[] default '{}',

  -- Substance
  audience_fit_notes text,
  personal_angle text,
  deliverables jsonb default '[]'::jsonb,
  proposed_pricing text,

  -- Generated outputs (editable post-generation)
  email_subject text,
  email_body text,
  twitter_dm text,
  discord_dm text,
  instagram_dm text,
  pitch_doc_html text,
  rate_card_snapshot jsonb,

  -- Pipeline tracking
  status text not null default 'draft',  -- 'draft' | 'sent' | 'responded' |
                                         -- 'signed' | 'passed' | 'archived'
  sent_at timestamptz,
  responded_at timestamptz,
  outcome_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planner_sponsor_pitches_user_idx
  on public.planner_sponsor_pitches (user_id);
create index if not exists planner_sponsor_pitches_status_idx
  on public.planner_sponsor_pitches (user_id, status);

create or replace function public.planner_sponsor_pitches_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists planner_sponsor_pitches_touch on public.planner_sponsor_pitches;
create trigger planner_sponsor_pitches_touch
  before update on public.planner_sponsor_pitches
  for each row execute function public.planner_sponsor_pitches_touch_updated();

-- RLS — owner + manager only
alter table public.planner_sponsor_pitches enable row level security;

drop policy if exists "sponsor pitches owner all"   on public.planner_sponsor_pitches;
drop policy if exists "sponsor pitches manager all" on public.planner_sponsor_pitches;

create policy "sponsor pitches owner all"
  on public.planner_sponsor_pitches
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "sponsor pitches manager all"
  on public.planner_sponsor_pitches
  for all
  using (public.planner_is_manager_of(user_id))
  with check (public.planner_is_manager_of(user_id));


-- ---------------------------------------------------------------------------
--  3. RPC — planner_media_kit_peek(slug)
--
--  SECURITY DEFINER so the public page can fetch a kit by friendly slug
--  without knowing the creator's UUID. Returns only the public-safe columns,
--  only when is_public = true. Anon-callable.
--
--  DROP+CREATE so the function signature can be widened by future migrations
--  without a "cannot change return type of existing function" error.
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
--  4. RPC — planner_media_kit_claim_slug(new_slug)
--
--  Lets the owner change their slug atomically (fail-fast on collision
--  instead of racing). Returns the new slug or null on conflict.
--  Validates regex + reserved word denylist. SECURITY DEFINER but bound to
--  auth.uid() so a manager cannot claim a slug for a different creator.
-- ---------------------------------------------------------------------------
create or replace function public.planner_media_kit_claim_slug(p_new_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text := lower(trim(p_new_slug));
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  if v_normalized is null or length(v_normalized) < 2 then
    raise exception 'slug must be at least 2 characters';
  end if;

  if v_normalized !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' then
    raise exception 'slug may only contain a-z, 0-9, and dashes (not leading/trailing)';
  end if;

  -- Reserved slugs we don't want anyone claiming
  if v_normalized in ('admin','api','app','www','about','login','signup',
                      'media-kit','sponsor-pitch','planner','manager-hub',
                      'editor','analyzer','growth','habits','thumbnail',
                      'todo','tasks','support') then
    raise exception 'that slug is reserved';
  end if;

  select user_id into v_existing
    from public.planner_media_kit
   where slug = v_normalized
   limit 1;

  if v_existing is not null and v_existing <> auth.uid() then
    return null;  -- taken
  end if;

  -- Upsert the slug onto the caller's row
  insert into public.planner_media_kit (user_id, slug)
    values (auth.uid(), v_normalized)
    on conflict (user_id) do update set slug = excluded.slug;

  return v_normalized;
end $$;

grant execute on function public.planner_media_kit_claim_slug(text) to authenticated;


-- ---------------------------------------------------------------------------
--  Done. After running:
--    - media-kit.html ?u=<slug-or-uuid>           — public sponsor view
--    - media-kit.html (signed in)                  — editor view
--    - sponsor-pitch.html                          — pitch builder (owner only)
-- ---------------------------------------------------------------------------
