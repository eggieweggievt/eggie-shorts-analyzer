# ☀️ Morning report — the overnight ND build (2026-06-12)

Good morning! Here's everything that happened while you rested. **Nothing is live until you test in DEMO.html and push.** One SQL file to run (details at the bottom).

---

## ✅ Shipped tonight

**Hub-wide foundations**
- 🧘 **Low-stim mode** + 🟡 soft tint live in a11y-modes v5 (your wave landed the engine; I bumped every page to load it, so the toggles now actually appear hub-wide). OS-level "reduce motion" is respected even with the toggle off.
- 🎙️ **Dictation mics** auto-appear on every big textarea (hub-core v2, browser speech recognition — free, on-device). 🔊 read-aloud + 🧵 breadcrumbs + 🥄 spoons APIs wired in too.
- All pages bumped to `a11y-modes.js?v=5` + `hub-core.js?v=2`; service worker cache → v2.

**Home** — 🧵 *Jump back in* (last 3 places you touched, works signed-out) + 🎯 *One thing now* (ONE suggested action from overdue cards → starred todos → due-soon → review gap, with an "↻ another" veto button). Both vanish when there's nothing useful to say.

**Planner** — `▸ very next action` field on every card (modal + card face + editor dashboard); 🌫 stale-card whisper at 14+ quiet days; gentle WIP nudge above 5 mid-production cards (once a day, auto-dismisses); status-column tooltips with literal "what this means / who sees it" definitions; dates everywhere now show *"Jun 15 · in 3d"*.

**To-Do** — 🧠 **Brain dump → triage**: rapid Enter-Enter-Enter capture (each line saves instantly to Someday tagged 🧠 inbox, so closing mid-dump loses nothing), then one-task-at-a-time sorting with four big buttons + ⭐ + skip. Plus the 🥄 low-spoon banner when Habits says today is a low-energy day.

**Habits** — your 🌙/🌤/🌞 energy picker now broadcasts spoons hub-wide (today-only, never leaks into tomorrow). Streak-pausing already existed (you built it kind from day one).

**Weekly Review** — 🪷 *one question at a time* mode: same nine questions, one screen each, progress dots, remembered preference. Plus an explicit "same questions every week, nothing is graded" promise in the copy.

**Optimizer** — draft autosave (tab-away amnesia protection, planner hand-offs always win, Clear all wipes it) + ⭐ *Eggie's pick* badge on the top title suggestion for low-decision days.

**Manager Hub** — a literal CAN / CANNOT permission table (collapsible, above the dashboard).
**Creator Memory** — "where this flows" map: exactly which tools read the profile, and who can't.
**Changelog** — 🔭 *Coming soon* card: list UI changes in `changelog.json → upcoming` BEFORE shipping them; big entry for tonight added.

**Found already done** (a parallel wave beat me to these — they're good): sponsor-pitch follow-up radar + 🧰 social scripts pack, hub-core v2 itself, a11y v5 engine.

---

## ⏳ Deliberately deferred (with reasons)

| What | Why deferred | Effort when ready |
|---|---|---|
| 🧠 Semantic search (transformers.js) in Ask | ~25MB one-time model download deserves an opt-in UX decision from you, and blind-shipping in-browser ML at 4am felt wrong | medium — design is in the blueprint |
| Habits 2-min fallback per habit | needs a semantics call: does the tiny version count toward streaks/targets or log separately? | small once decided |
| Thumbnail A/B compare | canvas work worth doing awake | medium |
| Finance receipt inbox/triage | reuses the To-Do triage pattern — clean to copy now that it exists | small-medium |
| Growth read-state/bookmarks, niche-quiz resume, subathon timer T-10 warning, media-kit sendable meter | each small; ran the night down to the wire | small each |
| Body-double cozy overlay | pure delight feature, wanted your art direction | medium |

These three are also listed on the public 🔭 Coming soon card (search, A/B, media-kit meter) — move them into a real entry when they ship.

---

## 🌅 Your morning checklist

1. **Run `planner-2026-06-12-nd-upgrade.sql`** in Supabase (adds `planner_items.next_action` — one line, safe to re-run). The planner degrades gracefully until then (strips the field on save, like the V2 columns).
2. Still pending from earlier waves, if you haven't run them: `planner-2026-06-10-audit-fixes.sql` and `planner-2026-06-12-editor-storage-fix.sql` (the editor-downloads fix!).
3. **DEMO.html sweep** — the fun part: toggle 🧘 on any page → visit Home (do a couple of tool visits first to seed crumbs) → To-Do 🧠 Brain dump → planner card's ▸ next action → Review 🪷 → Optimizer: type something, close the tab, reopen → set Habits to 🌙 low and open To-Dos.
4. Push, then hard-refresh once (the service worker cache bumped to v2).

Sleep was productive. 🐙
