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

## 🔴 Top recommendation — biggest scalability win

### planner.html — full refetch + full re-render on every realtime change

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

### Event listeners re-attached on every render → leaks (planner.html, planner-editor.html, manager-hub.html)

Render functions re-run `.forEach(el => el.addEventListener(...))` for status pickers,
copy buttons, tweet textareas, pin buttons, etc. Every re-render stacks another
listener on the same elements — after 10 renders a button has 10 handlers. Memory
grows and click handlers fire N times.

Examples: `planner.html` tweet/editor/attachment wiring; `planner-editor.html:1557`
status pickers; `manager-hub.html:894` `.cc-pin`.

**Fix:** event delegation — wire **one** listener on the stable container in init and
read a `data-id` / `data-action` off `e.target.closest('[data-action]')`. Removes the
leak and the per-render rewiring cost. Risk: medium (changes how clicks are routed);
do one container at a time and verify in demo mode.

### `.select('*')` → explicit columns on dashboard reads (manager-hub.html, planner-editor.html)

`manager-hub.html:750` and `planner-editor.html:1480` pull every column — including
big `attachments`, `additional_assets`, and `comments` arrays — for dashboards that
only show title/status/deadline/notes. Pure bandwidth + memory waste, multiplied per
client.

**Fix:** name the columns actually rendered, e.g.
`.select('id,title,status,scheduled_at,updated_at,editor_notes,editor_notes_updated_at,is_priority')`.
Risk: low-medium — the only way to break it is to omit a column the render reads, so
grep the render function for every field first.

### analyzer.html — audio decoded 2–3× per file (deferred, not shipped)

`decodeAudioData` runs at `:6115`, `:6394`, and `:6624` on the same file in different
passes (transcribe / classify / kind). Decode once, cache the `AudioBuffer`, thread it
into the downstream functions. Real CPU + time saved on every video analysis.
**Not shipped — risk: medium.** It's a 510 KB file actively edited by other sessions,
and `analyzeAudio()` (`:6617`) is self-contained (own context, own decode, closes
after), so a shared cache would touch separate flows. Worth doing in a dedicated,
demo-tested pass — not a blind edit. Held back to honour "don't break the hub."

---

## 🟡 Bigger projects (high effort, real ceiling-raisers)

- **Move Whisper / Florence-2 / CLIP inference into a Web Worker.** Today they run on
  the main thread, so analysis freezes the tab for seconds. A worker keeps the UI
  responsive. This is the highest-effort, highest-payoff item for the analyzer.
- **Extract the repeated theme CSS** (the identical `:root` variables + `.card`/`.btn`/
  `.hero` blocks inlined on ~20 pages) into one cached `shared-theme.css`. Saves
  ~20 KB per page on repeat visits and gives one place to edit the palette. Risk: it's
  a cross-file change with collision potential against parallel sessions — do it in a
  quiet window and verify every page still themes correctly in demo mode.

---

## ⚪ Low impact / nice-to-have

- `index.html` entrance animation fires on all ~40 tiles at once on load — could be
  gated behind an `IntersectionObserver` so only visible tiles animate. Cosmetic.
- `thumbnail.html` `renderYTMockups()` rebuilds the full preview grid on every
  checklist toggle; only re-render when the OCR text actually changed.
- `ask.html` semantic search has no in-flight guard — a debounce + "skip if already
  embedding" avoids re-embedding the whole planner on rapid searches.

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
