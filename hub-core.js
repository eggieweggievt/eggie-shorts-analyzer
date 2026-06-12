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
    spoons: spoons
  };

  /* ---- 8. page-ready glue (auto-crumb + mic buttons) ---- */
  function onPageReady() {
    autoCrumb();
    micAutoAttach();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }
})();
