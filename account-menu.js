/* ============================================================
   account-menu.js — shared signed-in account menu for the Creator Hub.

   When you're signed in, this renders a "🐙 yourname" pill in the top-right
   corner of every page. Clicking the name goes to your Creator Memory profile
   (brand-memory.html); hovering it (or tapping on touch screens) opens a small
   dropdown with a profile link and a Sign-out button.

   It is SELF-CONTAINED and SAFE TO SHIP:
     • Does nothing until a real session exists (no session → no menu).
     • Creates its own Supabase client off the SAME shared session, so signing
       out here signs you out everywhere (each page already listens for that).
     • Hides the older plain "name" pills (#authPill / #siteAuthPill) while it's
       active so there's never a duplicate. The signed-OUT "Sign in" pill is left
       untouched, so the existing magic-link flow still works.
     • Skips the Analyzer, which has its own richer account menu (sticky tags +
       saved runs). The Analyzer keeps that menu; a profile link was added to it
       separately.
     • Respects demo mode: in ?demo=1 it uses the demo session and keeps the
       sticky ?demo=1 flag on its links.

   Include once per page, e.g. right next to hub-nav.js:
     <script src="account-menu.js" defer></script>
   ============================================================ */
(function () {
  'use strict';
  if (window.__eggieAccountMenu) return;          // guard against double-include
  window.__eggieAccountMenu = true;

  var SUPABASE_URL      = 'https://okrheyotpypulweedhda.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_0rkBrgHykkh_F4bfICiRWA_crhItSlH';
  var PROFILE_PAGE      = 'brand-memory.html';     // "Creator profile" target

  // If a page has the Analyzer's own rich account menu, leave it alone.
  var SKIP_IF_PRESENT = '.eb-auth-pill';

  var sb = null;
  var els = null;

  // Keep the ?demo=1 sandbox flag sticky on our own links.
  function withDemo(url) {
    try {
      if (/[?&]demo=1/.test(location.search)) {
        return url + (url.indexOf('?') > -1 ? '&' : '?') + 'demo=1';
      }
    } catch (e) {}
    return url;
  }

  function injectStyle() {
    if (document.getElementById('eggie-acct-style')) return;
    var css =
      '.eggie-acct{position:fixed;top:14px;right:14px;z-index:9998;font-family:' +
      "'Quicksand',system-ui,-apple-system,sans-serif}" +
      '.eggie-acct-trigger{display:inline-flex;align-items:center;gap:6px;' +
      'padding:8px 14px;border-radius:999px;background:rgba(255,255,255,0.92);' +
      'border:2px solid rgba(144,165,255,0.45);color:var(--deep,#4D5BC0);' +
      'font-weight:800;font-size:13px;text-decoration:none;cursor:pointer;' +
      'box-shadow:0 8px 32px rgba(99,170,244,0.18),0 2px 8px rgba(255,178,240,0.15);' +
      'transition:transform .12s ease,filter .12s ease,border-color .15s ease}' +
      '.eggie-acct-trigger:hover{transform:translateY(-1px);filter:brightness(1.03);' +
      'border-color:rgba(255,178,240,0.6)}' +
      '.eggie-acct-trigger:focus-visible{outline:2px solid var(--periwinkle,#90A5FF);outline-offset:2px}' +
      '.eggie-acct-name{max-width:42vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.eggie-acct-caret{font-size:10px;opacity:.7;transition:transform .2s ease}' +
      '.eggie-acct.open .eggie-acct-caret{transform:rotate(180deg)}' +
      '.eggie-acct-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:208px;' +
      'background:#fff;border:1.5px solid rgba(255,178,240,0.5);border-radius:14px;' +
      'box-shadow:0 16px 44px rgba(99,170,244,0.26),0 4px 12px rgba(255,178,240,0.22);' +
      'padding:7px;opacity:0;visibility:hidden;transform:translateY(-6px);' +
      'transition:opacity .15s ease,transform .15s ease,visibility .15s;}' +
      /* invisible bridge over the gap so hovering trigger→menu doesn't flicker closed */
      '.eggie-acct-menu::before{content:"";position:absolute;left:0;right:0;top:-10px;height:10px}' +
      '.eggie-acct.open>.eggie-acct-menu,.eggie-acct:focus-within>.eggie-acct-menu{' +
      'opacity:1;visibility:visible;transform:translateY(0)}' +
      '@media (hover:hover){.eggie-acct:hover>.eggie-acct-menu{opacity:1;visibility:visible;transform:translateY(0)}}' +
      '.eggie-acct-head{padding:7px 12px 9px;border-bottom:1px solid rgba(144,165,255,0.22);margin-bottom:5px}' +
      '.eggie-acct-head .lbl{display:block;font-size:10.5px;font-weight:800;letter-spacing:.04em;' +
      'text-transform:uppercase;color:var(--periwinkle,#90A5FF)}' +
      '.eggie-acct-email{display:block;font-size:12.5px;color:var(--ink-soft,#6b5f8a);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}' +
      '.eggie-acct-item{display:flex;align-items:center;gap:9px;width:100%;box-sizing:border-box;' +
      'padding:9px 12px;border:none;background:none;border-radius:9px;cursor:pointer;' +
      'font:inherit;font-size:13.5px;font-weight:700;color:var(--ink,#3a2a5a);' +
      'text-align:left;text-decoration:none}' +
      '.eggie-acct-item:hover{background:rgba(144,165,255,0.14)}' +
      '.eggie-acct-item:focus-visible{outline:2px solid var(--periwinkle,#90A5FF);outline-offset:-2px}' +
      '.eggie-acct-signout{color:#b5306b}' +
      '.eggie-acct-signout:hover{background:rgba(255,178,240,0.22)}' +
      /* Hide the older plain name pills while our menu is active (no duplicates). */
      'html.eggie-acct-on #authPill,html.eggie-acct-on #siteAuthPill{display:none !important}';
    var st = document.createElement('style');
    st.id = 'eggie-acct-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function buildDom() {
    if (els) return els;
    injectStyle();
    var root = document.createElement('div');
    root.className = 'eggie-acct';
    root.id = 'eggieAcct';
    root.style.display = 'none';

    var profileHref = withDemo(PROFILE_PAGE);
    root.innerHTML =
      '<a class="eggie-acct-trigger" href="' + profileHref + '" aria-haspopup="true" ' +
      'aria-expanded="false" title="Open your Creator Memory profile">' +
        '<span class="eggie-acct-name">🐙</span>' +
        '<span class="eggie-acct-caret" aria-hidden="true">▾</span>' +
      '</a>' +
      '<div class="eggie-acct-menu" role="menu">' +
        '<div class="eggie-acct-head"><span class="lbl">Signed in</span>' +
          '<span class="eggie-acct-email"></span></div>' +
        '<a class="eggie-acct-item" role="menuitem" href="' + profileHref + '">🧠 Creator Memory</a>' +
        '<button type="button" class="eggie-acct-item eggie-acct-signout" role="menuitem">🚪 Sign out</button>' +
      '</div>';
    document.body.appendChild(root);

    els = {
      root: root,
      trigger: root.querySelector('.eggie-acct-trigger'),
      name: root.querySelector('.eggie-acct-name'),
      email: root.querySelector('.eggie-acct-email'),
      menu: root.querySelector('.eggie-acct-menu'),
      signout: root.querySelector('.eggie-acct-signout')
    };

    var hoverable = window.matchMedia && window.matchMedia('(hover:hover)').matches;

    function setOpen(open) {
      els.root.classList.toggle('open', open);
      els.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    // On touch (no hover), the name taps open the menu instead of navigating,
    // so Sign out stays reachable. The "Creator Memory" item is the explicit nav.
    els.trigger.addEventListener('click', function (e) {
      if (!hoverable) {
        e.preventDefault();
        setOpen(!els.root.classList.contains('open'));
      }
    });

    els.signout.addEventListener('click', function (e) {
      e.preventDefault();
      setOpen(false);
      signOut();
    });

    // Close on outside click / Escape (matters on touch).
    document.addEventListener('click', function (e) {
      if (!els.root.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    return els;
  }

  function showUser(user) {
    buildDom();
    var handle = (user.email || '').split('@')[0] || 'you';
    els.name.textContent = '🐙 ' + handle;
    els.email.textContent = user.email || '';
    els.root.style.display = '';
    document.documentElement.classList.add('eggie-acct-on');
  }

  function hideMenu() {
    if (els) {
      els.root.style.display = 'none';
      els.root.classList.remove('open');
    }
    document.documentElement.classList.remove('eggie-acct-on');
  }

  async function signOut() {
    try { if (sb) await sb.auth.signOut(); }
    catch (e) { console.warn('[account-menu] sign-out failed:', e); }
    // Each page listens to onAuthStateChange and resets its own UI; our own
    // listener will hide this menu. No reload needed.
  }

  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase) return resolve(window.supabase);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = function () { window.supabase ? resolve(window.supabase) : reject(new Error('SDK missing')); };
      s.onerror = function () { reject(new Error('Failed to load Supabase SDK')); };
      document.head.appendChild(s);
    });
  }

  function applyUser(user) {
    if (user && user.email) showUser(user);
    else hideMenu();
  }

  async function init() {
    // Leave the Analyzer's own richer account menu alone.
    if (document.querySelector(SKIP_IF_PRESENT)) return;
    try {
      var lib = await loadSdk();
      sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      var res = await sb.auth.getSession();
      applyUser(res && res.data && res.data.session ? res.data.session.user : null);
      sb.auth.onAuthStateChange(function (_event, session) {
        applyUser(session ? session.user : null);
      });
    } catch (e) {
      console.warn('[account-menu] init skipped:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
