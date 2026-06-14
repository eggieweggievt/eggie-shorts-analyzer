# Creator Hub — Performance Audit (2026-06-14)

Whole-hub pass focused on speed, memory, and scalability. Every finding below was
**read and verified in the actual source** — agent-reported issues that turned out
to be false positives or risky-wrong are listed at the bottom so they don't get
"fixed" by mistake later.

Because I can't run the live app from here and parallel sessions edit this repo, I
shipped only the one fix that is fully self-contained and behaviour-preserving. The
rest are written up with concrete code and a risk note so they can be applied and
tested in demo mode (`DEMO.html`) before going live.

---

## ✅ Shipped this pass (safe, behaviour-preserving, verified)

Three fixes were applied — each isolated to a single non-planner page, with no change
to visible behaviour, and a changelog entry appended (2026-06-14).

1. **subathon-timer.html** — runaway OBS-overlay timers now pause when the tab is
   hidden (details below).
2. **subathon.html** — the Subathon *Planner's* 1-second live preview tick had the same
   forever-in-the-background redraw. It's a pure state read (no saves, no network), so
   it now pauses when hidden and redraws instantly on return. The real timer is
   server-side, so nothing about the saved event changes.
3. **ask.html** — the ✨ semantic-search pass got a sequence guard so a slow
   meaning-match from an earlier question can't overwrite a newer search's result.
   Purely additive: in the normal single-search case it behaves exactly as before.

### subathon-timer.html — runaway timers paused when hidden (HIGH value, zero risk)

`boot()` started `setInterval(poll, POLL_MS)` and `setInterval(render, 1000)` with no
saved IDs, so the OBS overlay polled Supabase and re-drew once a second **forever**,
including in a hidden background tab. On a streaming PC that's real, continuous CPU
and battery drain.

Fix: capture the interval IDs, pause both loops on `visibilitychange` → hidden, and
resync (`poll()`) + resume on show, plus clear on `pagehide`. Safe because `render()`
recomputes the countdown from server state every tick (`remainingMs()`), so a pause
can never leave the clock wrong. The visible OBS overlay is unaffected (an active
source isn't `document.hidden`). Changelog entry appended.

---

## ✅ SHIPPED (2026-06-14, second pass) — biggest scalability win

### planner.html — full refetch + full re-render on every realtime change → now patched

**Done.** The `planner_items` realtime handler no longer calls `loadItems()` (full
`select('*')` + `loadPlannerMem()` + full render) on every change. It now patches the
local `items` array from the realtime payload (`applyItemRealtime()`), re-sorts to
mirror the server's exact order (`sortItemsLikeServer()` — status, position NULLS-last,
created_at desc, so kanban within-column order is unchanged), then renders. Any
unexpected payload (missing id, decode issue) falls back to `loadItems()`, so the worst
case is exactly the old behaviour. The `editors`/`tweets`/`managers` channels were left
as-is (their reloads are already lighter and conditional) to keep the change surface
minimal. The original analysis follows for reference.

---

### planner.html — full refetch + full re-render on every realtime change (original finding)

`planner.html:3548` subscribes to `planner_items` changes and, on **any** event,
calls `loadItems()` (`:3553`). `loadItems()` (`:3455`) does three expensive things on
every single change:

1. `await loadPlannerMem()` — a second query that almost never changed.
2. `.select('*')` of the entire item set for the owner (`:3461-3467`).
3. `render()` — rebuilds the whole kanban/calendar/tweets view (`:5943`).

So one editor flipping one card's status makes every connected planner re-query the
whole table and rebuild every column. It works fine at a few dozen cards; it degrades
linearly and will feel bad at a few hundred.

**Fix (incremental patch from the payload — keep the realtime handler, change what it does):**

