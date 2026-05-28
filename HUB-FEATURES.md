# Creator Hub — Feature Reference 🐙

> The engineering-level deep-dive for [creatorhub.eggieweggie.ca](https://creatorhub.eggieweggie.ca).
> For the friendly entry point, see [README.md](./README.md).

This doc walks through every page, every modal, every button, every database table, and every "if you don't know this, things break silently" quirk. It's designed to be **appended to** as new features ship — see the [**template at the bottom**](#template--add-a-new-feature-here) for the exact headings to copy.

---

## How this doc is organized

1. [**Architecture overview**](#architecture-overview) — Supabase, RLS, magic links, the shared-look-and-feel system.
2. [**Data model reference**](#data-model-reference) — every table, every important column, every role's access.
3. **Per-page deep-dives** — one section per HTML file:
   - [`index.html`](#indexhtml--hub-homepage)
   - [`planner.html`](#plannerhtml--the-creators-main-planner)
   - [`planner-editor.html`](#planner-editorhtml--editor-dashboard)
   - [`manager-hub.html`](#manager-hubhtml--universal-manager-dashboard)
   - [`manager-claim.html`](#manager-claimhtml--invite-claim-landing)
   - [`todo.html`](#todohtml--customizable-todo-list)
   - [`analyzer.html`](#analyzerhtml--shorts-analyzer)
   - [`growth.html`](#growthhtml--growth-playbook)
   - [`habits.html`](#habitshtml--sustainable-habits-tracker)
   - [`thumbnail.html`](#thumbnailhtml--thumbnail-checker)
   - [`about.html`](#abouthtml--about--niche-list)
   - [`media-kit.html`](#media-kithtml--sponsor-facing-media-kit)
   - [`sponsor-pitch.html`](#sponsor-pitchhtml--sponsor-pitch-builder)
4. [**Cross-cutting patterns**](#cross-cutting-patterns) — the gotchas that span multiple files.
5. [**Brand & visual system**](#brand--visual-system) — colors, fonts, motifs, voice.
6. [**Template: "add a new feature here"**](#template--add-a-new-feature-here) — copy this whenever you ship something new.

---

## Architecture overview

**Frontend.** Plain static HTML/CSS/JS, no build step. Every page is fully self-contained — open one in a browser and it works. The hub is deployed by uploading the files to a static host (currently the production deploy at `creatorhub.eggieweggie.ca`).

**Backend.** [Supabase](https://supabase.com) project ID `okrheyotpypulweedhda`. Hardcoded URL + anon key in every page that talks to the database. Provides:

- **Auth** — passwordless magic-link OTP.
- **Postgres + RLS** — every table has Row-Level Security policies enforcing who can read/write what.
- **Realtime** — `postgres_changes` subscriptions sync the UI live when data changes.
- **Storage** — single bucket `planner-files`, 5 GB per file, organized as `{owner_id}/{item_id}/`.

**The three roles.** Every database policy answers "is this user an **owner**, **editor**, or **manager** of the row in question?"

| Role | How they're identified | What they can do |
|---|---|---|
| **Owner** | `user_id = auth.uid()` | Full access to their own data. |
| **Editor** | `assignee_email = auth.email()` (lowercase) | Read items assigned to them. Update status (within `EDITOR_STATUSES`), notes, and upload attachments. Read the brand kit of any creator who's assigned them work. |
| **Manager** | `planner_is_manager_of(owner_id)` returns true (helper checks `planner_managers` for a claimed, non-revoked row) | Acts as the owner. Full CRUD on items, editors, brand kit, todos, storage. Can't manage *other* managers — that's owner-only. |

**Why three roles?** Owners do everything. Editors are scoped to specific items. Managers are like "co-owner with an off-switch" — they get the full hub but can be revoked at any moment.

**Magic-link auth.** Every page with sign-in calls `sb.auth.signInWithOtp({email, options:{emailRedirectTo: window.location.href}})`. The email landing page redirects back, and `sb.auth.onAuthStateChange` picks up the session. Magic links don't work under `file://` (browsers block them) — use a local server or just hit the deployed site.

**Email normalization.** `auth.email()` from Supabase is **always lowercase**. So everything that writes `assignee_email` or `planner_managers.email` must `.trim().toLowerCase()` before insert, and everything that reads should use `.ilike()` (or backfill old data to lowercase). See [the email-normalization rule](#the-email-normalization-rule) below for full detail.

**The look-and-feel system.** Every HTML page defines the same `:root` CSS variables (see [Brand & visual system](#brand--visual-system)). Cards are frosted (`rgba(255,255,255,0.85)` + `backdrop-filter:blur(14px)`). Headings use Pacifico with gradient text. Backgrounds use multi-stop radial gradients (pink → mint → periwinkle).

---

## Data model reference

All tables live in the Supabase `public` schema unless noted. RLS is on for every table.

### `planner_items` — content cards

The core table. Every video / project / piece of content is one row.

Key columns: `id`, `user_id` (the owner), `title`, `status` (`idea` / `script` / `recording` / `editing` / `scheduled` / `posted` / `archived`), `is_priority`, `platforms[]`, `assignee_email`, `deadline_at`, `posted_at`, `hook`, `script`, `hashtags`, `thumbnail_url`, `footage_url`, `editor_files_url`, `editor_notes`, `additional_assets` (JSONB array of `{label, url}`), `attachments` (JSONB array of storage paths), `notes`, `position` (kanban ordering), `analyzer_score`, `analyzer_url`.

**RLS:**
- Owners: full access to their own rows.
- Editors: SELECT + UPDATE rows where `lower(assignee_email) = auth.email()`.
- Managers: full access via `planner_is_manager_of(user_id)`.

### `planner_editors` — Eggie's editor roster

One row per editor the creator has added. Identity is owned by the creator.

Key columns: `id`, `user_id` (creator), `name`, `email` (lowercase), `color`, `notes`.

**RLS:** owners full; editors can SELECT/UPDATE their own row (matched by email); managers full.

### `planner_brand_kit` — branding bundle

One row per creator. Bundles images, video references, asset folder links, notes.

Key columns: `user_id` (PK), `branding_images` (JSONB array of `{url, label}`), `video_references` (JSONB array), `asset_folders` (JSONB array), `notes`.

**RLS:** owner full; editor can SELECT the brand kit of any creator who has assigned them an item; manager full.

### `planner_todos` — task list

Customizable todos with recurrence, subtasks, planner-item linking.

Key columns: `id`, `user_id`, `title`, `bucket` (`today` / `week` / `later` / `done`), `category_id`, `is_priority`, `due_at`, `estimate_minutes`, `repeat_type` (`none` / `daily` / `weekdays` / `weekly` / `monthly` / `custom`), `repeat_days[]`, `subtasks` (JSONB), `tags[]`, `linked_item_id` (FK to `planner_items`), `notes`, `completed_at`.

**RLS:** owners full; managers full; editors can SELECT todos linked to items they're assigned to.

### `planner_todo_categories` — todo categories

Key columns: `id`, `user_id`, `name`, `icon`, `color`.

### `planner_focus_sessions` — pomodoro log

Powers the focus-timer streak.

Key columns: `id`, `user_id`, `todo_id` (nullable), `started_at`, `ended_at`, `duration_minutes`, `completed` (bool).

### `planner_managers` — manager delegation

The roster of people the creator has invited to manage their hub.

Key columns: `id`, `owner_id` (the creator delegating), `email` (lowercase, **nullable** for open invites), `name`, `token` (UUID for the invite link), `claimed_at`, `revoked_at`, `last_seen_at`.

**RLS:** owner manages their own roster. A user can SELECT/UPDATE rows where `lower(email) = auth.email()` AND `email IS NOT NULL` (so open invites don't leak through normal reads — they only come through the peek RPC).

### `planner_client_profiles` — manager's per-client notes

The manager's private take on each creator they manage. The creator never sees this.

Key columns: `manager_user_id`, `owner_id`, `display_name` (manager's override of the creator's email), `color`, `private_notes`, `pinned`. Composite PK.

**RLS:** strictly self-only — the manager who owns the row reads/writes it. Insert additionally requires an active manager delegation for that owner.

### `planner_comments` — polymorphic threads

Comments on planner items AND todos, with role tagging.

Key columns: `id`, `parent_type` (`item` / `todo`), `parent_id`, `author_user_id`, `author_email`, `author_role` (`owner` / `manager` / `editor`), `body`, `created_at`.

**RLS:**
- Owners + managers: read everything on their data.
- Editors: read item-comments only on items they're assigned to.
- Insert role tagging is enforced server-side — you can only post as a role you actually hold.
- Authors can update/delete their own; owners/managers can delete any (moderation).

### `planner_media_kit` — sponsor-facing media kit

One row per creator. Powers `media-kit.html`. Read-allowed for anon when `is_public = true` (this is the only `planner_*` table with a public read policy).

Key columns: `user_id` (PK), `slug` (unique, friendly URL), `is_public` (bool — gates the public read policy), `display_name`, `tagline`, `bio`, `avatar_url`, `banner_url`, `location`, `languages[]`, `pronouns`, `niche_primary`, `niche_secondary`, `vibe_tags[]`, `content_pillars` (JSONB array of `{title,description}`), `platforms` (JSONB array of per-platform stat rows — see below), `audience_demographics` (JSONB — age brackets, gender split, top countries, interests, plus a soft `_blurb` field for the contact CTA), `top_content` (JSONB), `past_sponsorships` (JSONB), `services_offered[]`, `pricing` (JSONB — each entry has `hidden` so a price can be saved without exposing it), `brand_colors[]`, `contact_email`, `booking_link`, `social_handles` (JSONB), `last_stats_update_at`, `theme`.

**`platforms` row shape:** `{ platform, label, url, handle, subscribers, avg_views, avg_live_viewers, engagement_rate, last_updated, notes }`. The editor's "paste channel URL" helper extracts handle from the URL but stats stay manual.

**RLS:**
- Owner: full access.
- Manager: full access via `planner_is_manager_of(user_id)`.
- Anon + authenticated: SELECT-only, only when `is_public = true`.
- Editors: no access (sponsor stuff is not editor business).

**Why two read paths?** The direct table read (`select('*').eq('user_id',…)`) is what the editor uses. The `planner_media_kit_peek(slug)` RPC is what the public page calls — it's `SECURITY DEFINER` so anon can look a kit up by friendly slug without needing the UUID, and it returns only when `is_public = true`.

### `planner_sponsor_pitches` — per-brand pitch drafts

Powers `sponsor-pitch.html`. Owner / manager only — no public, no editor.

Key columns: `id`, `user_id`, `name` (creator-set label), `brand_name`, `brand_url`, `brand_description`, `sponsorship_type` (`product_seeding` / `paid_integration` / `affiliate` / `long_term_ambassador` / `stream_sponsor` / `gifted_collab` / `event` / `other`), `tone` (`warm` / `professional` / `playful` / `casual`), `goals[]`, `audience_fit_notes`, `personal_angle`, `deliverables` (JSONB array), `proposed_pricing`, `email_subject`, `email_body`, `twitter_dm`, `discord_dm`, `instagram_dm`, `pitch_doc_html` (the printable one-page doc HTML), `rate_card_snapshot` (frozen at save time so the pitch records the rates that were proposed, even if you update your rate card later), `status` (`draft` / `sent` / `responded` / `signed` / `passed` / `archived`), `sent_at`, `responded_at`, `outcome_notes`.

**RLS:** owner + manager (additive) — no public, no editor.

**Generation pattern.** The text outputs are generated client-side by the page from the form + the creator's `planner_media_kit` row. Once generated, every output is editable in place (`contenteditable`) and re-saved to the row. The "↻ Regenerate" button overwrites edits — confirmation prompt before doing so.

### SECURITY DEFINER RPCs for media kit

| RPC | Caller | Purpose |
|---|---|---|
| `planner_media_kit_peek(slug)` | anon + auth | Looks up a kit by friendly slug OR UUID. Returns public-safe columns only. Filters `is_public = true`. |
| `planner_media_kit_claim_slug(new_slug)` | auth | Atomically claims a slug for the caller. Returns `null` on collision. Validates lowercase + dashes + reserved-word denylist. Upserts the row if it doesn't exist yet. |

### `planner_habits_state` — habits sync

One row per user; the entire habits state is a single JSONB blob mirrored from localStorage.

Key columns: `user_id` (PK), `habits` (JSONB), `logs` (JSONB), `settings` (JSONB).

**RLS:** owner-only.

### `analyzer_user_prefs` — analyzer onboarding + bias

Drives the analyzer's recommendation weighting.

Key columns: `user_id` (PK), `sticky_tags[]`, `blocked_tags[]`, `niche_primary`, `niche_secondary`, `vtuber_type`, `content_forms[]`, `voice_tone[]`, `target_audience`, `platforms[]`, `goals[]`, `topic_synonyms` (JSONB), `candidate_tags[]`, `onboarded_at`.

**RLS:** owner-only.

### `analyzer_runs` — saved analyses

One row per saved analyzer run.

### `analyzer_title_ratings` / `analyzer_tag_ratings` — feedback for learning

Thumbs-up/down on suggested titles and tags. Feeds back into recommendation weights.

### `analyzer_trends` — shared trends cache

The only analyzer table that's NOT owner-only. Readable by anyone signed in; written by a scheduled job pulling VidIQ keyword data.

### Storage bucket: `planner-files`

5 GB per file cap. Folder convention: `{owner_id}/{item_id}/<filename>`.

**Policy:** owner has all; editors can read + upload into folders for items they're assigned to; managers full (after regex-validating the first path segment is a valid UUID — prevents non-UUID folder names from triggering unintended access).

### SECURITY DEFINER RPCs

| RPC | Caller | Purpose |
|---|---|---|
| `planner_manager_peek_invite(token)` | anon + auth | Returns invite preview (creator email, locked email, claimed/revoked flags, `is_open`). Anon-callable so the claim page can confirm the link before sign-in. |
| `planner_manager_claim_invite(token)` | auth | Enforces email-lock match. Idempotent. Handles three open-invite edge cases (no existing row → bind email; existing active → touch last_seen + drop the open row; existing revoked → reject). |
| `planner_list_my_delegations()` | auth | Returns active delegations for the current user (powers manager-hub + planner.html's hub-picker). |
| `planner_is_manager_of(uuid)` | (helper used inside RLS) | Returns true if `auth.email()` matches an active row in `planner_managers` for that owner_id. |

---

## `index.html` — hub homepage

**Purpose.** The first thing people land on. Brand hero, six tool tiles, personalized welcome card when signed in.

**Who can use it.** Anyone. Signed-in users get the welcome card + habits widget (only renders if `localStorage.eggie.habits.v1` has data).

**Layout.**
- Fixed top-right **auth pill** (`#siteAuthPill`) → opens `#siteAuthModal`. Signed-in label is "🐙 <username>".
- Top utility row: `👑 Manager Hub` pill → `manager-hub.html`.
- Hero: brand logotype PNG + `hero-chibi.png` mascot (with `gentle-bob` animation) + Pacifico gradient headline.
- Welcome card (`#welcomeCard`, hidden until signed in) with "Sign out" button.
- Habits widget (`#habitsWidget`): today's done / week total / longest streak / progress bar, "Open tracker →" link. Reads `localStorage.eggie.habits.v1`; allows 1 missed day before breaking a streak.
- 8 tool tiles with hover translate-Y + CTA pills:
  1. **Shorts Analyzer** → `analyzer.html`
  2. **Growth Playbook** → `growth.html`
  3. **Thumbnail Checker** → `thumbnail.html`
  4. **Content Planner** → `planner.html`
  5. **Sustainable Habits** → `habits.html`
  6. **To-Do List** → `todo.html`
  7. **Media Kit** → `media-kit.html`
  8. **Pitch Builder** → `sponsor-pitch.html`
- "More tools coming" section listing 4 future ideas (sustainable schedule quiz, bio/branding workshop, debut prep checklist, niche discovery quiz). Sponsor pitch builder shipped 2026-05-28.
- About-Eggie strip + Twitter link.
- Support row: Ko-fi button + `@EggieWeggieVT` Twitter pill.

**Auth flow.** Sign-in here propagates to every other tool via `sb.auth.getSession()`.

**DB touch.** None — only `sb.auth`. Reads `localStorage.eggie.habits.v1`.

---

## `planner.html` — the creator's main planner

**The big one.** 5,500+ lines. Eggie's content workspace.

**Who can use it.** Signed-in creators (own hub). Managers via `?manage=<manager_id>` URL — flips the page into impersonation mode.

### Top-level layout

- Back-row links: Hub / Editor view / Tasks / Habits / Playbook / About.
- `#authView` — magic-link sign-in card (shown when signed out).
- `#appView` — everything when signed in:
  - **User bar** — email, connection dot, `#hubPickerBtn` (only visible if `planner_list_my_delegations()` returns ≥1 row), `#signOutBtn`.
  - **Impersonation banner** (`#impersonationBanner`) — shown when `?manage=<id>` is set. "Exit manager mode" button restores you to your own hub.
  - **Todo widget** (`#todoWidget`) — embedded mini-todo. Quick-add input, today's tasks, streak chip, collapse toggle, "Open full to-do →" link to `todo.html`.
  - **Toolbar** — `+ New item`, `👥 Editors`, `👑 Managers`, `🎨 Brand kit`, `🎙️ Stream schedule`, view-toggle (📋 Kanban / 📑 List / 📆 Calendar), editor filter, form-type pills (📱 Short / 📺 Long / ⭐ Important), search.
  - **Kanban view** — 7 status columns. Drag-drop reorders via the `position` column. "archived" hidden by default.
  - **Calendar view** — month grid with prev/next/today, legend (item deadline / item posted / stream slot recurring).
  - **List view** — table: Title / Status / Platforms / Assignee / Deadline.

### Item modal (`#itemModal`)

The full editor for a single content item. Opens via `+ New item` or clicking a card.

Fields:
- Title + ⭐ priority checkbox.
- Status select (7 options).
- Editor select (populated from `planner_editors`).
- Platform pills (YT Shorts / YT Long / TikTok / IG / X / Twitch).
- Deadline + Posted datetime.
- Hook, Script (with `🎬 Recording mode` button → teleprompter), Hashtags.
- Thumbnail URL, Footage URL, Editor output URL.
- File uploads (5 GB cap each) → Supabase Storage `planner-files/{owner_id}/{item_id}/`.
- Additional assets — dynamic labeled link rows (`+ Add asset link`).
- **Quick title score** inline panel (calls the analyzer engine on the title as you type) + `Open full analyzer` button (passes title via URL param).
- Analyzer score + Analyzer link (when saved from analyzer.html).
- Notes.
- **Comments thread** — role-tagged (`authorRole()` returns `manager` when impersonating, `owner` otherwise).
- Delete / Cancel / Save buttons.

### Editors modal (`#editorsModal`)

Manage the editor roster.

- Editor list with per-row actions: Copy link / Preview / Edit / Remove.
- Identity section (creator-managed): name, email, color swatch.
- Generated invite link block with `📋 Copy` + `↗ Open`.
- Note pointing editors to the brand kit.

### Managers modal (`#managersModal`)

Manage the manager roster.

- Manager list with per-row actions: Copy link / Revoke / Delete.
- Invite form: name, optional email.
- **Email blank = open invite** — anyone signed in can claim. Roster status pill says "open link" until claimed; afterwards shows the bound email.
- Generates locked or open invite link with Copy/Open.

### Other modals

- **Editor preview** (`#editorPreviewModal`) — opens `planner-editor.html` for any editor row inside an iframe. Useful for "what does my editor actually see?"
- **View modal** (`#viewModal`) — read-only item detail (quick status, ⭐ star, Edit / Record / Close / Delete).
- **Brand kit modal** (`#brandKitModal`) — branding images grid + list (with image upload), video reference links, asset folder links, notes textarea. "Save brand kit" persists to `planner_brand_kit`.
- **Stream schedule modal** (`#streamScheduleModal`) — 7-day grid (Sun-Sat) with recurring slots (start, end, title, color from `STREAM_COLORS`).

### Teleprompter overlay (`#teleprompterOverlay`)

Fullscreen script reader. Keyboard controls:

| Key | Action |
|---|---|
| Space | Play/pause |
| R | Restart |
| ↑ / ↓ | Speed up/down |
| + / − | Font size up/down |
| Esc | Close |

Speed slider 0.3-6×, font size 20-80, mirror toggle.

### Realtime sync

| Channel | Watches | Filter |
|---|---|---|
| `planner_items_realtime` | `planner_items` | `user_id = currentOwnerId` |
| `planner_editors_realtime` | `planner_editors` | `user_id = currentOwnerId` |
| `planner_managers_realtime` | `planner_managers` | `owner_id = currentUser.id` (**not** ownerId — see [currentOwnerId pattern](#the-currentownerid-pattern)) |
| `planner_todos_widget` | `planner_todos` | `user_id = currentOwnerId` |

Realtime `postgres_changes` filters only support `eq`, **not** `ilike` — so data must already be lowercased for editor live updates to work.

### State variables to know

- `currentUser` — the signed-in user object.
- `currentOwnerId` — the **data owner** (`currentUser.id` when on your own hub, OR the delegating creator's UUID when impersonating).
- `impersonating` — boolean. True when `?manage=<id>` is in URL.
- `managerDelegations` — array from `planner_list_my_delegations()`.
- `formFilter`, `priorityOnly` — toolbar state.

See [the currentOwnerId pattern](#the-currentownerid-pattern) below for the critical rule about when to use which.

### Tables touched

`planner_items`, `planner_editors`, `planner_managers`, `planner_client_profiles` (read for manager display names), `planner_comments`, `planner_brand_kit`, `planner_todos`, `planner_todo_categories`. RPCs: `planner_list_my_delegations`. Storage: `planner-files`.

---

## `planner-editor.html` — editor dashboard

**Purpose.** Editor-facing read/limited-write view. Brand kit + assigned items grouped into Ready / In progress / Done.

**Who can use it.** Anyone signed in via magic link, with an email a creator has added to their editor roster.

### Layout

- Back-row: Hub / Planner (creator view).
- `#authView` with **personalized welcome banner** — fills creator's chosen name from `?name=` URL param.
- `#appView`:
  - User bar (email + connection dot + Sign out).
  - **Brand kit card** (`#brandKitCard`) — shown to every editor on every project they're assigned to. Branding images, editing-style videos, asset folder links, creator's notes. Collapsible.
  - **App grid:** profile column (read-only — identity managed by creator) + tasks column.
  - **Project list** grouped:
    - 🌟 Ready to work on
    - 🛠️ In progress
    - ✅ Done

Each project card shows: status pills, platform pills, deadline, hook, script preview, footage/editor file links, additional assets, attachment download links, editor notes editor (`💾 Save notes`), status-transition buttons.

### `EDITOR_STATUSES`

Editors can only transition into: `recording`, `editing`, `scheduled`. Final `posted` ship is creator-only.

### Query filter

Reads `planner_items` filtered by `.ilike('assignee_email', currentUser.email)` for backward compat with legacy mis-cased data. The RLS policy is strict-equal on the DB side — for full backward compat, lowercase old rows OR use a `lower(...)` policy. See [email-normalization rule](#the-email-normalization-rule).

### Realtime

`editor-items-realtime` channel — but realtime filters can't use `.ilike`, so live updates require data to already be lowercase.

---

## `manager-hub.html` — universal manager dashboard

**Purpose.** Lists every creator who's delegated co-owner access to the signed-in user.

**Who can use it.** Anyone signed in. Empty state if no delegations — pointer to "ask the creator for an invite" or `➕ Add a client` panel.

### Layout

- Back-row: Hub / Own planner.
- `#authView` — magic-link sign-in.
- `#dashboardView`:
  - User bar: email + `➕ Add a client` / `🔄 Refresh` / `Sign out`.
  - **Add-client panel** — paste an invite URL or token; auto-extracts `?token=` from a pasted URL and calls the claim RPC.
  - **Summary bar** — 5 stats: Clients / Active projects / Next 7 days / In editing / Recent editor notes.
  - **Clients grid** — one card per delegation.

### Client card

- 👑 crown avatar, display name (manager's override OR creator's email), pin star.
- Status count row (7 columns matching `STATUS_DEFS`).
- Active project count + "last update" relative time.
- **Attention block** — "scheduled this week / stuck in editing >5d / new editor notes" OR "✓ All clear".
- **Expandable client profile + private notes** — display name override + private notes textarea, auto-save 700 ms debounced, "🔒 only you see it" warning.
- `Open hub` button → `planner.html?manage=<manager_id>`.
- `Editor view` button.

### Sorting

Pinned first, then by `claimed_at desc`.

### Tables

`planner_client_profiles`, `planner_items` (read via manager RLS). RPCs: `planner_manager_peek_invite`, `planner_manager_claim_invite`, `planner_list_my_delegations`.

### Error case

If `planner_client_profiles` doesn't exist (relation missing), the page shows: "Run `planner-manager-hub-v2.sql` first".

---

## `manager-claim.html` — invite claim landing

**Purpose.** Landing page for `?token=…` invite links. Confirms invite, prompts sign-in, claims, redirects.

**Who can use it.** Anyone with the link. Locked invites require sign-in with the specified email; open invites accept any email.

### Views

Toggled by `.hidden` class:

1. `#loadingView` — initial peek lookup.
2. `#inviteView` — shows creator name + perks list + `🔒 locked to <email>` OR `🔓 open invite` block + email input (readonly if locked) + `📬 Send magic link`.
3. `#claimView` — after magic-link return: "Signed in as <email>" + `👑 Claim manager access` + "Use a different account" sign-out fallback.
4. `#successView` — "🎉 You're in!" + auto-redirect to `planner.html?manage=<manager_id>` after 1.4 s.
5. `#errorView` — bad/revoked/missing token + "Try a different account" button.

### Magical auto-claim

If the user is already signed in with an email that matches the locked invite (or it's open), the page auto-advances `inviteView` → `claimView` → `successView` without needing the magic-link round-trip. Feels seamless.

### Backward compatibility

Uses `!!peek.is_open || !peek.email` to detect open invites — degrades gracefully when the `planner-managers-open-invites.sql` migration hasn't been run yet (treats every locked invite normally).

### RPCs only

No direct table writes. `planner_manager_peek_invite` (anon-safe) + `planner_manager_claim_invite` (auth).

---

## `todo.html` — customizable todo list

3,100+ lines. Sister tool to the planner.

**Who can use it.** Signed-in creators (own list). Managers can read/write via RLS.

### Layout

- Back-row links (current = ✓ Tasks).
- `#authView` — magic-link.
- `#appView`:
  - User bar.
  - **Stats row** (`#statsRow`) — dynamic.
  - **End-of-day review banner** (`#reviewBanner`) — "X done today, Open review / Later".
  - **Quick-add bar** with inline shortcut support:
    - `#tag` adds a tag
    - `!today` / `!week` / `!later` sets the bucket
    - Trailing `!` flags priority
    - Category select, bucket select, ⭐ toggle, Add button
  - **Quick-add helper** (`#qaHelper`) — collapsible examples panel.
  - **Toolbar:** search, category filter, filter pills (⭐ Priority / 🚨 Overdue / 🔁 Recurring / 🔗 Linked), view toggle (📋 Board / 📃 List / 📍 Today), 🎨 Categories button, 🌙 Review button.
  - **Board view** (`#boardView`) — 4 columns: Today / This Week / Later / Done. "+ Add task" inline per column.
  - **List view** + **Today-only view**.
- Bottom floating **focus FAB** + **focus dock** (mini timer) + fullscreen **focus overlay**.

### Editor modal (`#editorModal`)

Full task editor. Fields: title, bucket, category, priority, due datetime, estimate minutes, **Repeat** (`none` / `daily` / `weekdays` / `weekly` / `monthly` / `custom`), notes, **subtasks** list, **tags**, **link to planner item** search picker, **comments** thread, Delete / Start focus / Cancel / Save.

### Categories modal (`#catsModal`)

Category CRUD: name, icon emoji, color swatch picker.

### Review modal (`#reviewModal`)

Daily review: stats grid, weekly bar chart, completed-today list, "Roll forward" pending list, Roll all into tomorrow.

### Focus timer

- Default 25-min pomodoro.
- Pop-out into a floating Document Picture-in-Picture window (with popup fallback).
- Pause / Skip / Pop out / Minimize / End session.
- Sessions logged to `planner_focus_sessions` — streak counter reads from here.

### Recurrence

On completion, recurring tasks spawn a fresh row scheduled per their pattern.

### Tables

`planner_todos`, `planner_todo_categories`, `planner_focus_sessions`, `planner_items` (read for link picker), `planner_comments` (item-comment thread reuse).

Realtime: `planner_todos_realtime`, `planner_todo_cats_realtime`, `planner_items_for_todos`.

### Limitation to know

todo.html doesn't yet support manager impersonation — comments posted from this page are always tagged `owner`. If/when this ships, mirror the planner.html `currentOwnerId` pattern.

---

## `analyzer.html` — shorts analyzer

7,600+ lines. The biggest file in the hub by a wide margin.

**Purpose.** In-browser short-form video scoring. Upload video → ML pipeline → /100 score + smart hashtag mix + ready-to-paste post pack.

**Who can use it.** Anyone (anonymous). Sign-in unlocks saved runs, sticky tags, title/tag learning, posted-performance tracking, creator-profile bias.

### The ML pipeline

First run downloads ~310 MB+ of models, cached after:

1. **Florence-2** (vision) — captions 3 frames + OCR.
2. **Whisper-base.en** — speech transcription.
3. **CLIP** — semantic matching against the niche/topic library.
4. **YAMNet** — audio scene classification.
5. **BlazeFace** — face detection on middle frame.

### Layout

- Hero with brand-logo + small character SVG.
- 3-step wizard progress bar + step navigation.
- "Analyzing…" banner with progress + spinner.
- Ko-fi support card.

### Step 1 — Upload your video

Drop-zone for MP4/MOV/WebM, model-loading progress panels, Whisper progress, video preview.

### Step 2 — Tell me about your post

- `quickContext` input.
- Large grid of short-type pills:
  - Primary: gaming / storytime / reaction / pov / vlog / tip / art tutorial / qna / challenge / bts / compilation / debut / custom.
  - Secondary: 🎨 Creator content / 😂 Vibe-modifier / 🤝 Community-identity.
- Custom "Other…" input.
- Collapsible "Add title/description/hashtags" section with **description-template presets dropdown** + save/delete.

### Step 3 — Ready to analyze?

`🐙 Analyze my short` + `Clear all`.

### Results card

Always-on score hero (score ring out of 100, grade, verdict) + 4 tabs:

1. **Overview** — criteria grid sorted by score-impact + checklist.
2. **Suggestions** — critique, title rewrites, hashtag picks.
3. **Post Pack** — copy-paste post grid (YouTube title+desc, TikTok caption, IG caption, 280-char tweet).
4. **Resources** — curated cards (Editing & assets, Shorts & growth, Twitch growth, Conversion & retention, Monetization & sponsors, More to dig into) with external links to xSaandi, Maxor, PerkyPert, Caelum, etc.

Safety/content verdict block shown at top if anything is flagged.

### JS-injected floating widgets

| ID | What it is |
|---|---|
| `#ebAuthPill` | Top-right floating sign-in pill. |
| `#ebProfilePill` | Top-right floating creator-profile pill. |

### Modals (all JS-injected at runtime)

1. `#ebAuthModal` — magic-link sign-in.
2. `#ebMenuModal` — signed-in profile menu: sticky tags list + add, saved runs history, sign out.
3. `#ebProfileModal` — full creator profile / onboarding: display name, primary niche, VTuber style, content forms, voice/tone, audience, platforms, goals, candidate tag library, topic synonyms. Skip/Cancel/Save.
4. `#ebPerfModal` — log how a posted short actually performed: URL, views, likes, comments, shares, notes.

### Learning loop

Thumbs-up/down on titles + tags writes to `analyzer_title_ratings` / `analyzer_tag_ratings`, which feed back into recommendation weights for the signed-in user.

### Trends cache

Reads `trends.json` from a periodic scheduled task pulling VidIQ keyword volume + competition data. Used to bias hashtag/title suggestions toward currently-rising terms.

### Tables

`analyzer_user_prefs`, `analyzer_runs`, `analyzer_title_ratings`, `analyzer_tag_ratings`, `analyzer_trends`.

localStorage: `PROFILE_KEY` (legacy VTuber checkbox), `TEMPLATE_KEY` (description template presets).

---

## `growth.html` — growth playbook

**Purpose.** The master long-form reference behind everything the analyzer scores. Rules, thresholds, tactics.

**Who can use it.** Anyone. No sign-in, no database.

### 18 chapters

Each is a `<details class="growth-section">` with collapsible body:

1. 📊 How the algorithm actually works (open by default)
2. 🎯 The 3 metrics that actually matter
3. ✅ The 4-criteria content rule
4. 📺 YouTube Shorts specifics
5. 💬 Driving more comments
6. 📱 Platform-specific posting rules
7. 🏷️ The hashtag formula (built into the analyzer)
8. 🌱 Growing on Twitch (the real strategy)
9. 📝 Title strategy
10. 🗣️ Getting chatters engaged
11. 🔄 Conversion + retention
12. 💰 Monetization + sponsors (you're a virtual busker)
13. 🐦 Twitter/X for VTubers
14. 📺 Twitch deep-dive (2026 edition)
15. ⚙️ OBS Studio + Twitch setup (best quality)
16. 💸 VTuber monetization, in depth
17. 🌶️ Fansly for VTubers (18+)
18. 📚 Resources mentioned in this guide

### Behavior

- "Pick a chapter" `.growth-toc` jump-link grid at top.
- Anchor-link smooth scroll auto-opens the target `<details>` when clicked.
- Section bodies use `.callout` boxes, `.ref-list` external-link lists, and tables for structured rules.

---

## `habits.html` — sustainable habits tracker

**Purpose.** Spoon-theory habit tracker for VTubers/streamers. Pre-loaded with curated creator habits. Streaks pause, never reset.

**Who can use it.** Anyone (anonymous, local-first). Sign-in syncs across devices.

### Layout

- Fixed floating **auth pill** (`#authPill`).
- Back-row + hero.
- **Top dashboard** (`.dash`): today's count + label + progress bar, **energy picker** (🌙 Low / 🌤 Medium / 🌞 High — cumulative), **stream-day toggle**, **view tabs** (✓ Today / 📚 Library / 📊 Stats).
- **Today view** — categorized list of today's enabled habits with checkoff/counters.
- **Library view** — habit library with category filter pills (All / ⭐ My habits / 🌅 Pre-stream / 🎙️ On-air / 🌙 Post-stream / 📅 Content / 💬 Community / 💖 Health / 💼 Business / 🎨 Batch / 🚫 Hidden) + `+ Add custom habit`.
- **Stats view** — stat grid + 30-day heatmap + sustainability note ("Missing a day doesn't wipe your streak. It pauses.").

### Modals

1. `#authModal` — magic-link sign-in.
2. `#habitModal` — habit editor: name, emoji, category (8 options), energy cost (🟢 essential / 🟦 normal / 🌸 intensive), tracking (daily check-off / weekly target / count), target number, unit, note.

### Behavior rules

- **Energy mode is cumulative:** Low → essential only. Medium → adds normal. High → adds intensive.
- **Stream-day toggle:** on = pre-stream / on-air / post-stream categories visible; off = hidden.
- **Heatmap:** last 30 days.
- **Each category** carries a `link` field in the `CATEGORIES` const pointing to a `growth.html#anchor` so the habit tile links back to the relevant playbook chapter.

### Storage

- `localStorage.eggie.habits.v1` — full state mirror for offline-first.
- `planner_habits_state` table — one row per user keyed by `user_id` with `habits` / `logs` / `settings` JSONB columns. Sync writes the entire blob.

---

## `thumbnail.html` — thumbnail checker

**Purpose.** Drop a YouTube long-form or Twitch thumbnail; grade it for click-through readability across every real display size.

**Who can use it.** Anyone. No sign-in, no database, no localStorage.

### Steps

1. **Drop your thumbnail** — drop-zone, thumb preview with detection overlay + toggle, key + stats, model-loading progress panel.
2. **Tell me about your character** (`stepCharacter`) — VTuber-friendly manual checklist replacing unreliable BlazeFace auto-detection. 4 checkboxes:
   - visible
   - emotion
   - big crop
   - eyes looking at camera

   Score updates live as you tick.
3. **What it looks like on YouTube** (`step2`) — mobile + desktop multi-size preview grid.
4. **The score** (`step3`) — ring out of 10 + verdict + criteria grid.
5. **What I see in your thumbnail** (`step4`) — insight grid (text OCR, faces, focal point, contrast, colors).
6. **What to fix** (`step5`) — checklist.

### Best-practices panel

VidIQ-sourced thumbnail wisdom in collapsible `.bp-card` details (Faces with emotion / Text 2-4 words max / High contrast + saturation / etc.).

### Interactive bits

- Live re-scoring as character-checklist checkboxes change.
- OCR text editing with `↺ Restore OCR` button.
- Overlay toggle hides detection boxes.

### Why the character checklist replaces auto-detection

BlazeFace doesn't reliably detect 2D VTuber model faces. Explicit design decision: ask the user instead of guessing wrong.

### Model size

~240 MB on first run (Florence-2 OCR + helpers), cached.

---

## `about.html` — about + niche list

**Purpose.** Explains the analyzer, lists every game/genre/content-type/identity tag it knows about, and provides a contact form.

**Who can use it.** Anyone. No auth.

### Sections

- Hero + back-row.
- **What it does** card with 3 overview tiles (score, hashtags, post pack).
- **How it works** card with 4 tech-grid items (Florence-2 vision ×3 frames, Whisper-base.en transcription, frame + audio analysis, typed text as tier-1 signal).
- **The 1S/2M/2L formula** card with badge pills.
- **What's in the database** card with 4 pool sections:
  - 🎮 Games (~100 entries)
  - 🎨 Genres / topics (39 entries)
  - 📋 Content types (35 entries)
  - 🐙 Creator identity (7 entries — VTuber, EN VTuber, Streamer, Clipper, LGBTQ+, Trans, POC)
- **Growth playbook callout** → growth.html.
- **Contact card** — `mailto:` form (Name, Reply-to, Niche, Message) sending to `eggieweggievt@gmail.com`.
- **Fine print** — privacy / affiliation / cost / sharing FAQ.

---

## `media-kit.html` — sponsor-facing media kit

**Shipped:** 2026-05-28
**Lives in:** `media-kit.html` (single file, ~1,400 lines)
**Migration:** `planner-sponsor-kit.sql`

**Purpose.** A one-page sponsor-facing snapshot of the creator's channel — stats, audience, niche, deliverables, rate card, past collabs — that doubles as the editor for that same kit when the creator is signed in. Edit once, share the link forever.

**Who can use it.**
- **Anyone** with the public URL (`?u=<slug>`) — provided the owner has toggled `is_public` on.
- **Owner** — full edit, visibility toggle, custom slug.
- **Manager** — full edit (RLS allows via `planner_is_manager_of`). Page detects `?manage=<delegation_id>` and switches `currentOwnerId` to the delegating creator. Mirrors the planner's [currentOwnerId pattern](#the-currentownerid-pattern).
- **Editors** — no access. (Sponsor stuff is not editor business.)

**How it works.**

UI modes (resolved from URL + session in `resolveOwnerAndLoad()`):

| URL state | Session | Result |
|---|---|---|
| `?u=<slug>` | anyone | Public view via `planner_media_kit_peek` RPC. Owner gets a "👀 Preview ↔ ✏️ Edit" toggle on top. |
| `?manage=<id>` | signed in | Manager impersonation — same edit UI but writes go to the creator's row. |
| (no params) | signed out | Welcome / magic-link sign-in card. |
| (no params) | signed in | Owner edit mode on their own kit. Bootstraps a row + slug from the user's email handle if no row exists. |

Edit-mode sections (one card per concern): Identity & branding (display name, tagline, bio, avatar/banner URLs, pronouns, location, languages) · Niche & vibe (primary/secondary niche, vibe tags, content pillars) · Channels & stats (per-platform rows with paste-URL helpers that extract handles; stats are manual; "Mark all updated now" stamps `last_stats_update_at` + every platform's `last_updated`) · Audience demographics (range sliders for age brackets + gender split, country list with code+pct, free-text top interests) · Standout content (title/url/thumbnail/views/platform/posted_at/note) · Past sponsorships (brand/type/year/results/testimonial/link) · Services & rate card (each item has a `hidden` toggle to stage a price without exposing it publicly) · Contact (email + booking link + CTA blurb).

The public view renders the same data in a sponsor-friendly layout: hero banner → identity card → about → pillars → stats grid → demographics with bar charts → top content cards → past collab list → services grid → CTA card with email + booking buttons.

Data flow: every edit writes to the in-memory `kit` object via input listeners. `saveAll()` upserts the whole row to `planner_media_kit`. `toggleVisibility()` writes only `is_public`. `saveSlug()` calls the `planner_media_kit_claim_slug` RPC (which validates + claims atomically + denies reserved slugs like `admin`, `api`, `planner`, etc.).

Storage: none — uses external URLs for images. (Future: add image upload to a public folder in `planner-files`.)

Realtime: none. Stats are manual, and the public view doesn't need to live-update.

**Gotchas / things future-you needs to remember.**
- **`is_public` controls anon read.** Until the owner toggles it on, `?u=<slug>` returns 404 even for the slug they just claimed. The edit bar shows a 🔒 Private / 🟢 Public pill so it's obvious.
- **Slug uniqueness.** The `planner_media_kit_claim_slug` RPC validates the regex + reserved list AND fails atomically on collision. The page handles a `null` return by showing "that slug is taken". Don't bypass the RPC and write to `slug` directly — the regex + reserved list won't run.
- **The `_blurb` hack.** `contact_blurb` isn't a DB column — it's stashed inside `audience_demographics._blurb` to avoid a schema migration. If you later add a column for it, update both the editor pull/push and the public renderer in `media-kit.html` AND the pitch doc template in `sponsor-pitch.html`.
- **No email normalization writes here yet.** `contact_email` is the sponsor-facing email, not used for auth — it's lowercased in `saveAll()` but doesn't flow through the editor/manager auth pipeline. If you ever wire it into RLS, mirror the [email-normalization rule](#the-email-normalization-rule).
- **Manager impersonation:** uses the same `currentOwnerId` pattern as the planner. If you add a new write path, make sure it targets `currentOwnerId` (not `currentUser.id`).
- **Print stylesheet:** `@media print` hides the auth pill, edit bar, mode toggle, and preview banner so the public view prints clean as a sponsor-ready PDF.

**Cross-references.**
- [The currentOwnerId pattern](#the-currentownerid-pattern) — manager impersonation rule.
- [Email normalization](#the-email-normalization-rule) — if you add an email field that flows into RLS.
- `planner_media_kit` data model above.

**Also update:**
- [ ] README.md "Map of the site" if URL conventions change
- [ ] `planner-sponsor-kit.sql` if you add or change columns
- [ ] The pitch doc template in `sponsor-pitch.html`'s `buildPitchDoc()` if you add new media-kit fields it should pull from

---

## `sponsor-pitch.html` — sponsor pitch builder

**Shipped:** 2026-05-28
**Lives in:** `sponsor-pitch.html` (single file, ~1,200 lines)
**Migration:** `planner-sponsor-kit.sql` (adds `planner_sponsor_pitches`)

**Purpose.** A resume-builder-style wizard that takes the creator's media kit + a few brand-specific inputs and generates a tailored pitch in five formats: cold email, Twitter DM, Discord DM, Instagram DM, one-page printable pitch doc, and a rate-card snapshot. Drafts persist; pitches are pipeline-tracked (`draft` → `sent` → `responded` → `signed` / `passed`).

**Who can use it.** Signed-in creators on their own pitches. Managers via `?manage=<id>` (same `currentOwnerId` pattern as planner).

**How it works.**

Two-column layout: **sidebar** (pitch pipeline — sticky list of all your saved pitches with status pill + brand + updated date) and **main** (the wizard).

The wizard is a 5-step `<section class="step">` flow:

1. **Brand** — pitch name, brand name, brand URL, what they sell, why they fit your audience, personal angle.
2. **Type** — pill picker over 8 sponsorship types (`product_seeding`, `paid_integration`, `affiliate`, `long_term_ambassador`, `stream_sponsor`, `gifted_collab`, `event`, `other`). Each has a one-line description that explains when to pick it.
3. **Offer** — deliverables (button-row to add common shapes: integrated short, dedicated video, stream segment, full stream, IG Reel, TikTok, tweet, affiliate, custom; each row has quantity + notes) + free-form pricing + goals (paid / free product / long-term / experience).
4. **Voice** — tone pill picker (warm / professional / playful / casual). This drives both opening greetings and closer phrasing.
5. **Send** — tabbed output panel (📧 email, 🐦 Twitter, 💬 Discord, 📸 Instagram, 📄 pitch doc, 💰 rate card) + per-channel character counters (with warn class when over) + pipeline tracker (status select + outcome notes).

Every output is `contenteditable` so the creator can rewrite anything that doesn't sound like them. The "↻ Regenerate" button at the top of step 5 overwrites edits — with a confirmation.

**Template engine.** Pure JS string interpolation in `buildEmail` / `buildTwitter` / `buildDiscord` / `buildInstagram` / `buildPitchDoc` / `buildRateCard`. Each builder calls `ctx()` which composes a "context" object from the loaded media kit + the active pitch form, with helpers like `audienceLine` (joins per-platform reach into one human-readable string), `demoLine` (writes "audience skews femme, 18-24" from the top age/gender brackets), `nicheLine`, `delivLines` (bullet-point version) / `delivInline` (comma version), and `tFrame` (sponsorship-type framing — `ask` line + `short` label used everywhere).

**Save shape.** `savePitch()` snapshots the creator's visible rate card (`mediaKit.pricing.filter(p => !p.hidden)`) into `rate_card_snapshot` so the pitch records the rates that were actually proposed — even if the creator updates their rate card later. Initial save with `status='sent'` stamps `sent_at`.

Data: reads `planner_media_kit` once at sign-in to populate template context, then CRUDs `planner_sponsor_pitches`. Realtime: none.

**Gotchas / things future-you needs to remember.**
- **Templates depend on media-kit shape.** If you rename or remove a field in `planner_media_kit` (e.g. `display_name`, `tagline`, `niche_primary`, `platforms[].platform`, `audience_demographics.age_brackets`, `pricing[].hidden`), the pitch generators will silently produce worse copy. Grep `ctx()` and the builders before refactoring the media kit shape.
- **`_blurb` again.** The pitch doc template pulls `k.contact_blurb || k.audience_demographics._blurb` for the "Next step" line, same hack as the media kit page.
- **The download-html button** writes a self-contained file with inline fonts + styles so it opens cleanly without the hub's CSS. If you change the pitch doc HTML shape, mirror the inline styles in `downloadPitchHtml()`.
- **Character counts** are updated by a global input listener filtered by element id. If you rename the output divs, update the `map` array in `updateCharCounts()` and the listener filter.
- **No editor access.** RLS denies editors entirely — there's no editor pattern to mirror.
- **Manager impersonation:** mirrors planner. All writes go through `currentOwnerId`.

**Cross-references.**
- [`media-kit.html`](#media-kithtml--sponsor-facing-media-kit) — the data source for template context.
- [The currentOwnerId pattern](#the-currentownerid-pattern) — manager impersonation.
- `planner_sponsor_pitches` data model above.

**Also update:**
- [ ] README.md "Map of the site" + jump-links if scope changes
- [ ] `planner-sponsor-kit.sql` if you add or change columns
- [ ] `media-kit.html` if you change which media-kit fields the pitch templates rely on

---

## Cross-cutting patterns

These are the rules that span multiple files. They're not in one place in the code — they're enforced by convention everywhere. Get one wrong and things break silently.

### The `currentOwnerId` pattern

In `planner.html`, when a manager impersonates a creator via `?manage=<id>`, **every data operation must target the creator's UUID, not the signed-in user's UUID.**

The rule:

| Variable | When to use |
|---|---|
| `currentOwnerId` | All planner data operations: items, editors, brand kit, stream schedule, todos, storage paths. Equals `currentUser.id` when on your own hub, OR the delegating creator's UUID when impersonating. |
| `currentUser.id` | Only where the semantics are "the signed-in user's own identity" — managing your **own** manager roster, hub-picker labelling, manager-realtime subscription filter. |

If you forget this and write a new feature that uses `currentUser.id` everywhere, the manager will see/edit their *own* (empty) data instead of the creator's. The symptom is "manager mode works but shows no items".

**Roster realtime exception.** The `planner_managers_realtime` channel filters by `currentUser.id`, **not** `currentOwnerId`, because managers don't manage *other* managers — that roster always belongs to the actual signed-in creator.

### The email-normalization rule

Emails connecting editors and managers to projects flow through three places that ALL need to agree:

1. The column (`planner_items.assignee_email` or `planner_managers.email`).
2. The client-side query filter.
3. The RLS policy (`assignee_email = auth.email()`).

Any mismatch in case or whitespace = the editor/manager silently sees "No projects yet" even though they were assigned.

**Why this is a recurring bug.** Supabase `auth.email()` is **always lowercase**. The JS save paths haven't always been lowercasing before writing. Old rows can have mixed-case emails.

**How to apply when touching this:**

1. **Writes** must `.trim().toLowerCase()` before insert — both `planner.html` `saveItem` (~line 4337) and `saveEditor` (~line 2650).
2. **Reads** should use `.ilike()` not `.eq()` for backward compat with legacy mis-cased data — see `planner-editor.html` `loadProjects`.
3. **RLS** is strict-equal on the DB side and can't be bypassed by client-side `.ilike()`. For full backward compat, either:
   - (a) **Backfill** — preferred: `update planner_items set assignee_email = lower(trim(assignee_email))`. Keeps the policy indexable.
   - (b) **Change the policy** to `lower(assignee_email) = lower(auth.email())`.
4. **Realtime `postgres_changes` filters only support `eq`, not `ilike`.** Live updates rely on data being lowercased correctly. There is no client-side workaround.

When debugging "editor can't see projects": check all three places. The chain is `planner.html save` → `assignee_email` column → editor-side query + RLS. They must all normalize consistently.

### Adding a new manager-accessible table

If you add a new table that should also be accessible to managers, add an additive RLS policy mirroring the pattern at the bottom of `planner-managers.sql`:

```sql
create policy "managers manage <table>" on public.<table>
  for all
  using (planner_is_manager_of(user_id))
  with check (planner_is_manager_of(user_id));
```

Existing owner/editor policies stay untouched — manager access is purely additive.

### Storage policy regex

The storage policy for `planner-files` regex-checks that the first path segment is a valid UUID **before** calling `planner_is_manager_of()`. This prevents non-UUID folder names from triggering unintended access. If you add a new bucket or change the folder convention, mirror this regex check.

### Brand kit visibility

The `planner_brand_kit` RLS policy lets an **editor read the brand kit of any creator who has assigned them an item**. This is intentional — editors need brand context to make on-brand cuts. If you add a new brand-related table, mirror this "editor reads if assigned to any item from this creator" pattern.

---

## Brand & visual system

Every page defines the same `:root` CSS variables. Use these — never hardcode hex values.

### Color palette

| Variable | Value | Used for |
|---|---|---|
| `--pink-hot` | `#FFB2F0` | Primary hot pink |
| `--blue` | `#63AAF4` | Accent blue |
| `--mint` | `#6BE4EA` | Accent mint/teal |
| `--pink-light` | `#FFDBF7` | Soft pink |
| `--periwinkle` | `#90A5FF` | Purple-blue accent |
| `--deep` | `#4D5BC0` | Deep indigo (headings, buttons, body links) |
| `--ink` | `#3a2a5a` | Body text |
| `--ink-soft` | `#6b5f8a` | Secondary text |
| `--white` | `#ffffff` | White |

### Editor / category palette

Used in `planner.html` editor swatches, `todo.html` categories, `habits.html` modal:

```
#FFB2F0, #FF8AA8, #FFB07A, #FFD27A, #A8E6BE, #6BE4EA,
#90A5FF, #C9A8FF, #FFB2C8, #3FB8C0, #4D5BC0, #a23556
```

### Stream-slot palette

First 8 of the above.

### Fonts

- **Pacifico** — cursive display. `.logo`, `h1/h2/h3`, tile titles. **Important:** Pacifico has long descenders + swooshes. Headings need generous `line-height` + bottom padding or the bottoms of `y` / `g` get clipped, especially with `background-clip:text`.
- **Quicksand** (400/500/600/700/800) — body, UI, buttons, inputs.
- Fallback: `system-ui, -apple-system, sans-serif`.

### Signature visual treatments

- Multi-stop radial gradient backgrounds (top-left pink → top-right mint → bottom periwinkle) on a `linear-gradient(180deg, #fef0fb, #eaf2ff, #e7fbfc)` base.
- `body::before` sparkle layer: 5-6 white radial-gradient dots scattered across the page.
- **Frosted cards:** `rgba(255,255,255,0.78-0.85)` + `backdrop-filter:blur(14px)` + soft shadow `0 8px 32px rgba(99,170,244,0.18)`.
- **Heading gradient text:** linear-gradient pink-hot → periwinkle → mint, clipped to text via `background-clip:text`.
- Pacifico headings on `border-radius:24px` (`--radius`) cards.
- **Pill-style buttons** (`border-radius:999px`) everywhere.
- Hero mascot: `hero-chibi.png` with `gentle-bob` keyframe (6 s ease-in-out).
- Octopus 🐙 = mascot signifier throughout brand voice.

### Brand asset files in the folder

- `EGGIE LOGOTYPE - BORDER.png` — wordmark
- `BADGE 1.png`, `BADGE 2.png` — favicons / badges
- `accent.png` — small octopus accent (inline in analyzer logo)
- `PATTERN 1.png`, `PATTERN 2.png` — background patterns
- `DD1.png`, `DD3.png` — additional design assets
- `preview.png` — OG / Twitter card image
- `hero-chibi.png`, `tile-analyzer.png`, `tile-growth.png`, `tile-thumbnail.png`, `tile-planner.png`, `tile-habits.png`, `tile-todo.png`, `eggie-portrait.png` — tile + portrait slots (with emoji `onerror` fallbacks)

### Brand attribution (in footers)

- Brand by [@nyxgothica](https://twitter.com/nyxgothica)
- Art by [@naniku](https://twitter.com/naniku_) (about.html only)
- Creator: [@EggieWeggieVT](https://twitter.com/EggieWeggieVT)
- Support: [ko-fi.com/eggieweggie](https://ko-fi.com/eggieweggie)
- Contact: `eggieweggievt@gmail.com`

### Voice / tone hallmarks

First-person, soft + warm, sustainability-first ("spoon theory"), 💗 sparkle ✨ octopus 🐙 cherry-blossom 🌸 motifs, em-dashes, italics for emphasis via `<em>` styled with `color:var(--deep)`. Helper text always ends with how it *feels*, not what it is ("feels magical", "stays fully offline", "no password gymnastics").

---

## Template: "add a new feature here"

Copy this whenever you ship a new feature, modal, page, or table. Paste it under the relevant page's section (or at the bottom of this file if it's brand new), fill the blanks, link to any SQL migration.

```markdown
### <Feature name>

**Shipped:** YYYY-MM-DD
**Lives in:** `<file>.html` (around `<section/modal/function name>`)
**Migration:** `<sql-file.sql>` if any, otherwise "no schema changes"

**Purpose.** One sentence — what does this do for the user?

**Who can use it.** Owner only / editors / managers / anyone signed in / anonymous.

**How it works.**
- UI: where it lives in the page, what buttons/modals it adds.
- Data: what tables/columns it reads/writes, what RLS rules apply.
- Realtime: any new channels or filters?
- Storage: any new bucket folders or path conventions?

**Gotchas / things future-you needs to remember.** If you change X, also change Y. If you forget Z, the symptom is W.

**Cross-references.** If this feature interacts with [the currentOwnerId pattern](#the-currentownerid-pattern), [email normalization](#the-email-normalization-rule), or any other cross-cutting rule, link to it here.

**Also update:**
- [ ] `README.md` "Map of the site" table (if it's a new page) or "I just want to…" jump-links (if it's a top-level user action)
- [ ] The relevant `Tables touched` section above
- [ ] Memory bookmark in your collaborator's notes if it has a silent-failure gotcha
```

### Version log

Append to this when something big ships. Keep it short — date + one-liner + which migration if any.

- **2026-05-28** — V4 Sponsor kit + pitch builder. `planner-sponsor-kit.sql`. Adds `planner_media_kit` (public-readable when toggled on) + `planner_sponsor_pitches` (owner/manager only) + two RPCs (`planner_media_kit_peek`, `planner_media_kit_claim_slug`). Two new pages: `media-kit.html` (public sponsor view + editor) and `sponsor-pitch.html` (5-step resume-builder-style wizard producing email + 3 DM variants + printable pitch doc + rate card snapshot).
- **2026-05-27** — V3.3 Open invites. `planner-managers-open-invites.sql`. Manager invite emails are now optional; blank email = any-email-can-claim link.
- **2026-05-27** — V3.2 Manager hub redux. `planner-manager-hub-v2.sql`. Per-client profiles + private notes + polymorphic comments on items/todos. Homepage now has a `👑 Manager Hub` pill button.
- **2026-05-27** — V3 Manager delegation. `planner-managers.sql`. Full co-owner delegation via email-locked invite links with the `planner_is_manager_of()` RLS helper.
- **2026-05-27** — V2.14 Email-normalization fix. Lowercased writes everywhere; `.ilike()` reads for backward compat.
