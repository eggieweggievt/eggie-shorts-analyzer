/* ============================================================================
   Creator Memory — shared read-only loader
   ----------------------------------------------------------------------------
   One source of truth for "who the creator is". Pages include this to MIRROR
   the profile (planner_brand_memory) instead of keeping their own copy.

   Usage:
     <script src="creator-memory.js"></script>
     const mem = await CreatorMemory.fetch(sb, ownerId);   // sb optional
     // mem is null if nothing saved, else a normalized profile object.

   It reads the signed-in owner's row from Supabase when given a client, and
   always falls back to this browser's local copy ('eggie.brandmemory.v1'),
   so it works signed-out and in demo mode (the demo shim mocks Supabase).
   ========================================================================== */
(function () {
  'use strict';
  var LS = 'eggie.brandmemory.v1';

  var NICHE = {gaming:'🎮 Gaming',chatting:'💬 Just Chatting',art:'🎨 Art / Creative',music:'🎵 Music',variety:'✨ Variety',tech:'💻 Tech',lifestyle:'🌿 Lifestyle / Vlog',irl:'📱 IRL',asmr:'🌙 ASMR',vrchat:'🕶️ VRChat'};
  var VT = {pngtuber:'🖼️ PNGtuber','2d_live2d':'✨ 2D Live2D','3d':'🪩 3D / VTube Studio',irl:'📷 IRL (no avatar)',none:'❌ N/A'};
  var TONE = {chaotic:'⚡ Chaotic',chill:'🌊 Chill',energetic:'🔥 Energetic',wholesome:'💗 Wholesome',edgy:'🌑 Edgy','dry-humor':'☕ Dry humor',sweet:'🍰 Sweet',sharp:'🗡️ Sharp / witty'};
  var CONTENT = {shorts:'📱 Shorts','long-form':'📺 Long-form',livestream:'🔴 Livestream'};
  var PLAT = {youtube:'📺 YouTube',twitch:'🟣 Twitch',tiktok:'🎵 TikTok',instagram:'📷 Instagram',x:'🐦 X / Twitter',kick:'💚 Kick'};
  var GOAL = {subscribers:'📈 Grow subs','watch-time':'⏱️ More watch-time',community:'💬 Tight community','brand-deals':'🤝 Brand deals','algorithm-pickup':'🚀 Algorithm pickup'};

  function arr(v){ return Array.isArray(v) ? v : []; }
  function str(v){ return v == null ? '' : String(v); }

  // Accept a full Supabase row {profile, series, ...} OR a bare profile object.
  function normalize(row) {
    if (!row || typeof row !== 'object') return null;
    var p = (row.profile && typeof row.profile === 'object') ? row.profile : row;
    var series = arr(row.series).map(function (s) { return (s && s.name) || ''; }).filter(Boolean);
    var links = arr(row.links).filter(function (l) { return l && (l.url || l.label); });
    var out = {
      creator_name: str(p.creator_name), pronouns: str(p.pronouns), tagline: str(p.tagline),
      vibe: str(p.vibe), emoji_style: str(p.emoji_style), audience: str(p.audience),
      niche_primary: str(p.niche_primary), vtuber_type: str(p.vtuber_type),
      content_forms: arr(p.content_forms), platforms: arr(p.platforms), goals: arr(p.goals),
      voice_tone: arr(p.voice_tone), adjectives: arr(p.adjectives),
      signature_phrases: arr(p.signature_phrases), always_words: arr(p.always_words), never_words: arr(p.never_words),
      stream_schedule: str(p.stream_schedule), sponsors: str(p.sponsors),
      links: links, series: series
    };
    // "Has anything meaningful?" guard
    var any = out.creator_name || out.niche_primary || out.voice_tone.length || out.audience || out.tagline || out.series.length;
    return any ? out : null;
  }

  function fromLocal() {
    try { var r = localStorage.getItem(LS); if (r) return normalize(JSON.parse(r)); } catch (e) {}
    return null;
  }

  function fetchMem(sb, ownerId) {
    if (sb && ownerId) {
      try {
        return sb.from('planner_brand_memory').select('*').eq('user_id', ownerId).maybeSingle()
          .then(function (res) { return (res && res.data) ? (normalize(res.data) || fromLocal()) : fromLocal(); })
          .catch(function () { return fromLocal(); });
      } catch (e) { /* fall through */ }
    }
    return Promise.resolve(fromLocal());
  }

  function label(kind, v) {
    var M = {niche: NICHE, vtuber: VT, tone: TONE, content: CONTENT, platform: PLAT, goal: GOAL}[kind] || {};
    return M[v] || v;
  }
  function plainLabel(kind, v) { return label(kind, v).replace(/^[^\s]+\s/, ''); }   // strip leading emoji
  function toneLabels(mem) { return mem ? mem.voice_tone.map(function (v) { return plainLabel('tone', v); }) : []; }
  function nicheLabel(mem) { return mem && mem.niche_primary ? plainLabel('niche', mem.niche_primary) : ''; }

  // Sponsor-pitch tone pills (warm/professional/playful/casual) ← nearest Creator Memory tone
  function pitchTone(mem) {
    var t = mem ? mem.voice_tone : [];
    if (!t.length) return null;
    if (t.indexOf('chill') > -1 || t.indexOf('sweet') > -1 || t.indexOf('wholesome') > -1) return 'warm';
    if (t.indexOf('chaotic') > -1 || t.indexOf('energetic') > -1) return 'playful';
    if (t.indexOf('edgy') > -1 || t.indexOf('dry-humor') > -1 || t.indexOf('sharp') > -1) return 'casual';
    return 'warm';
  }

  // Parse the sponsors text field ("Name | url | CODE" per line) into objects.
  function parseSponsors(mem) {
    var raw = mem && mem.sponsors ? mem.sponsors : '';
    return str(raw).split('\n').map(function (line) {
      var parts = line.split('|').map(function (x) { return x.trim(); });
      return parts[0] ? { name: parts[0], url: parts[1] || '', code: parts[2] || '' } : null;
    }).filter(Boolean);
  }

  window.CreatorMemory = {
    LS_KEY: LS,
    normalize: normalize, fromLocal: fromLocal, fetch: fetchMem, parseSponsors: parseSponsors,
    label: label, plainLabel: plainLabel, toneLabels: toneLabels, nicheLabel: nicheLabel, pitchTone: pitchTone,
    NICHE: NICHE, VT: VT, TONE: TONE, CONTENT: CONTENT, PLAT: PLAT, GOAL: GOAL
  };
})();
