/* ============================================================
   a11y-modes.js — site-wide accessibility modes for Eggie's Creator Hub
   Drop-in: <script src="a11y-modes.js?v=1"></script> in <head>,
   right after demo-mode.js, on every page.

   Three modes, all saved in localStorage and applied instantly on
   every page that includes this file (no reload needed):

   🌙 DARK MODE  (key: hub-a11y-dark)
      Inverts the whole pastel canvas into a dark theme and boosts
      saturation so the teal / pink / periwinkle accents glow against
      the dark background. Photos, logos, emoji, video and canvas are
      counter-inverted so they keep their true colors.
      Technique: filter on the ROOT element — per the CSS Filter
      Effects spec, a filter on the document root does NOT create a
      containing block, so position:fixed / sticky UI keeps working.

   📖 DYSLEXIA-FRIENDLY MODE  (key: hub-a11y-dys)
      Evidence-based, following the British Dyslexia Association
      style guide + WCAG 1.4.12 text-spacing:
      • Atkinson Hyperlegible (Braille Institute) with Verdana/Arial
        fallbacks — plain sans-serif, maximum letter distinction
      • wider letter-spacing (~0.04em) + word-spacing (research:
        Zorzi et al. 2012 — spacing improves reading in dyslexia)
      • line-height 1.8 on running text, left-aligned paragraphs
      • italics become bold (italics cause letter-crowding)
      • script/decorative heading font replaced with the body font

   🟡 SOFT YELLOW TINT  (key: hub-a11y-tint)
      A warm cream tint layered over bright whites — cuts glare /
      visual stress (BDA: dark text on a light, NOT white background).
      Independent toggle so it can be combined with dyslexia-friendly
      mode or used alone. Hides itself automatically while dark mode
      is on (no bright whites to soften there).

   Toggle UI: any element with [data-a11y-toggles] gets two pill
   buttons rendered into it (home page has one in .top-utility).
   API: window.HubA11y.toggle('dark'|'dys'), .set(mode,on), .state()
   ============================================================ */