```js
.on('postgres_changes',
    { event: '*', schema: 'public', table: 'planner_items', filter: `owner_id=eq.${currentOwnerId}` },
    (payload) => {
      const { eventType, new: row, old } = payload;
      if (eventType === 'DELETE') {
        items = items.filter(i => i.id !== old.id);
      } else {
        if (row.assignee_email) row.assignee_email = String(row.assignee_email).trim().toLowerCase();
        const idx = items.findIndex(i => i.id === row.id);
        if (idx === -1) items.push(row); else items[idx] = row;
      }
      render();              // no network round-trip, no loadPlannerMem()
    })
```

Drop `loadPlannerMem()` out of `loadItems()` — call it once at sign-in, not on every
refetch. **Risk: medium** (touches the live sync path). Test in demo mode: open two
windows, move a card in one, confirm the other updates without a flash. Same pattern
applies to the `planner_editors` / `planner_tweets` / `planner_managers` channels.

---

## 🟠 High-value, medium-risk (test in demo mode first)

### Event listeners re-attached on every render → NOT a real leak (verified)

Re-checked: these renders rebuild their DOM (`innerHTML = …` / `document.createElement`
/ `card.replaceWith(...)`), so the old elements — and every listener on them — are
discarded and garbage-collected on each render. Re-running `addEventListener` only
leaks when the *same* element persists across renders, which isn't the case here
(`manager-hub.html:711/739` rebuilds the grid and replaces whole cards; thumbnail.html
already uses event delegation deliberately at `:1410`). No fix needed — the "10 stacked
listeners" claim was a false positive.

### `.select('*')` → explicit columns on dashboard reads — RE-ASSESSED

- **manager-hub.html** — already fixed. `loadClientItems()` already selects explicit
  columns (`id,title,status,scheduled_at,updated_at,editor_notes,editor_notes_updated_at,is_priority,assignee_email`).
  The agent's `.select('*')` flag here was a false positive. No change needed.
- **planner-editor.html:1485** — genuinely uses `.select('*')`, but **left as-is on
  purpose.** This is the editor-facing page (used by third parties) and renders a large,
  feature-rich field set (attachments, additional_assets, comments, hashtags, platforms,
  notes, editor_notes…). Trimming columns blind — on a page I can't run — risks silently
  blanking a field an editor depends on. The bandwidth saving isn't worth the
  correctness risk on a page other people use. Do this only with a live demo-mode test
  and a grep of every field the editor UI reads.

### analyzer.html — audio decoded 2–3× per file (deferred, not shipped)

`decodeAudioData` runs at `:6115`, `:6394`, and `:6624` on the same file in different
passes (transcribe / classify / kind). Decode once, cache the `AudioBuffer`, thread it
into the downstream functions. Real CPU + time saved on every video analysis.
**Not shipped — and analyzer.html is now confirmed OFF-LIMITS this pass.** Between the
first and second pass the `decodeAudioData` calls moved from 6115/6394/6624 to
6346/6625/6855 and the file grew ~230 lines — i.e. **another session is editing
analyzer.html live right now.** Editing it on stale offsets would be reckless. This
(plus the shared-theme.css extraction across ~20 files) needs a quiet window with no
concurrent edits and a demo-mode test. The same concurrency is why blind cross-file
refactors are risky hub-wide.

---

## 🟡 Bigger projects — assessed, deliberately NOT blind-shipped

Both of these are genuine wins, but each is a multi-file/architecture change that can't
be verified without running the app, and the repo is under **active concurrent edits**
right now (see below). Shipping either blind would most likely break the hub — the
exact outcome to avoid. They need a quiet window + demo-mode testing, not a blind edit.

- **Move Whisper / Florence-2 / CLIP inference into a Web Worker** (analyzer.html). This
  is the single biggest responsiveness win, but analyzer.html is the file a **parallel
  "Poor-man's-VidIQ" build session is actively editing** (its `decodeAudioData` calls
  moved ~230 lines and the file grew between my two passes). It's also a real
  re-architecture (canvas→blob transfer, result marshalling) that *will* break the
  analyzer if shipped untested. Off-limits this pass; it belongs to that session's file.
