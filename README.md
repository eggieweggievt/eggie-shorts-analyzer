# Eggie's Creator Hub 🐙

> **Live at:** [creatorhub.eggieweggie.ca](https://creatorhub.eggieweggie.ca)
> A planner, analyzer, todo list, growth playbook, and habit tracker — all under one roof, all in your browser.

This README is the friendly entry point. If you want the deep-dive (every feature, every modal, every database table, every quirk), open [**HUB-FEATURES.md**](./HUB-FEATURES.md) — it's the engineering-level reference.

---

## 🐣 Confused? Start here.

You can be three different kinds of person on this site. Pick yours.

### 1. Which one are you?

| If you are… | Go to… | TL;DR |
|---|---|---|
| 👑 **Eggie** (the creator, this is your hub) | [planner.html](./planner.html) | Your main workspace. Plan videos, invite editors, hand off the whole hub to a manager when you're away. |
| 🎬 **An editor** Eggie added to a project | [planner-editor.html](./planner-editor.html) | Your dashboard. Shows only the projects assigned to your email. Read the brief, grab the footage, drop the cut, mark it done. |
| 👑 **A manager** with an invite link | Click the invite link (it goes to [manager-claim.html](./manager-claim.html)) → then [manager-hub.html](./manager-hub.html) | You get full co-owner access to someone else's hub, revocable any time. Manager-hub lists every creator who's delegated to you. |
| 🔓 **Just curious / a visitor** | [index.html](./index.html) | The homepage. Six free tools, no sign-in needed for most of them. |

### 2. What even is this thing? (60-second tour)

Eggie's Creator Hub is a collection of small browser tools stitched together with a shared Supabase backend. The pieces:

- A **content planner** with kanban, list, and calendar views, plus an embedded todo widget, a teleprompter, a brand kit, and a stream schedule.
- A **shorts analyzer** that scores a video out of 100 using on-device ML (vision + speech + audio + semantic matching).
- A **thumbnail checker** that grades thumbnails for click-through across every YouTube/Twitch size.
- A **todo list** with recurring tasks, subtasks, a focus timer, and a daily review.
- A **habits tracker** that uses spoon-theory energy levels and pauses streaks instead of resetting them.
- A **growth playbook** — the master long-form reference behind everything the analyzer scores.

Sign-in is by **magic link** (email-based, no passwords). Most of the tools work without signing in; sign-in is the thing that gives you persistence and sharing.

### 3. "I just want to…" jump-links

- **…add a video to my plan** → open [planner.html](./planner.html), sign in, click `+ New item`. ([deep-dive](./HUB-FEATURES.md#planner-item-modal))
- **…invite an editor** → in planner.html, click `👥 Editors` → fill the form → copy the link → send it. ([deep-dive](./HUB-FEATURES.md#inviting-an-editor))
- **…hand my whole hub over to someone** → in planner.html, click `👑 Managers` → generate a locked or open invite → send the link. ([deep-dive](./HUB-FEATURES.md#inviting-a-manager))
- **…claim an invite link someone sent me** → click the link. It lands on [manager-claim.html](./manager-claim.html), prompts a magic-link sign-in, and drops you into the hub. ([deep-dive](./HUB-FEATURES.md#manager-claim-flow))
- **…check what I'm running for other people** → [manager-hub.html](./manager-hub.html). Lists every creator who's delegated to you, with status counts and "what needs attention" cards.
- **…score a short** → [analyzer.html](./analyzer.html). Drop the file in. Wait once (~310 MB of models download the first time, then cached). Done.
- **…grade a thumbnail** → [thumbnail.html](./thumbnail.html). Drop it in, tick the character checklist, read the score.
- **…look up "what's actually the rule for X?"** → [growth.html](./growth.html), then pick a chapter.
- **…track my habits sustainably** → [habits.html](./habits.html). Set your energy mode for the day; only habits that fit show up.
- **…manage tasks separately from the planner** → [todo.html](./todo.html). Linked to planner items via a search picker.
- **…build a sponsor-facing media kit I can share** → [media-kit.html](./media-kit.html). Public shareable URL, manual stats with paste-URL helpers, rate card, audience demographics. ([deep-dive](./HUB-FEATURES.md#media-kithtml--sponsor-facing-media-kit))
- **…draft a pitch to a brand without staring at a blank page** → [sponsor-pitch.html](./sponsor-pitch.html). Step-by-step wizard generates an email, DMs for Twitter/Discord/IG, a printable pitch doc, and a rate card snapshot — all editable. ([deep-dive](./HUB-FEATURES.md#sponsor-pitchhtml--sponsor-pitch-builder))

---

## 🗺️ Map of the site

Twelve pages (eleven HTML + one set of SQL migrations). Each one has a one-liner here; deeper docs live in [HUB-FEATURES.md](./HUB-FEATURES.md).

### Public pages (no sign-in needed)

| Page | What it does |
|---|---|
| [`index.html`](./index.html) | Hub homepage. Tile grid linking to every tool. Shows a welcome card + habits widget when signed in. |
| [`analyzer.html`](./analyzer.html) | Shorts analyzer. Upload a video → score + critique + hashtags + ready-to-paste post pack. Sign-in optional. |
| [`thumbnail.html`](./thumbnail.html) | Thumbnail checker. Drop a thumb → multi-size preview + score + fix list. No sign-in. |
| [`growth.html`](./growth.html) | Long-form growth playbook. 18 chapters of VTuber/streamer growth rules. No sign-in. |
| [`habits.html`](./habits.html) | Spoon-theory habit tracker. Works locally; sign-in syncs across devices. |
| [`about.html`](./about.html) | What the analyzer knows about (game/genre/identity database) + contact form. |
| [`media-kit.html?u=<slug>`](./media-kit.html) | A creator's public sponsor-facing media kit. Anonymous read when the owner has toggled it public. |

### Tools that need sign-in

| Page | What it does | Who can use it |
|---|---|---|
| [`planner.html`](./planner.html) | The main content planner. Kanban / list / calendar, modals for items, editors, managers, brand kit, stream schedule, teleprompter. | Creator (Eggie). Managers via `?manage=<id>`. |
| [`planner-editor.html`](./planner-editor.html) | Editor dashboard. Shows only projects assigned to the signed-in email. Brand kit visible. | Editors. |
| [`manager-hub.html`](./manager-hub.html) | Universal manager dashboard. Lists every creator who's delegated to you, with status counts + per-client notes. | Anyone with an active manager delegation. |
| [`manager-claim.html`](./manager-claim.html) | Invite-claim landing page. Reads `?token=…`, prompts sign-in, claims the invite. | Anyone with the link. |
| [`todo.html`](./todo.html) | Customizable todo list with recurring tasks, focus timer, daily review, planner-item linking. | Creator. Managers too. |
| [`media-kit.html`](./media-kit.html) | Edit mode for the public media kit (no `?u=` param). Identity, niche, stats, audience, content, past collabs, services + pricing. Visibility toggle + custom slug. | Creator. Managers too. |
| [`sponsor-pitch.html`](./sponsor-pitch.html) | Resume-builder-style pitch composer. 5-step wizard → email + 3 DM variants + printable pitch doc + rate-card snapshot. Pipeline-tracked. | Creator. Managers too. |

### Database migrations (SQL files — run in Supabase)

| File | What it sets up | Run order |
|---|---|---|
| [`planner-supabase-v2.sql`](./planner-supabase-v2.sql) | Core planner: items, editors, brand kit, storage bucket. | 1st |
| [`planner-supabase-todos.sql`](./planner-supabase-todos.sql) | Todos, categories, focus sessions. | 2nd |
| [`planner-managers.sql`](./planner-managers.sql) | Manager delegation: roster, RPCs, RLS helper. | 3rd |
| [`planner-managers-open-invites.sql`](./planner-managers-open-invites.sql) | Lets manager invites be "open" (any email can claim). | 4th |
| [`planner-manager-hub-v2.sql`](./planner-manager-hub-v2.sql) | Per-manager client profiles + polymorphic comments. | 5th |
| [`planner-sponsor-kit.sql`](./planner-sponsor-kit.sql) | Media kit (public-readable) + sponsor pitches + slug RPCs + all V4.1 fields (aggregate stats, cadence, stream schedule, content rating, active partnerships, group, management clients, merch, Discord, creator collabs). One idempotent file. | 6th |
| [`habits-supabase.sql`](./habits-supabase.sql) | Habit-state sync table (standalone). | any time |
| [`analyzer-supabase.sql`](./analyzer-supabase.sql) | Analyzer preferences, saved runs, ratings, trends cache. | any time |

All migrations are **idempotent** — safe to re-run.

---

## 🚀 The four things you'll do most often

### A. Plan a new video

1. Open [planner.html](./planner.html), sign in.
2. Click `+ New item`.
3. Fill in title, status, platforms, deadline. Add a hook, paste a script, attach a thumbnail URL.
4. If an editor is doing the cut, pick them from the **Editor** dropdown. They'll see it next time they sign in.
5. Save. The card lands in the kanban column you picked.

### B. Hand a project off to an editor

1. In planner.html, click `👥 Editors`.
2. Add the editor's name + email (lowercase happens automatically — see [the email-normalization quirk](./HUB-FEATURES.md#the-email-normalization-rule)).
3. Hit save. You get a personalized invite link with `?name=…` in it.
4. Send it. They sign in with magic link, see only what's assigned to their email, and can move items between Recording / Editing / Scheduled.

### C. Hand the **entire hub** off to a manager

When you're away and someone needs to run the whole show:

1. In planner.html, click `👑 Managers`.
2. Optionally lock the invite to a specific email (leave the email blank to make it an open link — anyone signed in can claim).
3. Generate the link, send it.
4. They visit it → sign in → claim → land in planner.html operating as you. A pink "🟣 Managing <your-email>" banner stays at the top so they don't forget whose hub they're in.
5. Revoke any time from the Managers modal. They lose access immediately.

### D. Score a short before posting

1. Open [analyzer.html](./analyzer.html).
2. Drop the video file in. First run downloads the ML models (~310 MB, cached after).
3. Pick the short-type pills that fit; optionally paste your title/description/hashtags.
4. Click `🐙 Analyze my short`.
5. Read the score, copy the post pack, ship.

---

## 🛠️ How to keep these docs alive

When you add a new page, modal, or feature, both files need a small update so they stay accurate. The flow:

1. **This file (`README.md`):** add a one-liner in the right "Map of the site" table. If it's a brand-new top-level concept, also add it to the "Confused start" jump-links.
2. **`HUB-FEATURES.md`:** add a full per-feature section at the bottom of the matching page's deep-dive, using the **"Add a new feature here" template** at the very bottom of that file. Copy the template, fill the blanks, link to any new SQL migration.
3. **If you added a SQL migration:** add it to the table in this file (in run order) AND to the data-model section in `HUB-FEATURES.md`.
4. **Memory bookmarks:** if the new feature has a "if you forget this, things break silently" gotcha (like the [email normalization](./HUB-FEATURES.md#the-email-normalization-rule) one), capture it in the deep-dive's **Cross-cutting patterns** section so future-you can find it.

The deep-dive is designed to be appended to — each page has its own section, and the template at the bottom gives you the exact headings to copy.

---

## 🎨 Branding (so new pages match)

These are the design tokens every page uses:

| Token | Value | Used for |
|---|---|---|
| `--pink-hot` | `#FFB2F0` | Primary hot pink |
| `--blue` | `#63AAF4` | Accent blue |
| `--mint` | `#6BE4EA` | Accent mint |
| `--pink-light` | `#FFDBF7` | Soft pink |
| `--periwinkle` | `#90A5FF` | Purple-blue |
| `--deep` | `#4D5BC0` | Deep indigo (headings, body links) |
| `--ink` | `#3a2a5a` | Body text |
| `--ink-soft` | `#6b5f8a` | Secondary text |
| `--radius` | `24px` | Card corner radius |

**Fonts:** Pacifico for headings (display, cursive), Quicksand for body/UI.
**Mascot:** 🐙 octopus + 🌸 cherry blossoms.
**Voice:** First-person, warm, sustainability-first. Em-dashes instead of semicolons.

Full brand reference in [HUB-FEATURES.md → Brand & visual system](./HUB-FEATURES.md#brand--visual-system).

---

## 💗 Credits

- Creator: [@EggieWeggieVT](https://twitter.com/EggieWeggieVT)
- Brand by [@nyxgothica](https://twitter.com/nyxgothica)
- Art by [@naniku](https://twitter.com/naniku_)
- Support: [ko-fi.com/eggieweggie](https://ko-fi.com/eggieweggie)
- Contact: `eggieweggievt@gmail.com`
