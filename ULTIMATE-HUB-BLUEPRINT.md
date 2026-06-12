# 🐙 The Ultimate Creator Hub — page-by-page blueprint

Goal: make every page kinder to ADHD + autistic brains, and make the hub *smarter* using only free/local tech — browser ML (transformers.js, which the Optimizer already ships), the free Web Speech API, free-tier data APIs, simple statistics on your own data, and rule engines fed by Creator Memory. **Zero paid APIs.**

Legend per item: **[ADHD]** initiation/working-memory/time-blindness/dopamine · **[AUT]** predictability/literal language/sensory/social scripts · **[SMART]** local intelligence

---

## 0. Hub-wide foundations (the multipliers — do these first)

These land on every page at once via the shared layer (a11y-modes / hub-core / hub-nav / focus-widget), which is exactly why the shared-shell work mattered.

1. **[AUT] 🧘 Low-stim mode** in a11y-modes (third toggle next to 🌙 and 📖): kills all animations and gradients, hides decorative emoji/sparkles/mascot art, flattens backgrounds to one calm color, honors `prefers-reduced-motion` everywhere. One toggle, all 21 pages.
2. **[ADHD] "Jump back in" memory**: hub-core records a tiny breadcrumb on every page (`page, what, when` in localStorage). Home shows your last 3 touched things as one-click resume chips. Kills the "I opened the hub… why?" moment.
3. **[ADHD+SMART] 🎙️ Dictation everywhere**: hub-core adds a mic button to every big text field (Web Speech API — free, built into Chrome/Edge). Talking is dramatically lower-friction than typing for ADHD brain-dumps: planner notes, review answers, todo capture, pitch drafts.
4. **[AUT] 🔊 Read-aloud**: same API, other direction — `speechSynthesis` "read this section" buttons on long content (Growth Playbook, FAQ, score critiques).
5. **[ADHD] Time labels on every CTA**: a standard chip — "≈ 30 sec", "≈ 5 min" — on Analyze, Review, Debut tasks, etc. Time blindness can't budget what it can't see.
6. **[ADHD] Spoons as hub currency**: Habits already tracks energy spoon-theory style. Expose today's spoon level via localStorage (`eggie:spoonsToday`) and let To-Dos, Planner, and Home *react*: low-spoon day → surface only low-effort tasks, soften copy, suggest the 2-min versions.
7. **[SMART] 🧠 Local semantic search core**: lazy-load a MiniLM embedding model with transformers.js (same stack as the Optimizer's video ML — free, in-browser, cached). One shared module powers: Ask My Planner semantic matching, home search that survives typos and vague phrasing, planner search. This is the single biggest "smarter without paying" unlock available to you.
8. **[ADHD] Undo instead of confirm**: where it's safe, replace "Are you sure?" popups with a 10-second "Undone ↩" toast. Confirm dialogs punish impulsivity *and* spike autistic decision anxiety; undo forgives everyone.
9. **[AUT] "What happens when I click this"**: standardize hover/long-press hints on every consequential button (saves where? visible to who? reversible?). The manager/editor sharing model especially deserves explicit, literal answers.
10. **[ADHD] Body-double mode** in focus-widget: expand the timer bubble into an optional cozy co-working overlay — pixel Eggie working alongside you, ambient loop toggle, session goal pinned. Body doubling is one of the most evidence-backed ADHD aids and it's pure local assets.

---

## 1. index.html — Home

- **[ADHD] "One thing now" button**: picks exactly ONE next action (local rules: overdue planner card > today's todo > habit at streak-risk > weekly review if >7 days) and shows it alone with a Start button. Decision paralysis killer.
- **[ADHD] Resume strip** (foundation #2 surfaced here): "You were writing *Gremlin energy…* in the Planner · 2h ago → continue".
- **[AUT] Layout lock promise**: tiles never reshuffle; add a one-line "tools never move around" note in the empty search state. Predictability is a feature — say it out loud.
- **[SMART] Local morning brief**: a small card computed from your own data at load — due this week, habit streak status, days since last review, pitch follow-ups due. Pure queries, no AI framing: "Your week at a glance."
- **[SMART] Typo-tolerant search**: Levenshtein fallback when exact/keyword match fails (later upgraded by foundation #7).

## 2. analyzer.html — Optimizer

- **[ADHD] Draft autosave**: persist the card's inputs to localStorage on every keystroke; restore on return. Tab-away amnesia protection for the tool you most often leave mid-thought.
- **[ADHD] ⭐ "Eggie's pick"**: badge ONE suggested title as the default choice instead of presenting 4 equals. Choices are work; defaults are kind.
- **[AUT] Literal score language**: each factor's chip gets an expandable "what this means · why it matters · what to change" in plain words (the data already exists in `passes[]` — surface it).
- **[AUT] Sensory-safe results**: low-stim mode skips the score-ring animation and renders the number instantly.
- **[SMART] Close the learning loop**: you already store runs, title ratings, tag ratings, and real view counts. After ~10 logged runs, compute locally which template families/tags correlate with YOUR above-median videos and quietly boost them in suggestions ("template weights" column already exists in prefs!). This makes the Optimizer genuinely personal — no API, just your own history.
- **[SMART] Dictate the "what's it about" field** (foundation #3 — this field first).

## 3. planner.html — Content Planner

- **[ADHD] Focus-one-card mode**: click 🎯 on a card → board dims to 20%, that card enlarges with its micro-next-step. One thing exists.
- **[ADHD] "Very next action" field** on cards: a one-line "the literal next physical step" (e.g. "trim first 3 sec") shown on the card face. Vague titles block initiation; next-actions start it.
- **[ADHD] Stale-card whisper**: cards untouched 14+ days get a soft 🌫 chip and a "still alive? → keep / archive / break it smaller" mini-menu. Out of sight is out of mind — resurface kindly.
- **[ADHD] Gentle WIP limit**: >5 cards in Editing → soft banner "that's a lot of plates 🍽 — want to pick one to finish first?" Never blocks, only nudges.
- **[AUT] Status glossary**: a ⓘ on the column headers explaining exactly what each status means and *who sees what* at each stage (especially editing → edited handoff).
- **[AUT] Relative + absolute dates together**: "📅 Jun 15 · in 3 days" everywhere a date renders.
- **[SMART] Your velocity stats**: median days idea→posted, your most-finished content type, posting-day performance (posted_at × analyzer view logs) — a small "📈 your patterns" panel, all local arithmetic.

## 4. planner-editor.html — Editor dashboard

- **[ADHD] "Start here" sort**: auto-badge the single most urgent card (deadline + priority + handed-over-first). Editors get decision relief too.
- **[AUT] Handoff contract box**: literal text on each card: "When you click *Mark as edited*: status changes, Eggie gets it back, you keep download access."
- **[SMART] File metadata before download**: show size (you store it) + "≈ download time" so 4GB surprises stop; add "download all files for this card" sequential helper.
- **[ADHD] Per-card mini-checklist** (cut / color / captions / export) persisted per editor in localStorage.

## 5. todo.html — To-Do List

- **[ADHD] Brain-dump → triage**: a rapid-entry box (Enter, Enter, Enter…) into an Unsorted pile, then a "Triage (2 min)" mode showing ONE item at a time with four big buttons: Today / Later / Someday / Drop. Single-item decisions beat list paralysis.
- **[ADHD] Spoon tags + filter**: tag tasks 🥄 low / 🥄🥄 med / 🥄🥄🥄 high; one tap shows only what today's energy can afford (reads foundation #6).
- **[ADHD] Tonight-pick-tomorrow**: evening prompt "pick tomorrow's FIRST task" — morning starts with zero decisions.
- **[AUT] Routine templates**: saveable checklists ("stream-day setup", "upload ritual") instantiated with one click, items in fixed order every time.
- **[ADHD] Capacity honesty**: optional minutes-estimate per task; today's plan shows "you've planned 6h of tasks" against a realistic cap.
- **[SMART] Focus analytics**: from your stored focus sessions — your best focus hour, average session, completion rate by time of day. "You finish 2× more before noon" is local math, not magic.

## 6. habits.html — Sustainable Habits (already the ND crown jewel)

- **[ADHD] Streak freezes**: explicit sick/away freeze tokens so a bad week never deletes a month of wins. Streak loss is the #1 reason ADHD folks abandon trackers.
- **[ADHD] 2-minute fallback** per habit: define a "minimum honest version" (open the canvas counts). Logging the tiny version keeps the chain.
- **[AUT] Celebration choices**: confetti / a quiet ✓ / plain text — sensory preference per user.
- **[SMART] Gentle pattern hints**: simple co-occurrence on your own logs — "weeks with 3+ art sessions are usually your highest-energy weeks." Carefully worded, observational only.

## 7. review.html — Weekly Review

- **[ADHD] One-question-at-a-time mode**: each prompt on its own screen with a Next button; progress dots; ~10-min optional timer with a soft "2 minutes left" transition warning.
- **[AUT] Identical questions every week**, stated explicitly ("same five questions, every time, nothing is graded").
- **[ADHD] Voice answers** (foundation #3) — reviews are where dictation shines most.
- **[SMART] Trends from your own words**: per-week word count, answered-streak, and a "compare to last month" line pulled from your stored reviews. It already prefills what shipped; add "what you said last week" beside each question for continuity.

## 8. ask.html — Ask My Planner

- **[SMART] Semantic matching** (foundation #7's flagship): embed items + question locally; "that spooky collab thing" finds the Phasmophobia card even with zero keyword overlap. Cache item embeddings in IndexedDB, re-embed only changed items.
- **[AUT] Explain the match**: highlight which words/concepts matched per result — no black-box answers.
- **[ADHD] Recent questions as chips** — re-ask in one tap; answer rendered first, evidence collapsed under it.

## 9. growth.html — Growth Playbook

- **[ADHD] Read-state**: per-section checkboxes + auto "resume where you stopped" bookmark + ≈reading-time per section. Long docs need progress feel.
- **[ADHD] TL;DR boxes**: 2-line summary atop each chapter (you write once; readers in a hurry survive).
- **[AUT] Inline glossary**: dotted-underline jargon with literal popover definitions (local dictionary of ~50 creator terms).
- **[AUT+ADHD] Read-aloud per section** (foundation #4).

## 10. thumbnail.html — Thumbnail Checker

- **[ADHD] A/B mode**: upload two, see them side-by-side at feed sizes with both scores — turns an agonizing choice into a visible one.
- **[AUT] Thresholds in the open**: "contrast 4.2 — pass needs 4.5" style literal pass/fail lines.
- **[SMART] Title-match check**: reuse the Optimizer's in-browser CLIP to score "does this thumbnail show what the title promises?" — a genuinely advanced feature, fully local.
- **[SMART] Colorblind + small-size preview filters** (canvas/CSS only).

## 11. finance.html — Finance & Tax

- **[ADHD] Receipt inbox**: dump "$43 mic arm" now, categorize later in a one-at-a-time triage (same pattern as To-Dos — consistency across the hub is itself an autism feature).
- **[ADHD] Recurring templates + due nudges**: subs/software auto-suggest monthly; upcoming dues surface on Home's brief.
- **[AUT] Plain-language category explainers**: literal "what counts as this / what doesn't" per tax category.
- **[SMART] Keyword auto-categorizer**: learn from your past categorizations ("Adobe→Software") and pre-fill; CSV import for bank exports, all client-side.

## 12. brand-memory.html — Creator Memory

- **[ADHD] One-field-at-a-time completion**: progress ring + "next most useful empty field" suggestion instead of a wall of blanks.
- **[AUT] "Used by" map per field**: literal list under each field — "voice tone → Optimizer scoring, Pitch builder, tag flavor." Knowing where data goes builds trust.
- **[SMART] Voice checker**: paste any caption → local check against your always/never words, tone adjectives, signature phrases; flags "never-word: 'epic'" instantly. Your style guide becomes enforceable, no AI needed.

## 13. media-kit.html — Media Kit

- **[ADHD] "Good enough to send" meter**: completeness % with an explicit threshold message — perfectionism is an ADHD shipping-blocker; the tool should say "this is sendable."
- **[AUT] Exact-preview promise**: a "view exactly as sponsors see it" button (public render, same pixels).
- **[SMART] Channel snapshot via free YouTube Data API**: like the OS's "Pull @eggieweggievt" — subs/views/recent uploads auto-filled using the free quota (your own API key, $0). Optional per-user.

## 14. sponsor-pitch.html — Pitch Builder

- **[ADHD] Follow-up radar**: status='sent' + 7 days + no response logged → a "time for the gentle follow-up" chip with the template pre-loaded. Object permanence for deals.
- **[AUT] More social scripts** (this page is already a masking-relief tool — lean in): decline politely, raise your rate, "I don't understand this contract clause — ask for clarification", ghosting re-engage, scope-creep pushback. Scripts are autistic gold.
- **[SMART] Your deal benchmarks**: median deal value by type from your logged pitches — "your average sponsor segment: $X" — local stats once you've logged a few.

## 15. manager-hub.html + manager-claim.html

- **[AUT] Permission matrix**: a literal table on both pages — "Your manager CAN: edit planner, see finance. CANNOT: send pitches as you, see personal habits." Removes the ambient anxiety of shared access.
- **[ADHD] Delegation health chips**: "manager last active 12d ago" so dormant access is visible.

## 16. debut-checklist.html

- **[ADHD] "Today's 3"**: auto-pick three tasks from deadline + dependency order; everything else collapsed. Also per-task ≈time chips.
- **[AUT] Dependencies made explicit**: "blocked by: model rig" badges instead of implied ordering; per-item "what done means" criteria.
- **[ADHD] Partial-progress celebration**: percentage ticks up on ANY check — debut prep is a months-long motivation marathon.

## 17. niche-quiz.html

- **[ADHD] Resume mid-quiz** (localStorage) + "skip, decide later" per question.
- **[AUT] Escape the binary**: "both / neither / depends" options where honest — forced choices are autistic kryptonite and they corrupt your data anyway.

## 18. subathon.html + subathon-timer.html

- **[ADHD] Prep pacing mode**: spread the prep checklist across the days remaining ("3 small things today") instead of one wall.
- **[AUT] Transition warnings on the OBS timer**: visual shift at T−10min and T−2min (color ease, no flash) — transitions hurt less when announced. Also a "schedule block ending soon" cue tied to the day plan.
- **[ADHD] Built-in body budget**: meal/water/stretch blocks as first-class schedule slot types with their own goal counter ("3 breaks today 💧").

## 19. faq.html / changelog.html / DEMO.html

- **[AUT] Changelog "coming soon" section**: list UI changes *before* they ship — surprise interface changes are genuinely distressing; a preview turns dread into anticipation. (The changelog itself is already an autism-friendly feature — this completes it.)
- **[AUT] FAQ anchored TOC** with literal questions as written by real users.
- **[ADHD] DEMO stays the consequence-free playground** — add a "try the demo first" hint on complex tools' empty states; rehearsal lowers initiation anxiety.

---

## 🎯 Where I'd start (impact ÷ effort)

| # | What | Pages touched | Why first |
|---|------|---------------|-----------|
| 1 | 🧘 Low-stim mode (a11y V2) | all | One toggle, every page, both ADHD + autism |
| 2 | Jump-back-in breadcrumbs + One-thing-now | hub-core + home | Kills re-entry friction hub-wide |
| 3 | 🎙️ Dictation buttons | hub-core → all textareas | Free API, massive capture unlock |
| 4 | Planner next-action field + stale-card whisper | planner | Your most-used tool, initiation + object permanence |
| 5 | To-Do brain-dump → one-at-a-time triage | todo | The signature ADHD flow |
| 6 | Streak freezes + 2-min fallbacks | habits | Stops the #1 tracker-abandonment cause |
| 7 | Semantic search core (transformers.js) | ask + home + planner | The "smartest" free upgrade that exists |
| 8 | Optimizer learning loop from your runs | analyzer | Data's already collected — just close the loop |
| 9 | Social scripts pack | sponsor-pitch | Pure content, pure relief |
| 10 | Changelog "coming soon" | changelog | Tiny effort, big trust |

**Already strong, keep as-is:** spoon-theory habits, demo sandbox, dyslexia + dark modes, the one-card Optimizer, paste-friendly planner modal, editor handoff stages, quick-capture, the changelog itself.

*Everything above runs on: localStorage/IndexedDB, your existing Supabase data, transformers.js in-browser models, Web Speech API, Datamuse, and optional free-quota YouTube Data API. Nothing paid, nothing leaves the browser that doesn't already.*
