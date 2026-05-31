# Smart Search ("Ask my planner") — setup

This is the hub's first AI feature. It adds a tiny backend — **one Supabase Edge
Function** that lives inside your *existing* Supabase project (no new host, no API
key in the browser) — plus a client page, `ask.html`.

The page asks a question → the function reads your planner items (under your own
RLS, so it only ever sees your data) → Claude ranks the relevant ones → you get a
short answer plus the matching cards.

---

## What you need once

- The **Supabase CLI** installed (`npm i -g supabase`, or `brew install supabase/tap/supabase`).
- An **Anthropic API key** from <https://console.anthropic.com> (pay-as-you-go; this feature costs fractions of a cent per question).
- Your project ref: `okrheyotpypulweedhda`.

---

## Deploy (about 5 minutes)

```bash
# from the eggie-shorts-analyzer folder (it now has a supabase/functions/ dir)
supabase login
supabase link --project-ref okrheyotpypulweedhda

# store your Anthropic key as a function secret — never in the page
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
# optional: pin a model (defaults to claude-sonnet-4-6)
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-4-6

# ship it
supabase functions deploy planner-smart-search
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected into the function
automatically — you do **not** set those yourself.

---

## Test it

1. Open `ask.html` on the deployed hub (magic-link sign in).
2. Ask something like *"what should I film this week?"* or *"which shorts are stuck in editing?"*
3. You should get a one-line answer plus the matching planner cards.

Quick CLI smoke test (replace `<JWT>` with a logged-in access token from the
browser devtools → Application → Local Storage → the `sb-…-auth-token` value):

```bash
curl -i -X POST \
  "https://okrheyotpypulweedhda.functions.supabase.co/planner-smart-search" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"question":"what should I film this week?"}'
```

---

## The rules baked in

- **RLS, not service-role.** The function reuses *your* login token, so it can
  only read items you're already allowed to read. Managers work automatically
  (the page passes the creator's `manageOwnerId`; `planner_is_manager_of` lets it through).
- **Never on page load.** The AI only runs when you click *Ask* — exactly the
  budget-safety rule from the Personal-OS guide. Idle dashboards cost nothing.
- **Archived items are skipped**, and only ~300 items are sent, trimmed to short
  fields, to keep each call cheap.

---

## Cost

A typical question sends a few thousand tokens and returns a few hundred — well
under a cent on Sonnet. There's no background usage; you only pay when you ask.

---

## Where it can go next

- Fold the same `sb.functions.invoke('planner-smart-search', …)` call into
  `planner.html`'s search bar as a "🔮 Ask" toggle (the standalone `ask.html`
  proves the flow first, so the planner edit stays low-risk).
- Reuse the function shape for the bigger AI pieces (semantic memory, voice
  capture) — auth + CORS + the Anthropic call are identical.
