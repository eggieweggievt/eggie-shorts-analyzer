/* ============================================================
   hub-core.js — Eggie's Creator Hub shared core (v2)
   Loaded in <head> on every page, right after demo-mode.js.

   What lives here:
     1. Canonical helpers (escapeHtml / escapeAttr / date utils).
        Defined ONLY if the page hasn't defined its own — so legacy
        pages keep working untouched, and new pages get them free.
     2. Service-worker registration → makes the hub installable as
        an app (PWA) with offline fallback. Skipped on file:// and
        in demo mode, so DEMO.html behaves exactly as before.
     3. window.EggieHub.initAuth — the standard Supabase boot for
        NEW pages: SDK lazy-load + session restore + the tab-refocus
        guard (so re-focusing a tab never wipes unsaved edits).
        Existing pages keep their own inline version; new pages
        should use this instead of copy-pasting it.
     4. EggieHub.touch / crumbs — breadcrumb memory. The hub quietly
        remembers the last few places you were, so the home page can
        offer "jump back in" links after a context switch.
     5. EggieHub.micify + auto mic buttons 🎙️ — dictation on big
        textareas via the browser's built-in speech recognition.
        Talk instead of typing; text is appended, never submitted.
     6. EggieHub.speak / stopSpeaking — read text aloud with the
        browser's built-in voice. No auto UI; pages opt in with
        their own buttons.
     7. EggieHub.setSpoons / spoons — today's shared energy level
        (0–5 spoons). Today-only on purpose: yesterday's energy
        never leaks into a new day.
   ============================================================ */
