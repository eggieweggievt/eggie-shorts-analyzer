# The Poor Man's VidIQ — but better

**Research + build roadmap · 2026-06-14**
How to push the hub's pattern-recognition engine further while staying **free, fully client-side (GitHub Pages, no backend), no paid AI API, and zero generative AI.**

---

## 1. What this system actually IS (so we can describe it honestly)

It's not "AI" in the marketing sense, and it's emphatically not generative. The accurate, defensible name is a **hybrid recognition-and-scoring engine**, made of four classic pieces:

1. **Rule-based / heuristic expert system** — the hand-written scoring rules for title, hook, retention, SEO, hashtags, niche. (Decades-old, explainable, deterministic.)
2. **Classical statistical pattern recognition** — TF-IDF-style keyword matching against the curated tag banks, frequency stats, ranking. No learning, just math over text.
3. **On-device transformer *inference*** — Whisper, Florence-2, CLIP, YAMNet, MiniLM run *forward passes only* (recognition: speech→text, image→caption, audio→label, text→vector). They **classify and embed; they never generate content.** This is the crucial honesty point: inference ≠ generation.
4. **(Planned) on-device supervised learning** — the "learning loop" fits a tiny model to the creator's *own* performance history. Still not generative — it predicts/ranks, it doesn't invent.

**The honest one-liner:** *"Machine learning that recognises and ranks — running on your device, on your data. It reads, hears, sees, and does the math. It never writes anything for you, and nothing leaves your browser."* That framing is true of every technique below, by design.

