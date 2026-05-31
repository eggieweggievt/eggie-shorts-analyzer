/* ============================================================================
   Eggie's Creator Hub — DEMO MODE shim
   ----------------------------------------------------------------------------
   PURPOSE
     A safe, self-contained local sandbox for testing changes before they ship.
     When active, it replaces the real Supabase client with an in-browser mock:
       • You're "signed in" as a fake demo user automatically.
       • All reads/writes go to localStorage — NOTHING touches your live hub.
       • No network, no magic-link email, no real data ever changes.

   HOW IT TURNS ON
     Only when the page URL contains ?demo=1  (or once you're already inside a
     demo session, it stays sticky via sessionStorage). On the real site with no
     ?demo=1, this file does nothing at all — it returns on the first line. That
     means it is 100% safe to deploy to production alongside everything else.

   HOW TO USE
     Double-click DEMO.html. Everything you click stays in demo mode.

   This file is loaded as the FIRST script in <head> on every page so it can
   define window.supabase before any page code calls createClient().
   ========================================================================== */
(function () {
  'use strict';

  // ---- 1. ACTIVATION GATE -------------------------------------------------
  var qs = location.search || '';
  var STICKY_KEY = '__eggie_demo_mode';
  var sticky = false;
  try { sticky = sessionStorage.getItem(STICKY_KEY) === '1'; } catch (e) {}
  var DEMO = /[?&]demo=1\b/.test(qs) || sticky;

  if (!DEMO) return; // ← PRODUCTION PATH: do nothing.

  try { sessionStorage.setItem(STICKY_KEY, '1'); } catch (e) {}
  console.log('%c🧪 EGGIE DEMO MODE ACTIVE — using mock data, live hub untouched.',
    'background:#FFB2F0;color:#3a2a5a;font-weight:bold;padding:2px 8px;border-radius:6px;');

  // ---- 2. FAKE IDENTITY ----------------------------------------------------
  var DEMO_USER = {
    id: 'demo-user-eggie-0001',
    email: 'demo@eggieweggie.ca',
    user_metadata: { name: 'Demo Eggie' },
    app_metadata: { provider: 'demo' },
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z'
  };
  var DEMO_SESSION = {
    access_token: 'demo-access-token',
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: DEMO_USER
  };

  // ---- 3. LOCALSTORAGE-BACKED MOCK TABLES ----------------------------------
  var NS = 'eggie_demo::';
  function loadTable(t) {
    try {
      var raw = localStorage.getItem(NS + t);
      if (raw != null) return JSON.parse(raw);
    } catch (e) {}
    var seed = (SEEDS[t] || []).map(function (r) { return Object.assign({}, r); });
    saveTable(t, seed);
    return seed;
  }
  function saveTable(t, rows) {
    try { localStorage.setItem(NS + t, JSON.stringify(rows)); } catch (e) {}
  }
  function uid() {
    return 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // Seed data — only the flagship planner gets sample cards; everything else
  // starts empty and fills in as you use it. Add more here anytime.
  var U = DEMO_USER.id;
  var nowISO = new Date().toISOString();
  var SEEDS = {
    planner_items: [
      { id: 'seed-1', owner_id: U, title: 'Why I switched to a sustainable upload schedule', status: 'idea',
        platforms: ['youtube', 'tiktok'], hook: 'I was burning out posting daily — here\'s what I do now.',
        description: 'Talking-head short on spoon-theory content planning.', is_priority: true,
        scheduled_at: null, posted_at: null, analyzer_score: null, attachments: [], additional_assets: [],
        sort: 0, created_at: nowISO },
      { id: 'seed-2', owner_id: U, title: 'Reacting to my FIRST ever VTuber clip 🐙', status: 'recording',
        platforms: ['youtube'], hook: 'Baby Eggie was... a lot.', description: 'Nostalgia reaction.',
        is_priority: false, attachments: [], additional_assets: [], sort: 0, created_at: nowISO },
      { id: 'seed-3', owner_id: U, title: '3 thumbnail mistakes that killed my CTR', status: 'editing',
        platforms: ['youtube', 'instagram'], hook: 'Number 2 cost me thousands of views.',
        description: 'Educational short, paired with the thumbnail checker.', is_priority: false,
        assignee_email: 'editor@example.com', attachments: [], additional_assets: [], sort: 0, created_at: nowISO },
      { id: 'seed-4', owner_id: U, title: 'Cozy late-night art stream highlights', status: 'scheduled',
        platforms: ['tiktok'], hook: 'POV: it\'s 2am and we\'re still painting.',
        description: 'Stream-to-short edit.', is_priority: false, scheduled_at: nowISO,
        attachments: [], additional_assets: [], sort: 0, created_at: nowISO },
      { id: 'seed-5', owner_id: U, title: 'My honest 6-month growth numbers', status: 'posted',
        platforms: ['youtube'], hook: 'No clickbait — the real graph.', description: 'Transparency short.',
        is_priority: false, posted_at: nowISO, analyzer_score: 82, attachments: [], additional_assets: [],
        sort: 0, created_at: nowISO }
    ]
    // Other tables (todos, finance, habits, media kit, etc.) intentionally
    // start empty — the pages handle empty state gracefully.
  };

  // ---- 4. CHAINABLE QUERY BUILDER (mimics PostgREST) -----------------------
  function QueryBuilder(table) {
    this.table = table;
    this._filters = [];
    this._order = null;
    this._limit = null;
    this._op = 'select';
    this._payload = null;
    this._returning = false;
    this._maybe = false;
    this._single = false;
    this._upsertOpts = {};
  }
  var QP = QueryBuilder.prototype;
  // mutations
  QP.select = function () { this._returning = true; return this; };
  QP.insert = function (p) { this._op = 'insert'; this._payload = p; return this; };
  QP.update = function (p) { this._op = 'update'; this._payload = p; return this; };
  QP.upsert = function (p, o) { this._op = 'upsert'; this._payload = p; this._upsertOpts = o || {}; return this; };
  QP.delete = function () { this._op = 'delete'; return this; };
  // filters (only the common ones need real behaviour; the rest are no-ops)
  QP.eq = function (c, v) { this._filters.push(function (r) { return r[c] === v; }); return this; };
  QP.neq = function (c, v) { this._filters.push(function (r) { return r[c] !== v; }); return this; };
  QP.gt = function (c, v) { this._filters.push(function (r) { return r[c] > v; }); return this; };
  QP.gte = function (c, v) { this._filters.push(function (r) { return r[c] >= v; }); return this; };
  QP.lt = function (c, v) { this._filters.push(function (r) { return r[c] < v; }); return this; };
  QP.lte = function (c, v) { this._filters.push(function (r) { return r[c] <= v; }); return this; };
  QP.is = function (c, v) { this._filters.push(function (r) { return v === null ? (r[c] == null) : (r[c] === v); }); return this; };
  QP['in'] = function (c, arr) { this._filters.push(function (r) { return Array.isArray(arr) && arr.indexOf(r[c]) > -1; }); return this; };
  QP.like = QP.ilike = function (c, pat) {
    var re = new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
    this._filters.push(function (r) { return re.test(String(r[c] == null ? '' : r[c])); }); return this;
  };
  QP.contains = QP.containedBy = QP.overlaps = function () { return this; };
  QP.filter = QP.match = QP.not = QP.or = function () { return this; };
  QP.order = function (c, o) { this._order = { c: c, asc: !(o && o.ascending === false) }; return this; };
  QP.limit = function (n) { this._limit = n; return this; };
  QP.range = function () { return this; };
  // terminals
  QP.maybeSingle = function () { this._maybe = true; return this._exec(); };
  QP.single = function () { this._single = true; return this._exec(); };
  QP.csv = function () { return this._exec(); };
  QP.then = function (res, rej) { return this._exec().then(res, rej); };
  QP['catch'] = function (rej) { return this._exec()['catch'](rej); };
  QP['finally'] = function (cb) { return this._exec()['finally'](cb); };

  QP._matches = function (row) {
    for (var i = 0; i < this._filters.length; i++) { if (!this._filters[i](row)) return false; }
    return true;
  };
  QP._exec = function () {
    var self = this;
    return new Promise(function (resolve) {
      var rows = loadTable(self.table);
      var result;
      var i, normalized, payload;

      if (self._op === 'select') {
        result = rows.filter(function (r) { return self._matches(r); });
      } else if (self._op === 'insert' || self._op === 'upsert') {
        payload = Array.isArray(self._payload) ? self._payload : [self._payload];
        normalized = [];
        var conflictCol = (self._upsertOpts && self._upsertOpts.onConflict) || 'id';
        payload.forEach(function (p) {
          var row = Object.assign({}, p);
          if (row.created_at == null) row.created_at = new Date().toISOString();
          row.updated_at = new Date().toISOString();
          var idx = -1;
          if (self._op === 'upsert') {
            idx = rows.findIndex(function (r) { return r[conflictCol] != null && r[conflictCol] === row[conflictCol]; });
          } else if (row.id != null) {
            idx = rows.findIndex(function (r) { return r.id === row.id; });
          }
          if (idx > -1) { rows[idx] = Object.assign({}, rows[idx], row); normalized.push(rows[idx]); }
          else { if (row.id == null) row.id = uid(); rows.push(row); normalized.push(row); }
        });
        saveTable(self.table, rows);
        result = normalized;
      } else if (self._op === 'update') {
        result = [];
        for (i = 0; i < rows.length; i++) {
          if (self._matches(rows[i])) {
            rows[i] = Object.assign({}, rows[i], self._payload, { updated_at: new Date().toISOString() });
            result.push(rows[i]);
          }
        }
        saveTable(self.table, rows);
      } else if (self._op === 'delete') {
        result = [];
        var kept = [];
        for (i = 0; i < rows.length; i++) {
          if (self._matches(rows[i])) result.push(rows[i]); else kept.push(rows[i]);
        }
        saveTable(self.table, kept);
      } else {
        result = [];
      }

      // ordering + limit (select only)
      if (self._op === 'select') {
        if (self._order) {
          var c = self._order.c, asc = self._order.asc;
          result.sort(function (a, b) {
            var av = a[c], bv = b[c];
            if (av == null && bv == null) return 0;
            if (av == null) return asc ? -1 : 1;
            if (bv == null) return asc ? 1 : -1;
            if (av < bv) return asc ? -1 : 1;
            if (av > bv) return asc ? 1 : -1;
            return 0;
          });
        }
        if (self._limit != null) result = result.slice(0, self._limit);
      }

      // package the response in PostgREST's {data,error} shape
      if (self._maybe) return resolve({ data: result[0] || null, error: null });
      if (self._single) {
        if (result[0] != null) return resolve({ data: result[0], error: null });
        return resolve({ data: null, error: { message: 'No rows found (demo)', code: 'PGRST116' } });
      }
      var wantsRows = (self._op === 'select') || self._returning;
      resolve({ data: wantsRows ? result : null, error: null, count: result.length });
    });
  };

  // ---- 5. AUTH -------------------------------------------------------------
  var authListeners = [];
  function fire(event, session) {
    authListeners.forEach(function (cb) { try { cb(event, session); } catch (e) {} });
  }
  var auth = {
    getSession: function () { return Promise.resolve({ data: { session: DEMO_SESSION }, error: null }); },
    getUser: function () { return Promise.resolve({ data: { user: DEMO_USER }, error: null }); },
    onAuthStateChange: function (cb) {
      authListeners.push(cb);
      setTimeout(function () { try { cb('SIGNED_IN', DEMO_SESSION); } catch (e) {} }, 0);
      return { data: { subscription: { unsubscribe: function () {
        var i = authListeners.indexOf(cb); if (i > -1) authListeners.splice(i, 1);
      } } } };
    },
    signInWithOtp: function () {
      // No email is sent in demo — just re-affirm the signed-in state.
      setTimeout(function () { fire('SIGNED_IN', DEMO_SESSION); }, 150);
      return Promise.resolve({ data: { user: DEMO_USER, session: DEMO_SESSION }, error: null });
    },
    verifyOtp: function () { return Promise.resolve({ data: { user: DEMO_USER, session: DEMO_SESSION }, error: null }); },
    setSession: function () { return Promise.resolve({ data: { session: DEMO_SESSION }, error: null }); },
    refreshSession: function () { return Promise.resolve({ data: { session: DEMO_SESSION }, error: null }); },
    exchangeCodeForSession: function () { return Promise.resolve({ data: { session: DEMO_SESSION }, error: null }); },
    signOut: function () {
      setTimeout(function () { fire('SIGNED_OUT', null); }, 0);
      return Promise.resolve({ error: null });
    }
  };

  // ---- 6. RPC / STORAGE / REALTIME / EDGE FUNCTIONS ------------------------
  var RPC_HANDLERS = {
    planner_list_my_delegations: function () { return []; },
    planner_manager_peek_invite: function () { return null; },
    planner_manager_claim_invite: function () { return { ok: false, reason: 'demo' }; },
    planner_is_manager_of: function () { return false; },
    planner_media_kit_peek: function () { return null; },
    planner_media_kit_claim_slug: function () { return true; }
  };
  function rpc(name, params) {
    var h = RPC_HANDLERS[name];
    return Promise.resolve({ data: h ? h(params) : null, error: null });
  }

  var storage = {
    from: function () {
      return {
        upload: function (path) { return Promise.resolve({ data: { path: path, fullPath: path }, error: null }); },
        createSignedUrl: function () { return Promise.resolve({ data: { signedUrl: '#demo-file' }, error: null }); },
        createSignedUrls: function () { return Promise.resolve({ data: [], error: null }); },
        getPublicUrl: function (path) { return { data: { publicUrl: '#demo-file/' + path } }; },
        download: function () { return Promise.resolve({ data: new Blob(), error: null }); },
        remove: function () { return Promise.resolve({ data: [], error: null }); },
        list: function () { return Promise.resolve({ data: [], error: null }); }
      };
    }
  };

  function channel() {
    var ch = {
      on: function () { return ch; },
      subscribe: function (cb) { if (typeof cb === 'function') setTimeout(function () { cb('SUBSCRIBED'); }, 0); return ch; },
      unsubscribe: function () { return Promise.resolve('ok'); },
      send: function () { return ch; }
    };
    return ch;
  }

  var functions = {
    invoke: function () { return Promise.resolve({ data: { results: [], items: [], matches: [] }, error: null }); }
  };

  // ---- 7. ASSEMBLE THE MOCK CLIENT & LOCK IT IN ---------------------------
  var mockClient = {
    auth: auth,
    from: function (t) { return new QueryBuilder(t); },
    rpc: rpc,
    storage: storage,
    functions: functions,
    channel: channel,
    removeChannel: function () { return Promise.resolve('ok'); },
    removeAllChannels: function () { return Promise.resolve('ok'); },
    getChannels: function () { return []; }
  };
  var stub = { createClient: function () { return mockClient; } };
  try {
    Object.defineProperty(window, 'supabase', { value: stub, writable: false, configurable: false });
  } catch (e) {
    window.supabase = stub; // fallback
  }

  // ---- 8. KEEP NAVIGATION INSIDE THE DEMO ---------------------------------
  function withDemo(href) {
    // only rewrite same-page-relative .html links
    if (!href) return href;
    if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return href;
    if (!/\.html(\?|#|$)/i.test(href)) return href;
    if (/[?&]demo=1\b/.test(href)) return href;
    return href + (href.indexOf('?') > -1 ? '&' : '?') + 'demo=1';
  }
  function sweepLinks(root) {
    (root || document).querySelectorAll('a[href]').forEach(function (a) {
      var raw = a.getAttribute('href');
      var fixed = withDemo(raw);
      if (fixed !== raw) a.setAttribute('href', fixed);
    });
  }

  // ---- 9. ON-SCREEN BANNER ------------------------------------------------
  function buildBanner() {
    if (document.getElementById('__eggie_demo_banner')) return;
    var bar = document.createElement('div');
    bar.id = '__eggie_demo_banner';
    bar.innerHTML =
      '<span style="font-weight:700;">🧪 DEMO MODE</span>' +
      '<span style="opacity:.85;">Sample data — nothing here touches your real hub.</span>' +
      '<button id="__eggie_demo_reset" type="button">↻ Reset demo data</button>' +
      '<button id="__eggie_demo_exit" type="button">✕ Exit demo</button>';
    var s = bar.style;
    s.position = 'fixed'; s.left = '0'; s.right = '0'; s.bottom = '0'; s.zIndex = '2147483647';
    s.display = 'flex'; s.gap = '12px'; s.alignItems = 'center'; s.justifyContent = 'center';
    s.flexWrap = 'wrap';
    s.padding = '8px 14px';
    s.background = 'linear-gradient(90deg,#FFB2F0,#90A5FF,#6BE4EA)';
    s.color = '#3a2a5a';
    s.font = '600 13px/1.3 Quicksand, system-ui, sans-serif';
    s.boxShadow = '0 -4px 18px rgba(77,91,192,.28)';
    s.borderTop = '2px solid rgba(255,255,255,.6)';
    document.body.appendChild(bar);
    var btnCss = 'cursor:pointer;border:none;border-radius:999px;padding:4px 12px;font:inherit;' +
      'background:rgba(255,255,255,.85);color:#4D5BC0;font-weight:700;';
    var reset = document.getElementById('__eggie_demo_reset');
    var exit = document.getElementById('__eggie_demo_exit');
    reset.style.cssText = btnCss; exit.style.cssText = btnCss;
    reset.onclick = function () {
      if (!confirm('Reset all demo data back to the starting sample set?')) return;
      try {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf(NS) === 0) localStorage.removeItem(k); });
      } catch (e) {}
      location.reload();
    };
    exit.onclick = function () {
      try { sessionStorage.removeItem(STICKY_KEY); } catch (e) {}
      location.href = 'index.html';
    };
    // nudge content up a touch so the bar never hides a footer control
    if (!document.getElementById('__eggie_demo_pad')) {
      var pad = document.createElement('style');
      pad.id = '__eggie_demo_pad';
      pad.textContent = 'body{padding-bottom:52px !important;}';
      document.head.appendChild(pad);
    }
  }

  function init() {
    buildBanner();
    sweepLinks(document);
    // delegated click → rewrite any link added later, just before navigation
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var raw = a.getAttribute('href');
      var fixed = withDemo(raw);
      if (fixed !== raw) a.setAttribute('href', fixed);
    }, true);
    // catch dynamically injected links (kanban cards, modals, etc.)
    if (window.MutationObserver) {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { sweepLinks(document); break; }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // expose a tiny handle for debugging
  window.__EGGIE_DEMO__ = { user: DEMO_USER, reseed: function () {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(NS) === 0) localStorage.removeItem(k); }); } catch (e) {}
  } };
})();
