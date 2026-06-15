/* ============================================================
   hub-nav.js — animated hamburger navigation for Eggie's Creator Hub
   Drop-in: <script src="hub-nav.js"></script> before </body>.

   One shared source of truth for the whole hub. Renders a compact
   hamburger button that opens a small dropdown panel organised into
   categories + sub-items (mirrors the home page taxonomy). Works on
   every page, including index.html. Self-styled, no dependencies.

   Mount: uses the page's .back-row if present (hides the old pills),
   otherwise .top-utility, otherwise the top of .wrap / body.
   ============================================================ */
(function () {
  if (window.__hubNavInit) return;
  window.__hubNavInit = true;

  /* ---- canonical hub taxonomy (matches index.html groups) ---- */
  var HOME = { emoji: '🏠', name: 'Home', href: 'index.html' };
  var CATS = [
    { emoji: '🎬', name: 'Make & Optimize', items: [
      { emoji: '🎯', name: 'Optimizer', href: 'analyzer.html' },
      { emoji: '🖼️', name: 'Thumbnail Checker', href: 'thumbnail.html' }
    ]},
    { emoji: '🗂️', name: 'Plan & Organize', items: [
      { emoji: '📅', name: 'Content Planner', href: 'planner.html' },
      { emoji: '✓', name: 'To-Do List', href: 'todo.html' },
      { emoji: '🌸', name: 'Sustainable Habits', href: 'habits.html' },
      { emoji: '🪞', name: 'Weekly Review', href: 'review.html' },
      { emoji: '🔮', name: 'Ask My Planner', href: 'ask.html' },
      { emoji: '🎭', name: 'Debut Checklist', href: 'debut-checklist.html' },
      { emoji: '⏱️', name: 'Subathon Planner', href: 'subathon.html' }
    ]},
    { emoji: '💰', name: 'Grow & Earn', items: [
      { emoji: '💌', name: 'Media Kit', href: 'media-kit.html' },
      { emoji: '✉️', name: 'Pitch Builder', href: 'sponsor-pitch.html' },
      { emoji: '💰', name: 'Finance & Tax', href: 'finance.html' }
    ]},
    { emoji: '📚', name: 'Learn', items: [
      { emoji: '📚', name: 'Growth Playbook', href: 'growth.html' },
      { emoji: '🔍', name: 'Niche Finder', href: 'niche-quiz.html' },
      { emoji: '🔭', name: 'Competitor Scout', href: 'scout.html' }
    ]},
    { emoji: '✨', name: 'More', items: [
      { emoji: '🧰', name: 'The Toolbox', href: 'toolbox.html' },
      { emoji: '❓', name: 'FAQ & About', href: 'faq.html' },
      { emoji: '📜', name: "What's New", href: 'changelog.html' },
      { emoji: '👑', name: 'Manager Hub', href: 'manager-hub.html' }
    ]}
  ];

  /* ---- styles (injected immediately) ---- */
  var CSS = [
    '.back-row[data-hubnav]{display:none!important}',   /* hide the whole old pill row; menu mounts as a sibling */

    '.hubnav{position:relative;display:inline-flex;vertical-align:middle}',
    '.hubnav--lead{margin-right:auto;order:-1}',

    '.hubnav-burger{display:inline-flex;align-items:center;gap:9px;cursor:pointer;font-family:inherit;line-height:1;',
      'background:rgba(255,255,255,0.72);border:1.5px solid rgba(144,165,255,0.42);color:var(--deep,#4a4490);',
      'font-weight:700;font-size:13.5px;padding:8px 15px;border-radius:999px;',
      'transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s ease,background .22s ease,border-color .22s ease}',
    '.hubnav-burger:hover{background:#fff;border-color:rgba(144,165,255,0.72);transform:translateY(-1px);',
      'box-shadow:0 6px 18px rgba(144,165,255,0.38),0 0 0 3px rgba(144,165,255,0.12)}',
    '.hubnav-burger:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(144,165,255,0.4)}',
    '.hubnav.open .hubnav-burger{background:#fff;border-color:rgba(144,165,255,0.72);',
      'box-shadow:0 6px 18px rgba(144,165,255,0.32)}',

    '.hubnav-box{position:relative;display:inline-block;width:18px;height:13px;flex:0 0 auto}',
    '.hubnav-line{position:absolute;left:0;width:100%;height:2.2px;border-radius:3px;background:currentColor;',
      'transition:transform .32s cubic-bezier(.22,1,.36,1),top .32s cubic-bezier(.22,1,.36,1),opacity .2s ease}',
    '.hubnav-line:nth-child(1){top:0}',
    '.hubnav-line:nth-child(2){top:5.4px}',
    '.hubnav-line:nth-child(3){top:10.8px}',
    '.hubnav.open .hubnav-line:nth-child(1){top:5.4px;transform:rotate(45deg)}',
    '.hubnav.open .hubnav-line:nth-child(2){opacity:0;transform:translateX(-7px)}',
    '.hubnav.open .hubnav-line:nth-child(3){top:5.4px;transform:rotate(-45deg)}',

    '.hubnav-overlay{position:fixed;inset:0;z-index:7000;background:rgba(45,40,75,0.05);',
      'opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease}',
    '.hubnav.open .hubnav-overlay{opacity:1;visibility:visible}',

    '.hubnav-panel{position:absolute;top:calc(100% + 9px);left:0;z-index:7001;',
      'width:min(256px,86vw);max-height:72vh;overflow-y:auto;box-sizing:border-box;padding:7px;',
      'background:rgba(255,255,255,0.98);border:1px solid rgba(144,165,255,0.28);border-radius:16px;',
      'box-shadow:0 16px 40px rgba(120,125,200,0.26);transform-origin:top left;',
      'opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-8px) scale(.96);',
      'transition:opacity .2s ease,transform .3s cubic-bezier(.22,1,.36,1),visibility .2s ease;',
      'will-change:transform,opacity}',
    '.hubnav.open .hubnav-panel{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0) scale(1)}',
    '.hubnav-panel.flip-right{left:auto;right:0;transform-origin:top right}',

    '.hubnav-row{display:flex;align-items:center;gap:9px;text-decoration:none;padding:8px 11px;',
      'border-radius:11px;font-size:13.5px;font-weight:600;color:var(--deep,#4a4490);',
      'transition:background .15s ease,box-shadow .2s ease,transform .14s cubic-bezier(.22,1,.36,1)}',
    '.hubnav-row .he{width:20px;flex:0 0 auto;text-align:center;font-size:15px}',
    '.hubnav-row:hover{background:rgba(144,165,255,0.12);transform:translateX(2px);',
      'box-shadow:0 0 0 1px rgba(144,165,255,0.22),0 6px 16px rgba(144,165,255,0.3)}',
    '.hubnav-home{font-weight:700;background:rgba(144,165,255,0.08)}',
    '.hubnav-row.active{color:#fff;border-color:transparent;',
      'background:linear-gradient(135deg,#ff9ec8,#9aa6ff 58%,#8fe3d0);box-shadow:0 5px 16px rgba(144,165,255,0.36)}',
    '.hubnav-row.active:hover{transform:translateX(0);box-shadow:0 7px 20px rgba(144,165,255,0.42)}',

    '.hubnav-cat{margin:10px 6px 3px;font-size:10.5px;font-weight:800;letter-spacing:.7px;',
      'text-transform:uppercase;color:#9a93cf;display:flex;align-items:center;gap:6px}',
    '.hubnav-cat .he{font-size:12px}',
    '.hubnav-sep{height:1px;margin:7px 4px 0;background:rgba(144,165,255,0.16)}',

    /* ⚡ quick idea capture */
    '.hubnav-quick{width:100%;border:none;background:rgba(255,178,240,0.14);cursor:pointer;text-align:left;',
      'font-family:inherit;font-size:13.5px;font-weight:700;margin-top:2px}',
    '.hubnav-quick:hover{background:rgba(255,178,240,0.28)}',
    '.hubnav-qform{padding:7px 6px 4px;display:none}',
    '.hubnav-qform.open{display:block}',
    '.hubnav-qi{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;',
      'border:1.5px solid rgba(144,165,255,0.4);font-family:inherit;font-size:13px;font-weight:600;',
      'color:var(--deep,#4a4490);background:#fff}',
    '.hubnav-qi:focus{outline:none;border-color:rgba(255,178,240,0.9);box-shadow:0 0 0 3px rgba(255,178,240,0.25)}',
    '.hubnav-qrow{display:flex;align-items:center;gap:8px;margin-top:6px}',
    '.hubnav-qsave{border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:12px;color:#fff;',
      'padding:6px 14px;border-radius:999px;background:linear-gradient(135deg,#ff9ec8,#9aa6ff)}',
    '.hubnav-qsave:disabled{opacity:.6;cursor:default}',
    '.hubnav-qmsg{font-size:11.5px;font-weight:700;color:#6b5f8a}',

    /* ♿ accessibility modes, reachable from the menu on every page (the mode
       pills used to live only on the home page's top-utility row) */
    '.hubnav-a11y{display:flex;flex-wrap:wrap;gap:6px;padding:4px 6px 8px}',
    '.hubnav-a11y .a11y-toggle{font-size:12px;padding:7px 12px}',

    '@media print{.hubnav,.back-row[data-hubnav]{display:none!important}}',
    'body.public-mode .hubnav{display:none!important}',
    '@media (prefers-reduced-motion:reduce){',
      '.hubnav-line,.hubnav-panel,.hubnav-overlay,.hubnav-burger,.hubnav-row{transition-duration:.01ms!important}}'
  ].join('');

  var style = document.createElement('style');
  style.id = 'hubnav-css';
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  function fileOf(href) {
    return (href || '').split('#')[0].split('/').pop().toLowerCase();
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function init() {
    if (document.querySelector('.hubnav')) return;

    var host = document.querySelector('.back-row');
    var isBackRow = !!host;
    if (!host) host = document.querySelector('.top-utility') || document.querySelector('.wrap') || document.body;
    if (!host) return;
    if (isBackRow) host.dataset.hubnav = '1';

    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (here === '') here = 'index.html';

    /* find the active item's display name for the burger label */
    var activeName = null;
    if (fileOf(HOME.href) === here) activeName = HOME.name;
    CATS.forEach(function (cat) {
      cat.items.forEach(function (it) { if (fileOf(it.href) === here) activeName = it.name; });
    });

    var wrap = document.createElement('div');
    wrap.className = 'hubnav';

    var burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'hubnav-burger';
    burger.setAttribute('aria-label', 'Open navigation menu');
    burger.setAttribute('aria-haspopup', 'true');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML =
      '<span class="hubnav-box" aria-hidden="true"><span class="hubnav-line"></span>' +
      '<span class="hubnav-line"></span><span class="hubnav-line"></span></span>' +
      '<span class="hubnav-burger-label">' + esc(activeName || 'Menu') + '</span>';

    var overlay = document.createElement('div');
    overlay.className = 'hubnav-overlay';

    var panel = document.createElement('div');
    panel.className = 'hubnav-panel';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'Site navigation');

    var html = '';
    html += rowHTML(HOME, here, 'hubnav-home');
    /* ⚡ quick idea capture — saves a title straight into the planner's Idea column */
    html += '<button class="hubnav-row hubnav-quick" type="button" title="Save an idea straight to your planner">' +
      '<span class="he" aria-hidden="true">⚡</span><span>Quick idea → Planner</span></button>';
    html += '<div class="hubnav-qform">' +
      '<input class="hubnav-qi" type="text" maxlength="140" placeholder="Idea title… (Enter to save)">' +
      '<div class="hubnav-qrow"><button type="button" class="hubnav-qsave">Save idea</button>' +
      '<span class="hubnav-qmsg" aria-live="polite"></span></div></div>';
    CATS.forEach(function (cat) {
      html += '<div class="hubnav-cat"><span class="he" aria-hidden="true">' + cat.emoji + '</span>' + esc(cat.name) + '</div>';
      cat.items.forEach(function (it) { html += rowHTML(it, here, ''); });
    });
    /* ♿ accessibility modes — only when a11y-modes.js is on the page. The
       empty mount is filled by HubA11y.refresh() once the panel is in the DOM
       (below), so dark / dyslexia / tint / low-stim / focus are reachable from
       the menu on every page, not just the home screen. */
    if (window.HubA11y) {
      html += '<div class="hubnav-sep"></div>';
      html += '<div class="hubnav-cat"><span class="he" aria-hidden="true">♿</span>Accessibility</div>';
      html += '<div class="hubnav-a11y" data-a11y-toggles></div>';
    }
    panel.innerHTML = html;

    wrap.appendChild(burger);
    wrap.appendChild(overlay);
    wrap.appendChild(panel);
    initQuickCapture(panel);

    if (isBackRow) {
      /* mount as a SIBLING before the old pill row (which we hide), so page-level
         selectors like ".back-row a" can't leak onto the dropdown's links */
      (host.parentNode || document.body).insertBefore(wrap, host);
    } else {
      wrap.classList.add('hubnav--lead');   /* push to the left edge of the row (e.g. home page) */
      host.insertBefore(wrap, host.firstChild);
    }

    /* fill the ♿ section now that the panel (and its [data-a11y-toggles] mount)
       is in the document. Idempotent + safe if a11y-modes.js isn't present. */
    if (window.HubA11y && window.HubA11y.refresh) window.HubA11y.refresh();

    /* flip the panel to the right edge if it would overflow the viewport */
    function place() {
      panel.classList.remove('flip-right');
      var r = wrap.getBoundingClientRect();
      if (r.left + 256 > window.innerWidth - 8) panel.classList.add('flip-right');
    }

    function open() {
      place();
      wrap.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      var first = panel.querySelector('a');
      if (first) setTimeout(function () { first.focus(); }, 70);
    }
    function shut() {
      wrap.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.contains('open') ? shut() : open();
    });
    overlay.addEventListener('click', shut);
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) shut(); });
    document.addEventListener('click', function (e) {
      if (wrap.classList.contains('open') && !wrap.contains(e.target)) shut();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && wrap.classList.contains('open')) { shut(); burger.focus(); }
    });
    window.addEventListener('resize', function () { if (wrap.classList.contains('open')) place(); });
  }

  /* ---- ⚡ quick idea capture → planner_items (status 'idea') ----
     Uses its own lightweight Supabase client (same pattern as
     account-menu.js). autoRefreshToken is OFF so it never races the
     page's own client — it just reads the stored session. In demo
     mode (?demo=1) window.supabase is the mock, so ideas land in the
     sandbox planner, never the live one. */
  var SUPABASE_URL = 'https://okrheyotpypulweedhda.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_0rkBrgHykkh_F4bfICiRWA_crhItSlH';
  var quickSb = null;
  function quickClient() {
    return new Promise(function (resolve, reject) {
      if (quickSb) return resolve(quickSb);
      function make() {
        try {
          quickSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
            { auth: { persistSession: true, autoRefreshToken: false } });
          resolve(quickSb);
        } catch (e) { reject(e); }
      }
      if (window.supabase && window.supabase.createClient) return make();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = make;
      s.onerror = function () { reject(new Error('SDK load failed')); };
      document.head.appendChild(s);
    });
  }
  function initQuickCapture(panel) {
    var btn = panel.querySelector('.hubnav-quick');
    var form = panel.querySelector('.hubnav-qform');
    var input = panel.querySelector('.hubnav-qi');
    var save = panel.querySelector('.hubnav-qsave');
    var msg = panel.querySelector('.hubnav-qmsg');
    if (!btn || !form || !input || !save || !msg) return;
    function setMsg(t) { msg.textContent = t || ''; }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      form.classList.toggle('open');
      if (form.classList.contains('open')) setTimeout(function () { input.focus(); }, 60);
    });
    function saveIdea() {
      var title = (input.value || '').trim();
      if (!title) { setMsg('Type an idea first 🐣'); input.focus(); return; }
      save.disabled = true; setMsg('Saving…');
      quickClient().then(function (sb) {
        return sb.auth.getSession().then(function (r) {
          var user = r && r.data && r.data.session && r.data.session.user;
          if (!user) { setMsg('Sign in on any tool page first 💗'); save.disabled = false; return; }
          return sb.from('planner_items')
            .insert({ owner_id: user.id, title: title, status: 'idea' })
            .then(function (res) {
              save.disabled = false;
              if (res && res.error) {
                console.warn('[Hub quick idea] save failed:', res.error);
                setMsg('Save failed — try inside the Planner.');
                return;
              }
              input.value = '';
              setMsg('✨ Saved to your Idea column!');
              setTimeout(function () { setMsg(''); }, 3500);
            });
        });
      }).catch(function (e) {
        console.warn('[Hub quick idea]', e);
        save.disabled = false;
        setMsg('Save failed — try inside the Planner.');
      });
    }
    save.addEventListener('click', function (e) { e.stopPropagation(); saveIdea(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveIdea(); }
      e.stopPropagation();   // typing (incl. Escape) shouldn't close the menu
    });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  function rowHTML(item, here, extra) {
    var active = !item.ext && fileOf(item.href) === here ? ' active' : '';
    var aria = active ? ' aria-current="page"' : '';
    var ext = item.ext ? ' target="_blank" rel="noopener"' : '';
    var suffix = item.ext ? ' ↗' : '';
    return '<a class="hubnav-row ' + extra + active + '" role="menuitem" href="' + esc(item.href) + '"' + aria + ext + '>' +
      '<span class="he" aria-hidden="true">' + item.emoji + '</span><span>' + esc(item.name) + suffix + '</span></a>';
  }

  /* script sits at end of <body>, so the DOM is ready — run now (idempotent),
     with a DOMContentLoaded fallback for safety. */
  init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
})();