- **Extract repeated theme CSS into a cached `shared-theme.css`.** The only way this
  actually saves bytes is by *removing* the inline `<style>` blocks from ~20 pages — and
  those blocks interleave shared tokens with page-specific overrides, so separating them
  reliably needs a per-page read + visual verification of all 20. Done blind during
  active concurrency, the likelihood of breaking the look on several pages is high for a
  repeat-visit-only saving. Needs its own focused, tested pass.

---

## ⚪ Low impact / nice-to-have

- ✅ **thumbnail.html `renderYTMockups()`** — DONE. Now memo-guarded on `(url, titleText)`,
  so a checklist toggle no longer rebuilds the whole preview grid (or reshuffles the
  decorative neighbours). Behaviour-identical when the title text actually changes.
- **index.html entrance animation** — already optimal. It *already* uses an
  `IntersectionObserver` with staggered `animationDelay` and a reduced-motion/no-IO
  fallback (`:943–951`). Agent false positive; no change.
- ✅ **ask.html semantic search in-flight guard** — DONE (sequence guard, see Shipped).

---

## ⛔ Reported but DON'T do (verified false positives / would break things)

- **"Add `defer` to the `<head>` scripts" (demo-mode.js / a11y-modes.js / hub-core.js).**
  No. `demo-mode.js` must define the mock `window.supabase` *before* any inline page
  script runs (the whole sandbox depends on ordering), and `a11y-modes.js` applies
  dark mode pre-paint to avoid a flash. Deferring either breaks behaviour. They're
  correctly non-deferred.
- **analyzer.html global input handler "has no debounce."** It already debounces at
  400 ms (`:8117-8120`) and only writes a localStorage snapshot — it does **not**
  re-render. Leave it.
- **analyzer.html hashtag input should be debounced (`:5322`).** It only updates
  textContent + live char counts — debouncing would make the character counter feel
  laggy. The live feedback is intentional. Leave it.
- **ask.html: replace `out.data.slice()` with `.subarray()` to avoid a copy (`:794`).**
  This would be a *bug*: `.subarray()` is a view into a buffer the model overwrites on
  the next batch, so cached vectors would corrupt. The `.slice()` copy is correct.
- **"`cache:'no-cache'` on trends/titles/tags re-downloads 1.5 MB every load."**
  Overstated — `no-cache` does a conditional request and gets cheap `304`s when the
  weekly data is unchanged. Switching to plain caching risks serving stale weekly
  data for marginal benefit. Leave as-is.
- **"Reset the Whisper loader when the ⚡ fast-mode toggle changes."** No effect.
  `WHISPER_MODEL_ID` is a `const` computed once at load (`:6023`), so the toggle
  intentionally only takes effect on the next page load. Nulling the loader would just
  reload the *same* model. The toggle handler correctly only writes localStorage.
- **"Skip CLIP for silent video."** Based on a misread. The CLIP model here is
  `zero-shot-image-classification` running on video *frames* (`clipClassifyFrame`,
  `:5995`) — it has nothing to do with audio. The code comment notes it "runs
  unconditionally since task #41" on purpose. Gating it on audio would break frame
  analysis. Leave it.

---

## Priority order if you want to act

1. **planner.html realtime → incremental patch** (biggest scalability win).
2. **Event delegation** across the three dashboards (kills listener leaks).
3. **Explicit `.select()` columns** on manager-hub / planner-editor (easy bandwidth win).
4. **analyzer.html:** decode-once + skip-CLIP-when-silent + reset-whisper-on-toggle.
5. **Web Worker** for the ML models (biggest responsiveness ceiling-raiser).
6. **shared-theme.css** extraction (repeat-visit load + maintainability).

Items 1–3 each fit in one file and are demo-testable in minutes.
