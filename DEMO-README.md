# 🧪 Demo mode — test changes before they go live

A safe, local sandbox version of the whole Creator Hub. Use it to click through
changes and make sure they work **before** you push updates to
[creatorhub.eggieweggie.ca](https://creatorhub.eggieweggie.ca).

## How to use it

1. Double-click **`DEMO.html`** (it opens in your browser).
2. Click any tool. You're auto-signed-in as a demo user, with sample data loaded.
3. Poke around, break things, test the change you're checking.
4. The pink bar at the bottom has **↻ Reset demo data** (wipe back to samples) and
   **✕ Exit demo**.

That's it — no terminal, no Node, no server.

## Why it's safe

Every demo page is opened with `?demo=1` in the URL. That one flag makes
`demo-mode.js` swap your real Supabase backend for an in-browser mock:

- You're "signed in" as `demo@eggieweggie.ca` automatically — no magic-link email.
- All reads and writes go to your **browser's local storage only**.
- Your live database, real sign-in, editors, managers, and media kits are
  **never contacted**.

Once you're in demo mode it stays sticky — every link keeps the `?demo=1` flag, so
you can wander the whole hub without leaving the sandbox.

## How it works (the short version)

- **`demo-mode.js`** is loaded as the very first script in `<head>` on every page.
- Without `?demo=1`, it does **nothing** — it returns on the first line. So it's
  completely safe to deploy to production alongside everything else (it ships, it
  just sleeps).
- With `?demo=1`, it defines a fake `window.supabase` before any page code runs, so
  `createClient()` returns the mock instead of the real client.
- **`DEMO.html`** is just a friendly launcher with `?demo=1` links to every tool.

## ⭐ Keeping the demo in sync (important for future updates)

The demo mirrors production automatically **as long as new pages include the shim.**
Whenever a new `.html` page is added to the hub:

1. Add this as the first line inside its `<head>`:
   ```html
   <script src="demo-mode.js"></script><!-- demo sandbox: inert unless ?demo=1 -->
   ```
2. Add a `?demo=1` tile for it in **`DEMO.html`**.
3. If the page reads a new Supabase table and you want it to feel "alive" in the
   demo, add a few sample rows to the `SEEDS` object near the top of
   `demo-mode.js`. (Optional — pages handle empty tables fine.)

Pages and edits that only change existing pages need nothing extra — the shim is
already wired in, so the demo reflects them the moment you save.

## Files

| File | What it is |
|---|---|
| `DEMO.html` | Double-click this to start. Launcher with demo links. |
| `demo-mode.js` | The shim. Inert in production; mocks Supabase when `?demo=1`. |
| `DEMO-README.md` | This file. |
