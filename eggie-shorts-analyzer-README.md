# Eggie's Shorts Analyzer 🐙

A single-file, self-contained web app that scores YouTube / TikTok / Instagram shorts against your growth rubric. Drop the HTML file anywhere — locally, GitHub Pages, Netlify Drop, Vercel, your own site — and it works.

## What it does

Takes a short-form video link (or just the title + caption + hashtags + duration), then scores it 0-10 across nine criteria:

- **Hook strength** — title curiosity framing + self-reported first 1-3s
- **Duration & pacing** — 45-55s sweet spot, rewatchability bonus
- **Title quality** — length, specificity, click-enticing punctuation
- **Hashtag strategy** — platform-specific rules (YT: 2-3, TikTok: 1-3, IG: 3-5, X: 0)
- **Caption / description** — hook sentence + keyword density
- **Engagement triggers** — hard stance, contrarian framing, cult-loved community mentions
- **SEO consistency** — keyword overlap across title / description / hashtags
- **Niche signal** — VTuber markers, specific game/topic anchor
- **Retention & swipe-through** (optional) — if you paste in YT Studio numbers

Output includes:
- Overall score with verdict
- Per-criterion mini-cards with score bars
- Pass / warn / fail checklist
- Written critique with the top 3 leaks and specific fixes
- 4 alternate title rewrites tuned to your input
- Platform-specific hashtag recommendation

## How to use it

### Locally
Just double-click `eggie-shorts-analyzer.html` and it opens in your browser. Works fully offline once loaded (except the oEmbed auto-fetch, which needs internet).

### As a public lead magnet — easiest options

**Netlify Drop** *(literally drag & drop, 30 seconds)*
1. Go to https://app.netlify.com/drop
2. Drag the HTML file onto the page
3. You get a public URL instantly. Rename the site in settings to something cute.

**GitHub Pages**
1. Create a repo, upload the HTML file as `index.html`
2. Settings → Pages → Deploy from `main` → root
3. Your tool is live at `https://<user>.github.io/<repo>/`

**Vercel** *(if you want a custom domain easily)*
1. `vercel deploy` from the folder containing the file (rename it to `index.html` first), or
2. Drag it into the Vercel dashboard

## What auto-fetching does and doesn't do

| Platform | What auto-fetches | What you fill in |
|---|---|---|
| **YouTube** | Title, thumbnail, author (via oEmbed — no API key) | Description, hashtags, duration, retention |
| **TikTok** | Title, thumbnail, author (via oEmbed) | Hashtags, duration, retention |
| **Instagram** | *(blocked since 2020 — manual only)* | Everything |
| **X / Twitter** | *(no oEmbed for video)* | Everything |

If oEmbed fails (video is private, account is restricted, network blocks it), the form just asks you to fill in the details manually. Either way, you get a full score.

## Want a "real" backend version? (v2 idea)

This v1 lives entirely in one HTML file so it deploys anywhere. A v2 with a backend could:
- Use **YouTube Data API v3** for real view counts, exact duration, like-to-view ratio, full description
- Use **TikTok Display API** for verified creators (gated)
- Cache results / let users save analyses
- Capture emails for the lead magnet funnel

When you want that, ping me — the analyzer engine in this file ports straight over to a server function. The only changes are:
1. Move the `runAnalysis()` function (and its helpers) to a Node.js serverless function
2. Add a YouTube Data API key as an env var
3. Call the API from the frontend instead of analyzing client-side

## Customising the analyzer

Open the HTML file in any text editor. The scoring functions are all in the `<script>` block, each clearly labelled:

```js
function scoreHook({title, hookStrength}) { ... }
function scoreDuration({duration, rewatchable, platform}) { ... }
function scoreTitle({title, platform}) { ... }
function scoreHashtags({hashtags, platform}) { ... }
// etc.
```

To change a weight (how much a criterion influences the overall score), find the `weight: 2.2` value in each function and adjust.

To add a new criterion, copy any existing `scoreXxx()` function, add it to the `runAnalysis()` call list, and you're done — the UI automatically renders any criterion you return.

## Branding

- **Colors**: `#FFB2F0` `#63AAF4` `#6BE4EA` `#FFDBF7` `#90A5FF` `#4D5BC0`
- **Display font**: Pacifico (closest free pairing to Groovy) — swap to the real Groovy file if you have a license
- **Body font**: Quicksand
- **Mascot**: Inline SVG octopus + sakura with float animation
- **Credits**: Brand by @nyxgothica · Art by @naniku

## Credit lines in the footer

Already wired in the HTML — feel free to edit or remove if you'd rather not credit publicly. The credit block is at the bottom of `<body>` inside `<footer>`.

---

Built on the growth rubric in your own resources — algorithm wave testing, hook-first design, 45-55s sweet spot, 85-90% retention target, niche-down for consistent sample audience, hashtag mix per platform.