(function () {
  'use strict';
  if (window.__hubCoreInit) return;
  window.__hubCoreInit = true;

  /* ---- 0. shared UI polish layer (hub-ui.css) ----
     Injected here so every page that loads hub-core gets the smoothing +
     reusable components with no per-page <link>. Loaded as a real stylesheet
     (not inline) so it caches well; additive + :where()-based, so it never
     overrides a page's own styles. */
  if (!document.getElementById('hub-ui-css')) {
    var uiCss = document.createElement('link');
    uiCss.id = 'hub-ui-css';
    uiCss.rel = 'stylesheet';
    uiCss.href = 'hub-ui.css?v=4';
    (document.head || document.documentElement).appendChild(uiCss);
  }

  /* ---- 1. canonical helpers (define-if-missing) ---- */
  if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
  }
  if (typeof window.escapeAttr !== 'function') {
    window.escapeAttr = function (s) { return window.escapeHtml(s); };
  }
  if (typeof window.mondayOf !== 'function') {
    window.mondayOf = function (d) {
      var x = new Date(d), dow = (x.getDay() + 6) % 7;   // 0=Mon … 6=Sun
      x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x;
    };
  }
  if (typeof window.addDays !== 'function') {
    window.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  }
  if (typeof window.fmtDay !== 'function') {
    window.fmtDay = function (d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  }

  /* ---- 2. PWA: register the service worker ---- */
  var inDemo = /[?&]demo=1\b/.test(location.search || '');
  try { inDemo = inDemo || sessionStorage.getItem('__eggie_demo_mode') === '1'; } catch (e) {}
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !inDemo) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('[Hub] service worker registration failed:', e);
      });
    });
  }

  /* ---- 3. standard auth boot for NEW pages ---- */
  var SUPABASE_URL = 'https://okrheyotpypulweedhda.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_0rkBrgHykkh_F4bfICiRWA_crhItSlH';

  function loadSupabaseSDK() {
    return new Promise(function (resolve, reject) {
      if (window.supabase) return resolve(window.supabase);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = function () { window.supabase ? resolve(window.supabase) : reject(new Error('Supabase SDK missing')); };
      s.onerror = function () { reject(new Error('Failed to fetch Supabase SDK')); };
      document.head.appendChild(s);
    });
  }

  /* EggieHub.initAuth({ onSignIn(user), onSignOut() }) → Promise<client>
     Includes the hub-standard refocus guard: TOKEN_REFRESHED / USER_UPDATED /
     INITIAL_SESSION and same-user SIGNED_IN events are ignored, so handlers
     run once per genuine sign-in — never on tab switches. */
  function initAuth(opts) {
    opts = opts || {};
    var currentUser = null;
    return loadSupabaseSDK().then(function (lib) {
      var sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return sb.auth.getSession().then(function (r) {
        var session = r && r.data ? r.data.session : null;
        if (session && session.user) {
          currentUser = session.user;
          if (opts.onSignIn) opts.onSignIn(session.user);
        } else if (opts.onNoSession) {
          opts.onNoSession();
        }
        sb.auth.onAuthStateChange(function (event, s) {
          if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') return;
          if (s && s.user) {
            if (currentUser && currentUser.id === s.user.id) return;
            currentUser = s.user;
            if (opts.onSignIn) opts.onSignIn(s.user);
          } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            if (opts.onSignOut) opts.onSignOut();
          }
        });
        return sb;
      });
    });
  }

  /* ---- 4. breadcrumbs — "where was I?" memory ---- */
  /* The hub quietly remembers the last few places you touched, so the
     home page can offer "jump back in" links after a context switch
     (lunch, a raid, three days of brain fog — the hub holds the thread).
     Stored locally, newest first, capped at 10. */
  var CRUMBS_KEY = 'eggie:crumbs';

  function pageFile() {
    var p = (location.pathname || '').split('/').pop();
    return p || 'index.html';                 // bare "/" means the home page
  }

  function cleanTitle() {
    var t = String(document.title || '');
    var cut = t.search(/[—·]/);               // drop " — Eggie's Creator Hub"-style suffixes
    if (cut > 0) t = t.slice(0, cut);
    return t.replace(/^\s+|\s+$/g, '');
  }

  function crumbs() {
    try {
      var arr = JSON.parse(localStorage.getItem(CRUMBS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function touch(label, detail) {
    try {
      var crumb = {
        page: pageFile(),
        title: cleanTitle(),
        label: String(label == null ? '' : label),
        url: location.pathname + location.search + location.hash,
        at: Date.now()
      };
      if (detail != null && detail !== '') crumb.detail = String(detail);
      var list = crumbs().filter(function (c) {  // dedupe: same place + same label = one crumb
        return !(c && c.url === crumb.url && c.label === crumb.label);
      });
      list.unshift(crumb);
      if (list.length > 10) list.length = 10;
      localStorage.setItem(CRUMBS_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function autoCrumb() {
    try {
      if (inDemo) return;                     // sandbox visits stay out of real history
      if (pageFile() === 'index.html') return; // home consumes crumbs — it shouldn't dominate them
      touch(cleanTitle());
    } catch (e) {}
  }

  /* ---- 5. dictation — talk instead of typing 🎙️ ---- */
  /* Uses the browser's built-in speech recognition. Big textareas get a
     small mic button at their top-right automatically; pages can also
     call EggieHub.micify(textarea) on boxes they render later (modals
     etc). If the browser doesn't support it, nothing appears at all —
     no broken buttons. Final speech is APPENDED to the box and an
     'input' event is fired so dirty-tracking / counters keep working.
     Never submits a form, never touches the Enter key. */
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var micCssDone = false;

  function ensureMicCss() {
    if (micCssDone) return;
    micCssDone = true;
    var st = document.createElement('style');
    st.textContent =
      '.eggie-mic-btn{position:absolute;width:26px;height:26px;border-radius:50%;border:none;' +
      'background:rgba(127,127,127,.15);font-size:13px;padding:0;cursor:pointer;opacity:.55;' +
      'z-index:5;display:inline-flex;align-items:center;justify-content:center;transition:opacity .15s}' +
      '.eggie-mic-btn:hover,.eggie-mic-btn:focus{opacity:1}';
    document.head.appendChild(st);
  }

  function micify(ta) {
    if (!SpeechRec || !ta || ta.tagName !== 'TEXTAREA' || ta.__eggieMic) return;
    var parent = ta.parentNode;
    if (!parent || parent.nodeType !== 1) return;
    ta.__eggieMic = true;
    try {
      ensureMicCss();
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      var btn = document.createElement('button');
      btn.type = 'button';                    // type=button → can never submit a form
      btn.className = 'eggie-mic-btn';
      btn.textContent = '🎙️';
      btn.title = 'Dictate — talk instead of typing';
      btn.setAttribute('aria-label', 'Dictate — talk instead of typing');
      btn.style.top = (ta.offsetTop + 4) + 'px';
      btn.style.left = Math.max(0, ta.offsetLeft + ta.offsetWidth - 30) + 'px';
      var rec = null, listening = false;

      function restState() {                  // back to quiet mic, silently
        listening = false;
        btn.textContent = '🎙️';
        btn.title = 'Dictate — talk instead of typing';
      }

      btn.addEventListener('click', function () {
        if (listening) {
          try { if (rec) rec.stop(); } catch (e) {}
          restState();
          return;
        }
        try {
          rec = new SpeechRec();
          rec.continuous = false;
          rec.interimResults = true;
          rec.lang = document.documentElement.lang || 'en';
          rec.onresult = function (e) {
            var said = '';
            for (var i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) said += e.results[i][0].transcript;
            }
            said = said.replace(/^\s+|\s+$/g, '');
            if (!said) return;
            ta.value += (ta.value && !/\s$/.test(ta.value) ? ' ' : '') + said;
            try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
          };
          rec.onerror = restState;
          rec.onend = restState;
          rec.start();
          listening = true;
          btn.textContent = '🔴';
          btn.title = 'Listening… click to stop';
        } catch (e) { restState(); }
      });

      parent.insertBefore(btn, ta.nextSibling);
    } catch (e) {}
  }

  function micAutoAttach() {
    if (!SpeechRec) return;
    try {
      var tas = document.querySelectorAll('textarea');
      for (var i = 0; i < tas.length; i++) {
        var ta = tas[i];
        // conservative: only boxes big enough to be real writing fields,
        // or ones a page explicitly opted in with data-mic (and visible)
        if (ta.offsetHeight >= 60 || (ta.hasAttribute('data-mic') && ta.offsetHeight > 0)) micify(ta);
      }
    } catch (e) {}
  }

  /* ---- 6. read-aloud — let the hub read text to you ---- */
  function speak(text) {
    try {
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
      window.speechSynthesis.cancel();        // one voice at a time
      text = String(text == null ? '' : text);
      if (!text) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = document.documentElement.lang || 'en';
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function stopSpeaking() {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
  }

  /* ---- 7. spoons — today's shared energy level (0–5) ---- */
  /* Any page can ask "how much energy is there today?" and soften
     itself on low-spoons days. Strictly today-only: yesterday's number
     never leaks into a new day (stale energy is worse than none). */
  var SPOONS_KEY = 'eggie:spoonsToday';

  function localToday() {
    var d = new Date();
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function setSpoons(n) {
    try {
      n = Math.round(Number(n));
      if (!isFinite(n)) return;               // garbage in → nothing stored, never 0 by accident
      if (n < 0) n = 0;
      if (n > 5) n = 5;
      localStorage.setItem(SPOONS_KEY, JSON.stringify({ n: n, date: localToday() }));
    } catch (e) {}
  }

  function spoons() {
    try {
      var o = JSON.parse(localStorage.getItem(SPOONS_KEY) || 'null');
      if (!o || o.date !== localToday() || typeof o.n !== 'number') return null;
      return o.n;
    } catch (e) { return null; }
  }

  /* ---- 7b. EggieUI — reusable UI helpers (pair with hub-ui.css) ----
     Tiny, dependency-free, and safe to call before <body> exists (they
     defer to it). Adopt incrementally on any page:
        EggieUI.toast('Saved ✨', { type:'ok' })
        EggieUI.busy(saveBtn, true) … EggieUI.busy(saveBtn, false)
        var done = EggieUI.skeleton('list', { rows:4, card:true }); … done(); */
  function uiWhenBody(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function ensureToastWrap() {
    var w = document.getElementById('ui-toast-wrap');
    if (!w) {
      w = document.createElement('div');
      w.id = 'ui-toast-wrap';
      w.setAttribute('role', 'status');
      w.setAttribute('aria-live', 'polite');
      (document.body || document.documentElement).appendChild(w);
    }
    return w;
  }
  function uiToast(msg, opts) {
    opts = opts || {};
    var t = document.createElement('div');
    t.className = 'ui-toast' + (opts.type ? ' ui-toast--' + opts.type : '');
    t.textContent = String(msg == null ? '' : msg);
    uiWhenBody(function () {
      ensureToastWrap().appendChild(t);
      requestAnimationFrame(function () { t.classList.add('show'); });
      var dur = opts.duration || 3200;
      setTimeout(function () {
        t.classList.remove('show');
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 380);
      }, dur);
    });
    return t;
  }
  /* Lock a button into a spinner state without destroying its label.
     Non-destructive: pages that also set their own text still work. */
  function uiBusy(btn, isBusy) {
    if (!btn) return;
    if (isBusy) {
      if (!btn.hasAttribute('data-ui-was-disabled')) {
        btn.setAttribute('data-ui-was-disabled', btn.disabled ? '1' : '0');
      }
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    } else {
      btn.removeAttribute('aria-busy');
      btn.disabled = btn.getAttribute('data-ui-was-disabled') === '1';
      btn.removeAttribute('data-ui-was-disabled');
    }
  }
  /* Drop a shimmer placeholder into a container while data loads.
     Returns a clear() function. Marks the host aria-busy for screen readers. */
  function uiSkeleton(target, opts) {
    opts = opts || {};
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return function () {};
    var rows = opts.rows || 3;
    var box = document.createElement('div');
    box.className = 'ui-skeleton-host';
    box.setAttribute('aria-hidden', 'true');
    var html = '';
    if (opts.card) {
      for (var i = 0; i < rows; i++) html += '<div class="ui-skeleton ui-skeleton-card"></div>';
    } else {
      html += '<div class="ui-skeleton ui-skeleton--title"></div>';
      for (var j = 0; j < rows; j++) {
        html += '<div class="ui-skeleton ui-skeleton--text" style="width:' + (70 + (j * 9) % 26) + '%"></div>';
      }
    }
    box.innerHTML = html;
    el.setAttribute('aria-busy', 'true');
    el.appendChild(box);
    return function clear() {
      if (box.parentNode) box.parentNode.removeChild(box);
      el.removeAttribute('aria-busy');
    };
  }
  /* Wire a set of .ui-check rows into a self-contained progress checklist:
     click / Enter / Space toggles done, a .ui-progress-fill + .ui-progress-label
     update live, and a .ui-reward shows when everything's ticked. Optional
     opts.storeKey persists ticked state in localStorage (great for ADHD —
     progress survives a refresh or a distracted tab-away). Pure progressive
     enhancement: if it isn't called, the markup is still readable. */
  function uiWireChecklist(root, opts) {
    opts = opts || {};
    var el = typeof root === 'string' ? document.querySelector(root) : root;
    if (!el) return null;
    var items = Array.prototype.slice.call(el.querySelectorAll('.ui-check'));
    if (!items.length) return null;
    var fill = el.querySelector('.ui-progress-fill');
    var label = el.querySelector('.ui-progress-label');
    var reward = el.querySelector('.ui-reward');
    var store = opts.storeKey || null;

    function persist() {
      if (!store) return;
      try {
        var done = items.map(function (it) { return it.classList.contains('is-done') ? 1 : 0; });
        localStorage.setItem(store, JSON.stringify(done));
      } catch (e) {}
    }
    function restore() {
      if (!store) return;
      try {
        var saved = JSON.parse(localStorage.getItem(store) || 'null');
        if (Array.isArray(saved)) {
          items.forEach(function (it, i) { if (saved[i]) it.classList.add('is-done'); });
        }
      } catch (e) {}
    }
    function sync() {
      var done = items.filter(function (it) { return it.classList.contains('is-done'); }).length;
      var pct = Math.round(done / items.length * 100);
      if (fill) fill.style.width = pct + '%';
      if (label) label.textContent = done + ' of ' + items.length + ' done';
      if (reward) reward.classList.toggle('show', done === items.length);
      items.forEach(function (it) { it.setAttribute('aria-pressed', it.classList.contains('is-done') ? 'true' : 'false'); });
      if (typeof opts.onChange === 'function') opts.onChange(done, items.length);
    }
    function toggle(it) { it.classList.toggle('is-done'); persist(); sync(); }
    items.forEach(function (it) {
      if (!it.hasAttribute('role')) it.setAttribute('role', 'button');
      if (!it.hasAttribute('tabindex')) it.tabIndex = 0;
      it.addEventListener('click', function () { toggle(it); });
      it.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(it); }
      });
    });
    restore();
    sync();
    return { sync: sync, items: items };
  }

  /* Scroll reveal — fade + rise elements marked [data-reveal] as they enter view,
     with a gentle per-sibling stagger. Safe by design: the hidden base state in
     hub-ui.css only applies once we add html.ui-reveal-on, which we ONLY do when
     motion is allowed — so if this never runs (old cache, JS off, reduced motion,
     low-stim) the content is simply visible, never stuck hidden. Call
     EggieUI.reveal(scope) again after rendering async content (e.g. cards from
     Supabase) to animate the new nodes. */
  var uiRevealObserver = null;
  function uiMotionOff() {
    try {
      if (document.documentElement.hasAttribute('data-hub-lowstim')) return true;
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }
  function uiReveal(scope) {
    var root = scope || document;
    var els = Array.prototype.slice.call(root.querySelectorAll('[data-reveal]:not(.is-in)'));
    if (!els.length) return;
    if (uiMotionOff() || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });   // just show, no motion
      return;
    }
    document.documentElement.classList.add('ui-reveal-on');
    if (!uiRevealObserver) {
      uiRevealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target;
          var sibs = el.parentNode ? Array.prototype.slice.call(el.parentNode.querySelectorAll(':scope > [data-reveal]')) : [el];
          var i = sibs.indexOf(el);
          el.style.transitionDelay = Math.min(i < 0 ? 0 : i, 6) * 55 + 'ms';
          el.classList.add('is-in');
          uiRevealObserver.unobserve(el);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    els.forEach(function (el) { uiRevealObserver.observe(el); });
  }

  var EggieUI = { toast: uiToast, busy: uiBusy, skeleton: uiSkeleton, wireChecklist: uiWireChecklist, reveal: uiReveal };
  window.EggieUI = EggieUI;

  window.EggieHub = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    loadSupabaseSDK: loadSupabaseSDK,
    initAuth: initAuth,
    /* v2 additions */
    touch: touch,
    crumbs: crumbs,
    micify: micify,
    speak: speak,
    stopSpeaking: stopSpeaking,
    setSpoons: setSpoons,
    spoons: spoons,
    /* v3 additions */
    ui: EggieUI
  };

  /* ---- 8b. accessibility scaffold (skip link + main landmark) ----
     Adds, on every page, a "Skip to content" link as the first focusable
     element (WCAG 2.4.1 Bypass Blocks) and a programmatic main landmark
     (WCAG 1.3.1) when the page hasn't declared one. Idempotent + additive:
     it reuses an existing <main>/[role=main] if present, otherwise marks the
     page's first `.wrap` (the hub's main-column convention). If neither
     exists (e.g. the bare OBS overlay) it no-ops. */
  function injectA11yScaffold() {
    if (!document.body || document.getElementById('ui-skip-link')) return;
    /* main landmark: reuse an existing one, else mark the first `.wrap`
       (the hub's main column). nav lives inside `.wrap`, which is allowed. */
    var main = document.querySelector('main, [role="main"]');
    if (!main) {
      main = document.querySelector('.wrap');
      if (main && !main.getAttribute('role')) main.setAttribute('role', 'main');
    }
    /* skip TARGET: the page's first heading lands focus at the real content
       start (past the nav, which sits inside `.wrap`); fall back to the
       landmark, then to `.wrap`. */
    var target = (main && main.querySelector('h1')) || document.querySelector('h1') || main || document.querySelector('.wrap');
    if (!target) return;               // nothing meaningful to skip to (e.g. bare overlay)
    if (!target.id) target.id = 'main-content';
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    var skip = document.createElement('a');
    skip.id = 'ui-skip-link';
    skip.className = 'ui-skip';
    skip.href = '#' + target.id;
    skip.textContent = 'Skip to content';
    /* move focus too — :target alone doesn't, and the tabindex=-1 means the
       target takes focus without showing a persistent ring afterwards. */
    skip.addEventListener('click', function (e) {
      e.preventDefault();
      try { history.replaceState(null, '', '#' + target.id); } catch (err) {}
      target.focus();
      if (target.scrollIntoView) target.scrollIntoView();
    });
    document.body.insertBefore(skip, document.body.firstChild);
  }

  /* ---- 8. page-ready glue (skip link + auto-crumb + mic buttons + reveal) ---- */
  function onPageReady() {
    injectA11yScaffold();
    autoCrumb();
    micAutoAttach();
    uiReveal(document);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }
})();