The whole stack is what the in-browser ML community now calls **edge inference**: WebAssembly (works everywhere) with optional **WebGPU** acceleration, which as of 2025 is shipping across all major browsers — so on-device models are getting dramatically faster for free ([dev.to](https://dev.to/aileenvl/on-device-models-and-how-they-work-in-the-browser-thanks-to-web-assembly-and-webgpu-5bo6)).

---

## 2. The free, client-side toolbox (what each piece unlocks)

### Runtimes / libraries (all free, all in-browser)
- **Transformers.js** (Hugging Face) — runs ONNX models in the browser for NLP / vision / audio with task "pipelines"; CPU via WASM by default, opt-in WebGPU for speed. v4 cut bundle size ~53% and build times to ~200ms, and the model catalogue is growing fast ([HF docs](https://huggingface.co/docs/transformers.js/index), [GitHub](https://github.com/huggingface/transformers.js/), [Worldline](https://blog.worldline.tech/2026/01/13/transformersjs-intro.html)). *This is already our backbone.*
- **ONNX Runtime Web** — the actual compute engine under Transformers.js; use directly when we want a custom/smaller ONNX model with no pipeline overhead ([pkgpulse](https://www.pkgpulse.com/guides/transformersjs-vs-onnx-runtime-web-2026)).
- **TensorFlow.js** — best for *prebuilt* vision models we don't have yet: **BlazeFace/face-detection**, **selfie-segmentation**, **MoveNet** pose, and image feature extractors — all client-side, ideal for thumbnail analysis.
- **Classical-ML in JS (tiny, no models to download):** `ml.js` / hand-rolled for TF-IDF, BM25, k-means, logistic & linear regression, naive Bayes, decision stumps. Kilobytes, instant, perfect for the "learning loop."

### Data sources — what's *genuinely* free from a static client
| Source | Free? | Client-side caveat | Good for |
|---|---|---|---|
| **YouTube Data API v3** (creator's *own* free key) | ✅ 10,000 units/day, no credit card | `search`=100 units, `read`=1 unit, `write`=50 ([Phyllo](https://www.getphyllo.com/post/is-the-youtube-api-free-costs-limits-iv), [Google](https://developers.google.com/youtube/v3/getting-started)) | Real view counts, competitor video stats, channel audits |
| **YouTube oEmbed** | ✅ no key | lightweight, CORS-friendly | Title/author/thumbnail for any video URL |
| **YouTube RSS feeds** (`/feeds/videos.xml?channel_id=`) | ✅ no key | XML, CORS varies | Latest uploads for tracked competitors |
| **Google/YouTube autocomplete** (`suggestqueries`/`complete/search?client=youtube`) | ✅ no key | **no official API**; URL endpoints work but often need JSONP/callback to dodge CORS ([DataForSEO](https://dataforseo.com/blog/google-autocomplete-api-for-keyword-research-tool), [PEMAVOR](https://www.pemavor.com/solution/autocomplete-keyword-tool/)) | **Real search-demand keyword ideas — the core of VidIQ's keyword tool** |
| **Datamuse** | ✅ no key | CORS-open | Word relations/enrichment (already in use) |
| **Wikipedia / Wikidata** | ✅ no key | CORS-open | Game/topic disambiguation, entity tags |

**Key takeaway:** VidIQ's two crown jewels — *keyword search-demand* and *competitor stats* — are both reachable for free: keyword demand via the autocomplete endpoints, and real stats via the creator's own 10k-unit/day YouTube key. We never pay; the *user's* free quota does the work.

---

## 3. Techniques to push the boundaries (the actual upgrades)

Ordered by impact-to-effort. Every one is non-generative, free, and on-device.

### A. Keyword/SEO engine → real search-demand (beats VidIQ's headline feature)
- **What:** Replace/augment the static tag bank with *live* autocomplete depth. Type a topic → pull Google + YouTube autosuggest, then rank candidates by a home-grown **Overall Score** mirroring VidIQ's `f(search volume, competition)` ([VidIQ keyword tool](https://vidiq.com/features/keyword-tools/), [Backlinko](https://backlinko.com/hub/content/vidiq)).
- **How free/on-device:** autosuggest "depth" (count of suggestions + alphabet-soup expansion `topic a`, `topic b`…) is a strong free **demand proxy**; competition proxy = number of results / median VPH from a couple of `search` calls on the user's key. Score = demand ÷ competition, computed in JS.
- **Effort:** Medium. **Impact:** Very high (this is the thing people pay VidIQ for).

### B. The "learning loop" → on-device logistic/linear regression on the creator's own data
- **What:** Once we have view counts, fit a tiny model: features = title length, has-number, has-emoji, hook-type, tag set, post hour/day, niche → target = views (or VPH). Surface "your titles with a curiosity hook get +X% on average."
- **How free/on-device:** logistic/linear regression or a 2-3 split decision stump in plain JS over a few hundred of *their* rows. Trains in milliseconds, lives in localStorage. (Skip gradient-boosted trees in-browser — overkill and heavy for this data size.)
- **Effort:** Medium. **Impact:** High — this is what makes it *better than* VidIQ, which can't personalise to your channel's own pattern.

### C. Title A/B → multi-armed bandit (Thompson sampling)
- **What:** When the creator drafts 2-3 titles, don't just score them statically — recommend which to try, and once results come in, let the system learn which *style* wins for them over time.
- **How free/on-device:** Thompson sampling keeps a Beta distribution per option, samples, picks the best — and **adapts its exploration based on real results** instead of a fixed rate; it's the standard online-A/B alternative for content recommendation ([Towards Data Science](https://towardsdatascience.com/diy-ai-ml-solving-the-multi-armed-bandit-problem-with-thompson-sampling/), [Medium](https://medium.com/@iqra.bismi/thompson-sampling-a-powerful-algorithm-for-multi-armed-bandit-problems-95c15f63a180)). ~30 lines of JS, no model.
- **Effort:** Low-Medium. **Impact:** Medium-High (genuinely novel for a free tool).

### D. Thumbnail analysis → free computer vision (beats VidIQ's thumbnail feedback)
- **What:** Score a thumbnail for clarity: face presence/size, text legibility (we already OCR via Florence-2), contrast, color punch, "rule of thirds"/saliency, and **perceptual-hash similarity** to flag "this looks like your last 5 — vary it."
- **How free/on-device:** TensorFlow.js **BlazeFace** for faces, canvas pixel math for contrast/color/edge density, **pHash** (tiny DCT in JS) for similarity. CLIP (already loaded) scores title↔thumbnail agreement.
- **Effort:** Medium. **Impact:** High.

### E. Best-time-to-post → time-series over the creator's own history
- **What:** "Your shorts posted Fri 6-8pm average 2.3× your median." VidIQ gates this; we compute it from their own data.
- **How free/on-device:** bucket their posted-video views by weekday × hour, smooth, rank. Pure stats, instant.
- **Effort:** Low. **Impact:** Medium-High.

### F. Smarter semantic layer (extend the MiniLM we already run)
- **What:** Cluster the creator's catalogue with **k-means / HDBSCAN over MiniLM embeddings** to auto-discover their *de facto* content pillars; flag "this idea is 0.91 cosine to a video you already made" (cannibalisation/dup detection); semantic tag expansion.
- **Effort:** Low (we already have the embeddings). **Impact:** Medium.

### G. Competitor/channel audit (the creator's own key)
- **What:** Track up to N competitors (VidIQ free = 3); pull their recent uploads via RSS + a `read` call, compute VPH, surface "their breakout video this week" and the tags it used.
- **How free/on-device:** RSS for the upload list, 1-unit `read` calls for stats — trivially within 10k/day.
- **Effort:** Medium. **Impact:** High.

---

## 4. Feature-by-feature: how we match or beat VidIQ — for $0

| VidIQ value prop | Our free/on-device equivalent | Better how |
|---|---|---|
| Keyword score (volume × competition) | Autocomplete-depth demand ÷ search-result competition (§A) | Free; no monthly cap on lookups |
| Competitor research (3 free) | RSS + own-key `read` stats (§G) | No artificial 3-competitor limit |
| Title/thumbnail feedback | Rule engine + CLIP title↔thumb + CV thumbnail score (§D) | Personalised to *your* past performance |
| Best time to post | Time-series on your own data (§E) | VidIQ paywalls it; we don't |
| Trend alerts | Weekly tag/keyword refresh + autosuggest deltas | Already partly built |
| Channel audit | Own-key stats + learning-loop insights (§B) | Tells you what works *for you*, not generic |

---

## 5. The honesty / privacy guarantee (keep saying it, because it's true)

Every technique above is **recognition, statistics, or your-own-data learning** — never generation, never a third-party AI service. The provable claims:
- **Nothing is uploaded.** Models and math run in the browser; the only network calls are *the user's own* YouTube key and public no-auth endpoints, which the user can see and disable.
- **No generative AI, no LLM, no paid API.** Inference/scoring only. (Whisper/CLIP/etc. *recognise*; they don't write.)
- **Your data trains only your model**, stored locally; clearing the browser resets it.
- **It's all explainable** — every score can show its inputs (unlike a black-box "AI score").

---

## 6. Prioritised build roadmap

**Now (high impact, low-medium effort, mostly classical math):**
1. Best-time-to-post from own data (§E) — quickest win.
2. Title bandit (Thompson sampling) for the A/B feature (§C).
3. Semantic clustering / dup-detection on existing MiniLM vectors (§F).

**Next (the VidIQ-killers, medium effort):**
4. Live keyword demand via autocomplete + own-key competition score (§A).
5. The learning loop: on-device regression on own performance (§B).
6. Competitor tracking via RSS + own key (§G).

**Later (more CV work):**
7. Thumbnail vision scoring with TF.js BlazeFace + canvas math + pHash (§D).

**Cross-cutting:** add an optional "connect your YouTube (your own free key)" setting — it stays the user's key, used client-side, and unlocks B/E/G with real numbers instead of proxies.

---

### Sources
- [YouTube Data API — free quota & unit costs (Phyllo)](https://www.getphyllo.com/post/is-the-youtube-api-free-costs-limits-iv) · [Google for Developers](https://developers.google.com/youtube/v3/getting-started)
- [Transformers.js docs](https://huggingface.co/docs/transformers.js/index) · [GitHub](https://github.com/huggingface/transformers.js/) · [intro/perf](https://blog.worldline.tech/2026/01/13/transformersjs-intro.html) · [Transformers.js vs ONNX Runtime Web](https://www.pkgpulse.com/guides/transformersjs-vs-onnx-runtime-web-2026)
- [On-device models, WASM + WebGPU (dev.to)](https://dev.to/aileenvl/on-device-models-and-how-they-work-in-the-browser-thanks-to-web-assembly-and-webgpu-5bo6)
- [Thompson sampling for bandits (Towards Data Science)](https://towardsdatascience.com/diy-ai-ml-solving-the-multi-armed-bandit-problem-with-thompson-sampling/) · [Medium](https://medium.com/@iqra.bismi/thompson-sampling-a-powerful-algorithm-for-multi-armed-bandit-problems-95c15f63a180)
- [Google autocomplete for keyword research (DataForSEO)](https://dataforseo.com/blog/google-autocomplete-api-for-keyword-research-tool) · [PEMAVOR free autosuggest](https://www.pemavor.com/solution/autocomplete-keyword-tool/)
- [VidIQ keyword tool](https://vidiq.com/features/keyword-tools/) · [VidIQ review/scoring (Backlinko)](https://backlinko.com/hub/content/vidiq) · [Alan Spicer review 2026](https://alanspicer.com/vidiq-review-2026/)
