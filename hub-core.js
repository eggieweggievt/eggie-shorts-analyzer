/* ============================================================
   hub-core.js — Eggie's Creator Hub shared core (v1)
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

  window.EggieHub = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    loadSupabaseSDK: loadSupabaseSDK,
    initAuth: initAuth
  };
})();