(function () {
  if (window.__hubA11yInit) return;
  window.__hubA11yInit = true;

  var KEYS = { dark: 'hub-a11y-dark', dys: 'hub-a11y-dys', tint: 'hub-a11y-tint' };
  var ATTR = { dark: 'data-hub-dark', dys: 'data-hub-dys', tint: 'data-hub-tint' };
  var root = document.documentElement;

  function getLS(k) { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } }
  function setLS(k, v) { try { v ? localStorage.setItem(k, '1') : localStorage.removeItem(k); } catch (e) {} }

  /* ---------- shared stylesheet (injected immediately) ---------- */
  var CSS = [
    /* ===== 🌙 dark mode — smart invert with accent boost ===== */
    'html[' + ATTR.dark + ']{filter:invert(1) hue-rotate(180deg) saturate(1.35);background:#fff;color-scheme:dark}',
    'html[' + ATTR.dark + '] body{color-scheme:light}',
    /* the pages' decorative white "sparkle" dots (body::before) invert into
       dark specks that look like dead pixels — hide them in dark mode */
    'html[' + ATTR.dark + '] body::before{content:none !important}',
    /* counter-invert real-color content so it keeps true colors */
    'html[' + ATTR.dark + '] img,' +
    'html[' + ATTR.dark + '] video,' +
    'html[' + ATTR.dark + '] iframe,' +
    'html[' + ATTR.dark + '] canvas,' +
    'html[' + ATTR.dark + '] .a11y-emoji,' +
    'html[' + ATTR.dark + '] .no-dark-flip{filter:saturate(.74) hue-rotate(180deg) invert(1)}',

    /* ===== 📖 dyslexia-friendly mode ===== */
    'html[' + ATTR.dys + '] body,' +
    'html[' + ATTR.dys + '] body *:not(.a11y-emoji){' +
      "font-family:'Atkinson Hyperlegible',Verdana,'Trebuchet MS',Arial,sans-serif !important;" +
      'letter-spacing:.04em}',
    'html[' + ATTR.dys + '] body{word-spacing:.12em;line-height:1.7}',
    'html[' + ATTR.dys + '] p,' +
    'html[' + ATTR.dys + '] li,' +
    'html[' + ATTR.dys + '] dd,' +
    'html[' + ATTR.dys + '] blockquote,' +
    'html[' + ATTR.dys + '] label,' +
    'html[' + ATTR.dys + '] td{line-height:1.8 !important}',
    'html[' + ATTR.dys + '] p,' +
    'html[' + ATTR.dys + '] li,' +
    'html[' + ATTR.dys + '] blockquote{text-align:left !important}',
    /* italics crowd letters — show emphasis as bold instead */
    'html[' + ATTR.dys + '] em,' +
    'html[' + ATTR.dys + '] i{font-style:normal !important;font-weight:700}',
    /* no ALL-CAPS runs — lower case is easier to read */
    'html[' + ATTR.dys + '] h1,' +
    'html[' + ATTR.dys + '] h2,' +
    'html[' + ATTR.dys + '] h3{text-transform:none !important;letter-spacing:.03em !important;line-height:1.45 !important}',
    /* ===== 🟡 soft yellow tint (independent mode; hidden in dark mode) ===== */
    '#a11yCreamTint{display:none;position:fixed;inset:0;pointer-events:none;' +
      'z-index:2147483646;background:#f9efd9;mix-blend-mode:multiply}',
    'html[' + ATTR.tint + ']:not([' + ATTR.dark + ']) #a11yCreamTint{display:block}',

    /* ===== toggle pills ===== */
    '.a11y-toggles{display:inline-flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '.a11y-toggle{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-family:inherit;line-height:1;' +
      'padding:8px 14px;border-radius:999px;background:rgba(255,255,255,0.75);' +
      'border:1.5px solid rgba(144,165,255,0.45);color:var(--deep,#4D5BC0);font-weight:800;font-size:13px;' +
      'box-shadow:0 4px 14px rgba(144,165,255,0.15);' +
      'transition:transform .12s ease,background .15s ease,box-shadow .15s ease,border-color .15s ease}',
    '.a11y-toggle:hover{transform:translateY(-1px);background:rgba(255,255,255,0.95);' +
      'border-color:rgba(144,165,255,0.7);box-shadow:0 6px 18px rgba(144,165,255,0.25)}',
    '.a11y-toggle:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(144,165,255,0.4)}',
    '.a11y-toggle[aria-pressed="true"]{color:#fff;border-color:transparent;' +
      'background:linear-gradient(135deg,var(--pink-hot,#FFB2F0),var(--periwinkle,#90A5FF) 60%,var(--mint,#6BE4EA));' +
      'box-shadow:0 6px 16px rgba(144,165,255,0.32)}',
    '.a11y-toggle .at-ic{font-size:15px;line-height:1}',
    '@media (prefers-reduced-motion:reduce){.a11y-toggle{transition-duration:.01ms !important}}'
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'a11y-modes-css';
  style.textContent = CSS;
  (document.head || root).appendChild(style);

  /* ---------- Atkinson Hyperlegible (loaded only when needed) ---------- */
  function ensureFont() {
    if (document.getElementById('a11y-font')) return;
    var l = document.createElement('link');
    l.id = 'a11y-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap';
    (document.head || root).appendChild(l);
  }

  /* ---------- cream tint layer ---------- */
  function ensureTint() {
    if (document.getElementById('a11yCreamTint') || !document.body) return;
    var d = document.createElement('div');
    d.id = 'a11yCreamTint';
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
  }

  /* ---------- emoji wrapping (keeps emoji true-color in dark mode) ----------
     The dark-mode invert would turn 🐙 pink → sickly green. Color emoji are
     plain text, so we wrap emoji runs in <span class="a11y-emoji"> which the
     stylesheet counter-inverts. Spans are inert when dark mode is off. */
  var EMOJI_RE;
  try {
    EMOJI_RE = new RegExp(
      '(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*)+',
      'gu'
    );
  } catch (e) { EMOJI_RE = null; } /* very old browsers: emoji just invert */

  function wrapEmojiIn(node) {
    if (!EMOJI_RE || !node) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: function (t) {
        var p = t.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'TITLE') return NodeFilter.FILTER_REJECT;
        if (p.classList && p.classList.contains('a11y-emoji')) return NodeFilter.FILTER_REJECT;
        EMOJI_RE.lastIndex = 0;
        return EMOJI_RE.test(t.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    targets.forEach(function (t) {
      var text = t.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
      EMOJI_RE.lastIndex = 0;
      while ((m = EMOJI_RE.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var s = document.createElement('span');
        s.className = 'a11y-emoji';
        s.textContent = m[0];
        frag.appendChild(s);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (t.parentNode) t.parentNode.replaceChild(frag, t);
    });
  }

  var emojiObserver = null;
  function startEmojiWatch() {
    if (!document.body || !EMOJI_RE) return;
    wrapEmojiIn(document.body);
    if (emojiObserver) return;
    var pending = false;
    emojiObserver = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if (root.hasAttribute(ATTR.dark) && document.body) wrapEmojiIn(document.body);
      });
    });
    emojiObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function stopEmojiWatch() {
    if (emojiObserver) { emojiObserver.disconnect(); emojiObserver = null; }
    /* existing .a11y-emoji spans are harmless when dark mode is off */
  }

  /* ---------- apply / toggle ---------- */
  function apply(mode, on) {
    on ? root.setAttribute(ATTR[mode], '1') : root.removeAttribute(ATTR[mode]);
    if (mode === 'dys' && on) ensureFont();
    if (mode === 'tint' && on) whenBody(ensureTint);
    if (mode === 'dark') { on ? whenBody(startEmojiWatch) : stopEmojiWatch(); }
    syncButtons();
  }
  function set(mode, on) { setLS(KEYS[mode], on); apply(mode, on); }
  function toggle(mode) { set(mode, !root.hasAttribute(ATTR[mode])); }
  function state() {
    return {
      dark: root.hasAttribute(ATTR.dark),
      dys: root.hasAttribute(ATTR.dys),
      tint: root.hasAttribute(ATTR.tint)
    };
  }

  function whenBody(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ---------- toggle pill UI ---------- */
  var BTNS = [
    { mode: 'dark', ic: '🌙', label: 'Dark mode', title: 'Switch the whole hub to a dark theme with bright teal + pink accents' },
    { mode: 'dys', ic: '📖', label: 'Dyslexia-friendly', title: 'Easier-to-read font, wider letter + line spacing, left-aligned text' },
    { mode: 'tint', ic: '🟡', label: 'Soft yellow tint', title: 'Warm cream tint over bright whites — cuts glare; pairs well with dyslexia-friendly mode' }
  ];
  function syncButtons() {
    var s = state();
    document.querySelectorAll('.a11y-toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', s[b.dataset.a11yMode] ? 'true' : 'false');
    });
  }
  function buildToggles() {
    document.querySelectorAll('[data-a11y-toggles]').forEach(function (mount) {
      if (mount.querySelector('.a11y-toggle')) return;
      mount.classList.add('a11y-toggles');
      BTNS.forEach(function (def) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'a11y-toggle';
        b.dataset.a11yMode = def.mode;
        b.title = def.title;
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = '<span class="at-ic" aria-hidden="true">' + def.ic + '</span><span>' + def.label + '</span>';
        b.addEventListener('click', function () { toggle(def.mode); });
        mount.appendChild(b);
      });
    });
    syncButtons();
  }

  /* ---------- boot: apply saved prefs ASAP (we run from <head>) ---------- */
  if (getLS(KEYS.dark)) apply('dark', true);
  if (getLS(KEYS.dys)) apply('dys', true);
  if (getLS(KEYS.tint)) apply('tint', true);
  whenBody(function () {
    buildToggles();
    if (root.hasAttribute(ATTR.tint)) ensureTint();
    if (root.hasAttribute(ATTR.dark)) startEmojiWatch();
  });

  window.HubA11y = { set: set, toggle: toggle, state: state };
})();
