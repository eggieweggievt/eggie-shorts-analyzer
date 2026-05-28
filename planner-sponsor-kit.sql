-- ============================================================================
--  planner-sponsor-kit.sql
--  V4 — Sponsor / Media Kit + Pitch Builder
--  Adds:
--    1. planner_media_kit            — one row per creator. Public-readable when
--                                       is_public = true. Powers media-kit.html.
--    2. planner_sponsor_pitches      — per-pitch draft (one brand, one outreach).
--                                       Owner / manager only. Powers
--                                       sponsor-pitch.html.
--    3. planner_media_kit_slug_check — helper function used by the public read
--                                       path so people can land on
--                                       creatorhub.eggieweggie.ca/media-kit.html?u=eggie
--                                       instead of pasting a UUID.
--
--  All policies are additive and mirror the existing planner_* pattern:
--    - Owner full via user_id = auth.uid()
--    - Manager full via planner_is_manager_of(user_id)
--    - Editors: NO access (sponsor stuff is not editor business)
--    - Anon / signed-in: SELECT planner_media_kit WHERE is_public = true
--
--  Run after: planner-supabase-v2.sql, planner-managers.sql,
--             planner-manager-hub-v2.sql, planner-managers-open-invites.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. planner_media_kit
-- ---------------------------------------------------------------------------
create table if not exists public.planner_media_kit (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Friendly slug for sharing. Defaults to user_id::text so the row is usable
  -- the moment it's created; the creator can override it in the editor.
  slug text unique not null,

  -- Visibility toggle. When false the row exists but the public read policy
  -- denies anon access (owner / manager can still edit).
  is_public boolean not null default false,

  -- Identity block
  display_name text,           -- "Eggie Weggie"
  tagline text,                -- "Cozy VTuber, big chat energy"
  bio text,                    -- 1-3 paragraph about-me
  avatar_url text,
  banner_url text,
  location text,               -- "PST" or "Canada" — whatever the creator wants public
  languages text[] default '{}',
  pronouns text,

  -- Niche / vibe
  niche_primary text,          -- e.g. "Cozy gaming"
  niche_secondary text,
  vibe_tags text[] default '{}',         -- ['cozy','storytime','queer-friendly']
  content_pillars jsonb default '[]'::jsonb,  -- [{title, description}]

  -- Per-platform stats. Each entry:
  --   { platform: 'youtube' | 'twitch' | 'tiktok' | 'instagram' | 'x' | 'kick' | 'other',
  --     label, url, handle,
  --     subscribers, avg_views, avg_live_viewers, engagement_rate,
  --     last_updated, notes }
  -- Stats are MANUAL — there's no scheduled refresh — but the editor offers
  -- paste-URL helpers that prefill handle / channel name / link.
  platforms jsonb default '[]'::jsonb,

  -- Audience demographics. Free-form JSON; the editor + public view know
  -- about: age_brackets (object 13-17/18-24/25-34/35-44/45+), gender_split,
  -- top_countries (array of {code, pct}), top_interests (array of strings).
  audience_demographics jsonb default '{}'::jsonb,

  -- Standout content the creator wants sponsors to see.
  -- [{ title, url, thumbnail, views, platform, posted_at, note }]
  top_content jsonb default '[]'::jsonb,

  -- Brand history. [{ brand, type, year, results, testimonial, logo_url, link }]
  past_sponsorships jsonb default '[]'::jsonb,

  -- What the creator is open to. ['integrated_short','dedicated_video',
  -- 'stream_sponsor','long_term_ambassador','affiliate','product_review',
  -- 'gifted_collab','event_appearance','custom_art']
  services_offered text[] default '{}',

  -- Public rate card. [{ service, price, currency, notes, hidden }]
  -- `hidden` lets the creator stage a price without exposing it publicly.
  pricing jsonb default '[]'::jsonb,

  -- Visual brand
  brand_colors text[] default '{}',     -- ['#FFB2F0','#4D5BC0']

  -- Contact + CTA
  contact_email text,                   -- where sponsors should reach out
  booking_link text,                    -- optional calendar / form link
  social_handles jsonb default '{}'::jsonb,  -- { twitter, twitch, youtube, ... }

  -- House-keeping
  last_stats_update_at timestamptz,
  theme text default 'default',         -- 'default' | 'minimal' | 'bold' — reserved
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists planner_media_kit_slug_idx
  on public.planner_media_kit (slug);
create index if not exists planner_media_kit_is_public_idx
  on public.planner_media_kit (is_public) where is_public = true;

-- updated_at trigger (re-uses pattern from other planner_* tables)
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

-- Owner: full access to their own row
create policy "media kit owner all"
  on public.planner_media_kit
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Manager: full access to any creator who delegated to them
create policy "media kit manager all"
  on public.planner_media_kit
  for all
  using (public.planner_is_manager_of(user_id))
  with check (public.planner_is_manager_of(user_id));

-- Public (anon + auth): SELECT only, only when is_public = true.
-- This is the read path the sponsor-facing page uses.
create policy "media kit public read"
  on public.planner_media_kit
  for select
  to anon, authenticated
  using (is_public = true);

-- ---------------------------------------------------------------------------
--  2. planner_sponsor_pitches
-- ---------------------------------------------------------------------------
create table if not exists public.planner_sponsor_pitches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Pitch identity
  name text,                         -- "Pitch to Nerdy By Nature" (creator-set)
  brand_name text,
  brand_url text,
  brand_description text,            -- what they sell, in the creator's words

  -- Pitch shape
  sponsorship_type text,             -- 'product_seeding' | 'paid_integration' |
                                     -- 'affiliate' | 'long_term_ambassador' |
                                     -- 'stream_sponsor' | 'gifted_collab' |
                                     -- 'event' | 'other'
  tone text default 'warm',          -- 'warm' | 'professional' | 'playful' | 'casual'
  goals text[] default '{}',         -- ['paid','free_product','long_term','experience']

  -- Substance of the pitch
  audience_fit_notes text,           -- why this brand fits THIS creator's audience
  personal_angle text,               -- the "I genuinely love your X" line
  deliverables jsonb default '[]'::jsonb,  -- [{ kind, quantity, notes }]
  proposed_pricing text,             -- free-form ("$450 dedicated short + $150 affiliate")

  -- Generated outputs (editable post-generation)
  email_subject text,
  email_body text,
  twitter_dm text,
  discord_dm text,
  instagram_dm text,
  pitch_doc_html text,               -- standalone HTML the public pitch doc page renders
  rate_card_snapshot jsonb,          -- frozen snapshot of pricing[] at time of pitch

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

-- ---------------------------------------------------------------------------
--  RLS — planner_sponsor_pitches  (owner + manager only — no public, no editor)
-- ---------------------------------------------------------------------------
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
--  3. RPC — planner_media_kit_peek(slug_or_uuid)
--
--  SECURITY DEFINER so the public page can fetch a kit by friendly slug
--  without needing the caller to know the creator's UUID. Returns only the
--  public-safe columns, and only when is_public = true. Anon-callable.
-- ---------------------------------------------------------------------------
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
--  Lets the owner change their slug atomically (so they can fail-fast on a
--  collision instead of racing). Returns the new slug or null on conflict.
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
