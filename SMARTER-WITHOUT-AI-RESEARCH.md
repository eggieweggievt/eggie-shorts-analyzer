# 🧠 Making the hub smarter without AI APIs — research report (2026-06-12)

The constraint, read precisely: **no paid APIs, no cloud AI, nothing leaving the browser that doesn't already.** That still leaves four big intelligence sources — and the hub already uses some of each, so these are upgrades to proven patterns, not experiments:

1. **Your own data** (the most underused asset — you're already collecting it)
2. **Classic NLP + statistics** (word lists, POS tagging, n-grams, Bayes — zero downloads)
3. **On-device ML** (transformers.js — the analyzer already ships Whisper/Florence-2/CLIP/YAMNet; Ask now ships MiniLM)
4. **Free/no-key data sources** (Datamuse already; YouTube RSS + oEmbed are unused and free)

Plus one decision item (#12) that's free and on-device but *is* AI — flagged separately because of the hub's "not AI" positioning.

---

## 🎯 Analyzer-specific upgrades, ranked

### 1. Close the learning loop — the single smartest thing available ⭐⭐⭐
You already store everything needed: `analyzer_runs` (with `actual_views`, `picked_title`, `generated_titles`), `analyzer_title_ratings` (👍/👎), `analyzer_tag_ratings`, and `analyzer_user_prefs.preferred_template_weights` (a column that exists but nothing fills!). The upgrade:
- After ~10 runs with logged views, compute per-template-family and per-tag stats: which ones correlate with YOUR above-median videos.
- Feed `preferred_template_weights` and bias `suggestHashtagsFor` + the title engine with them.
- Use **Thompson sampling** (a 15-line multi-armed bandit) so the engine keeps exploring new templates while exploiting winners — this is genuine machine learning, no model file, no API, just beta distributions over your own results.
**Effort:** medium. **Why first:** it converts the Optimizer from "generic best practice" to "tuned to Eggie's actual channel," and the data pipeline already exists.

### 2. Auto-fill real view counts via YouTube oEmbed / RSS (no key) ⭐⭐⭐
The learning loop needs `actual_views`, which is currently manual (so it rarely happens). Options, from safest:
- **YouTube Data API v3** — free tier, 10,000 units/day (a `videos.list` stats call is 1 unit; you'd use ~10/day). Needs a free API key in Creator Memory. ([quota docs](https://developers.google.com/youtube/v3/getting-started), [2026 cost guide](https://www.getphyllo.com/post/is-the-youtube-api-free-costs-limits-iv))
- **oEmbed endpoint** — zero key, returns title/author for any public video URL ([reference](https://web-data-labs.com/blog/youtube-video-stats-without-api)) — perfect for validating posted links and auto-titling runs, though it doesn't include view counts.
- Channel **RSS feeds** (`/feeds/videos.xml?channel_id=…`) — zero key, lists your latest uploads with timestamps; lets the hub auto-match posted planner cards to real uploads.
**Effort:** small-medium. Pairs with #1 — together they make the analyzer self-improving.

### 3. Title ↔ thumbnail agreement check via CLIP — already downloaded! ⭐⭐⭐
The analyzer already ships CLIP for semantic matching. Point the same model at the thumbnail + candidate title: cosine similarity = "does the thumbnail show what the title promises?" Mismatch is one of the best-documented CTR killers, and no free tool offers this. Surface it in the Thumbnail Checker A/B too ("A matches your title better").
**Effort:** small (the hard part — CLIP in the browser — is done).

### 4. WebGPU + smaller models = a faster analyzer ⭐⭐
Transformers.js v3+ supports `device: 'webgpu'` — large speedups on Chrome/Edge with automatic WASM fallback ([HF announcement](https://huggingface.co/blog/transformersjs-v3), [WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu)). Also: **Whisper-tiny is ~40 MB** vs the current Whisper-medium (~1 GB of the 1.2 GB pipeline) — offer "fast mode" with tiny as default and medium as opt-in for accuracy. First-run drops from ~1.2 GB to ~300 MB.
**Effort:** small-medium (flag + model-id changes), big perceived win.

### 5. POS-aware hook analysis with compromise.js or wink-nlp ⭐⭐
~250 KB, MIT, no model download. Part-of-speech tagging upgrades title scoring from regex to grammar: verb-first detection ("I BROKE the game" beats "My experience with…"), concrete-noun density, passive-voice detection, person-anchoring (I/you). The Toolbox tone tools could share the same engine for sharper reads.
**Effort:** small per check; incremental.

### 6. Datamuse, deeper (already integrated, barely used) ⭐
Free, no key: `rel_trg` (topic→associated words for tag expansion), `md=f` word frequency (rare word in title = low search volume warning), `sl=` sounds-like for typo-tolerant matching. The title engine already calls Datamuse — these are parameter upgrades.

### 7. A living title corpus from niche RSS (no key) ⭐⭐
Weekly scheduled task (like trends.json) pulls RSS from the channels in `channels.json` → extracts title n-grams that are recurring in your niche RIGHT NOW → feeds the template bank and scoring ("titles like 'X did Y for 24 hours' are trending in your niche this month"). All public RSS, no scraping, no key.
**Effort:** medium (extends the existing trends.json refresh pattern).

---

## 🏠 Hub-wide upgrades

### 8. Embeddings as shared infrastructure ⭐⭐⭐
Ask's MiniLM layer (or the newer ~30 MB [mxbai-embed-xsmall](https://huggingface.co/blog/transformersjs-v3)) can serve the whole hub once loaded:
- **Planner duplicate-idea detection** — "🌱 this looks like your card *Gremlin ranked grind* — same idea?" at quick-capture time (ADHD brains re-capture the same idea weekly; this is kind deduplication).
- **Related cards** on the item modal ("similar past videos + how they scored").
- **Brand-voice similarity** in Creator Memory's voice checker — compare drafts to your highest-rated past titles by meaning, not just word lists.

### 9. Naive-Bayes auto-categorizer for Finance ⭐⭐
Learns from YOUR past categorizations (word → category counts, ~30 lines of JS, no library). "Adobe" → Software after two examples. Classic ML, zero downloads — and the same classifier pattern can auto-suggest planner card platforms from titles.

### 10. Your-rhythms statistics ⭐⭐
Pure arithmetic on existing tables, no ML needed: best posting day/hour (posted_at × logged views), idea→posted velocity (median days per stage), focus chronotype from `planner_focus_sessions` ("you complete 2× more before noon"), habit↔energy co-occurrence. One shared "📈 your patterns" module; simple-statistics (tiny MIT lib) if you want confidence intervals done right.

### 11. Streak-aware nudging done right ⭐
The "One thing now" picker can learn light preferences without any model: count which suggestion *types* you actually click vs skip (↻), stored locally, and re-weight. A 10-line bandit again — personalization with zero AI.

---

## ⚠️ 12. The decision item: Chrome's built-in AI (free, on-device — but it IS AI)
As of 2026 Chrome ships **Gemini Nano + task APIs in the browser itself**: Summarizer, Translator, Writer, Rewriter, Proofreader, and the now-stable Prompt API (Chrome 148+), running on-device with no key and no cost ([Chrome built-in AI docs](https://developer.chrome.com/docs/ai/built-in), [Chrome 148 overview](https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en), [I/O 2026 recap](https://developer.chrome.com/blog/chrome-at-io26)). Smaller expert models (Gemma 197M) auto-scale features to modest devices. Caveats: Chrome-only, the model download is multi-GB on capable machines (and has drawn [consent controversy](https://alternativeto.net/news/2026/5/google-chrome-silently-installs-4-gb-gemini-nano-ai-model-to-user-device-without-consent/)), and users can disable it in settings.

What it could power as **progressive enhancement** (feature-detected, invisible when absent): real description rewriting in the Tone shifter, weekly-review summaries, proofread-before-send in Pitch Builder, Professor/Chef-grade explainers in the Toolbox.

**The honest tension:** it costs nothing and nothing leaves the device — but the hub's public identity is "explicitly NOT AI." My recommendation: **skip it for now**, or ship it only as a clearly-labeled opt-in "browser experiments" toggle, off by default. Items #1–11 deliver "smarter" without touching the brand promise. Your call — this report exists so it's an informed one.

---

## Where I'd start

| Order | What | Effort | Smartness gained |
|---|---|---|---|
| 1 | Learning loop + Thompson sampling (#1) | M | Optimizer tunes itself to YOUR channel |
| 2 | YouTube RSS/oEmbed auto view-fill (#2) | S-M | Feeds #1 without manual data entry |
| 3 | CLIP title↔thumbnail match (#3) | S | Unique feature, model already shipped |
| 4 | Duplicate-idea detection via embeddings (#8) | S-M | Reuses Ask's model; very ND-kind |
| 5 | Whisper-tiny fast mode + WebGPU (#4) | S-M | 1.2 GB → ~300 MB first run |
| 6 | Best-time-to-post + your-patterns stats (#10) | S | Real insight from data you already have |

*Sources: [Chrome built-in AI](https://developer.chrome.com/docs/ai/built-in) · [Chrome at I/O 2026](https://developer.chrome.com/blog/chrome-at-io26) · [Gemini Nano in Chrome 148](https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en) · [Nano install controversy](https://alternativeto.net/news/2026/5/google-chrome-silently-installs-4-gb-gemini-nano-ai-model-to-user-device-without-consent/) · [Transformers.js v3 + WebGPU](https://huggingface.co/blog/transformersjs-v3) · [WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu) · [YouTube API free quota 2026](https://www.getphyllo.com/post/is-the-youtube-api-free-costs-limits-iv) · [YouTube Data API docs](https://developers.google.com/youtube/v3/getting-started) · [No-key YouTube stats approaches](https://web-data-labs.com/blog/youtube-video-stats-without-api)*
