/* ============================================================
   focus-widget.js — Eggie's Creator Hub
   Cross-page Pomodoro "follow me everywhere" widget.

   The focus timer's home is todo.html. Each hub page that loads
   only lives for as long as you're on it, so the actual countdown
   can't run continuously inside any single page. Instead we keep a
   tiny "baton" in localStorage holding an ABSOLUTE end-time. Whatever
   page is currently open owns the live ticking and reads/writes that
   baton — so the timer survives navigation.

   On the To-Do page (the timer's home) this file does almost nothing
   except expose window.EggieFocus and clear the "dismissed" flag —
   todo.html owns the rich dock / fullscreen / pop-out UI there.

   On every OTHER hub page, while a session is active, this file
   renders a small floating dock (bottom-right) with the live time,
   the task name, and pause / close buttons. Closing it off the
   To-Do page doesn't end the session — it slides away and leaves a
   little "go back to your To-Do List to bring me back" note.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'eggieFocusState';      // the shared baton
  var TICK_MS = 1000;

  // ---- persistence -----------------------------------------
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var st = JSON.parse(raw);
      return (st && typeof st === 'object') ? st : null;
    } catch (e) { return null; }
  }
  function write(st) {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  // ---- time math -------------------------------------------
  // Seconds left in the current phase, derived from absolute time.
  function computeRemaining(st, now) {
    if (!st || !st.active) return 0;
    if (st.running) return Math.max(0, Math.round((st.endsAt - now) / 1000));
    return Math.max(0, Math.round(st.remaining || 0));
  }

  // Roll the state forward through however many phases have fully
  // elapsed since endsAt. Mirrors todo.html's tickFocus() rollover:
  // focus -> short break (or long break every 4th) -> focus ...
  // cycles counts COMPLETED focus phases (used as the logging watermark).
  function advance(st, now) {
    if (!st || !st.active || !st.running || !st.endsAt) return { state: st };
    var guard = 0;
    while (st.running && st.endsAt && now >= st.endsAt && guard++ < 10000) {
      if (st.mode === 'focus') {
        st.cycles = (st.cycles || 0) + 1;
        st.mode = (st.cycles % 4 === 0) ? 'longbreak' : 'break';
        var blen = (st.mode === 'longbreak' ? st.longBreakLen : st.breakLen) || 5;
        st.endsAt = st.endsAt + blen * 60 * 1000;
      } else {
        st.mode = 'focus';
        st.endsAt = st.endsAt + ((st.focusLen || 25) * 60 * 1000);
      }
    }
    st.updatedAt = now;
    return { state: st };
  }

  function isTaskPage() {
    if (typeof window.EGGIE_FOCUS_IS_TASK_PAGE === 'boolean') {
      return window.EGGIE_FOCUS_IS_TASK_PAGE;
    }
    var p = (location.pathname || '').replace(/\/+$/, '');
    return /todo(\.html)?$/i.test(p) || /\/todo$/i.test(p);
  }

  // ---- public API (used by todo.html too) ------------------
  window.EggieFocus = {
    KEY: KEY,
    read: read,
    write: write,
    clear: clear,
    advance: advance,
    computeRemaining: computeRemaining,
    isTaskPage: isTaskPage
  };

  // ============================================================
  //  Below here is the floating-dock UI for NON-task pages only.
  // ============================================================
  function fmt(secs) {
    var m = Math.max(0, Math.floor(secs / 60));
    var s = Math.max(0, secs % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function modeLabel(mode) {
    return mode === 'focus' ? 'Focus session'
         : mode === 'longbreak' ? 'Long break ☕'
         : 'Short break 🌸';
  }

  var dock = null;
  var timer = null;
  var lastMode = null;
  var mounted = false;

  function injectStyles() {
    if (document.getElementById('eggie-focus-style')) return;
    var css = ''
      + '.eff-float{position:fixed;right:18px;bottom:18px;z-index:2147483600;'
      + 'display:flex;align-items:center;gap:10px;'
      + 'background:rgba(255,255,255,0.92);border:1.5px solid rgba(255,178,240,0.5);'
      + 'border-radius:18px;padding:10px 12px 10px 14px;'
      + 'box-shadow:0 14px 36px rgba(99,170,244,0.25);'
      + 'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);'
      + "font-family:'Quicksand',system-ui,-apple-system,sans-serif;font-size:13px;"
      + 'transform-origin:bottom right;'
      + 'animation:eff-pop .34s cubic-bezier(.18,.9,.32,1.2) both;}'
      + '.eff-float.eff-leaving{animation:eff-bye .34s ease forwards;pointer-events:none;}'
      + '.eff-open{display:flex;align-items:center;gap:8px;cursor:pointer;'
      + 'background:none;border:none;padding:0;font:inherit;text-align:left;}'
      + ".eff-time{font-family:'Pacifico',cursive;font-size:20px;color:#4D5BC0;"
      + 'min-width:60px;text-align:center;line-height:1;}'
      + '.eff-meta{display:flex;flex-direction:column;line-height:1.15;max-width:150px;}'
      + '.eff-task{font-weight:700;color:#3a2a5a;font-size:12.5px;'
      + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.eff-mode{font-size:9.5px;font-weight:800;letter-spacing:.05em;'
      + 'text-transform:uppercase;color:#6b5f8a;}'
      + '.eff-btn{background:rgba(144,165,255,0.18);color:#4D5BC0;border:none;'
      + 'border-radius:999px;width:30px;height:30px;padding:0;'
      + 'font-family:inherit;font-weight:800;font-size:13px;cursor:pointer;'
      + 'display:inline-flex;align-items:center;justify-content:center;'
      + 'transition:background .12s,transform .12s;}'
      + '.eff-btn:hover{background:rgba(144,165,255,0.32);transform:translateY(-1px);}'
      + '.eff-close{background:rgba(255,138,168,0.2);color:#a23556;}'
      + '.eff-close:hover{background:rgba(255,138,168,0.38);}'
      + '.eff-float[data-mode="break"] .eff-time,'
      + '.eff-float[data-mode="longbreak"] .eff-time{color:#1f6b35;}'
      + '.eff-float[data-mode="break"],'
      + '.eff-float[data-mode="longbreak"]{border-color:rgba(168,230,190,0.65);}'
      + '.eff-paused{opacity:.78;}'
      + '.eff-toast{position:fixed;right:18px;bottom:18px;z-index:2147483601;'
      + 'max-width:280px;cursor:pointer;'
      + 'background:rgba(255,255,255,0.95);border:1.5px solid rgba(144,165,255,0.45);'
      + 'border-radius:16px;padding:12px 15px;'
      + 'box-shadow:0 14px 36px rgba(99,170,244,0.28);'
      + 'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);'
      + "font-family:'Quicksand',system-ui,sans-serif;font-size:12.5px;font-weight:600;"
      + 'color:#3a2a5a;line-height:1.4;'
      + 'animation:eff-pop .34s cubic-bezier(.18,.9,.32,1.2) both;}'
      + '.eff-toast.eff-leaving{animation:eff-bye .34s ease forwards;}'
      + '.eff-toast b{color:#4D5BC0;}'
      + '.eff-float.eff-collapsed{padding:8px 13px;gap:0;cursor:pointer;border-radius:999px;}'
      + '.eff-collapsed .eff-meta,.eff-collapsed .eff-pause,'
      + '.eff-collapsed .eff-close,.eff-collapsed .eff-min{display:none;}'
      + '.eff-collapsed .eff-time{font-size:15px;min-width:0;}'
      + '@keyframes eff-pop{from{opacity:0;transform:translateY(14px) scale(.86);}'
      + 'to{opacity:1;transform:translateY(0) scale(1);}}'
      + '@keyframes eff-bye{from{opacity:1;transform:translateY(0) scale(1);}'
      + 'to{opacity:0;transform:translateY(16px) scale(.82);}}'
      + '@media(max-width:560px){.eff-meta{max-width:104px;}}';
    var s = document.createElement('style');
    s.id = 'eggie-focus-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildDock() {
    injectStyles();
    var d = document.createElement('div');
    d.className = 'eff-float';
    d.setAttribute('data-mode', 'focus');
    d.innerHTML =
        '<button class="eff-open" type="button" title="Open the To-Do List">'
      +   '<span class="eff-time">25:00</span>'
      +   '<span class="eff-meta"><span class="eff-task">Focus</span>'
      +   '<span class="eff-mode">Focus session</span></span>'
      + '</button>'
      + '<button class="eff-btn eff-pause" type="button" title="Pause / resume">⏸︎</button>'
      + '<button class="eff-btn eff-min" type="button" '
      +   'title="Collapse to a little bubble">–</button>'
      + '<button class="eff-btn eff-close" type="button" '
      +   'title="Hide — go back to the To-Do List to bring it back">✕</button>';
    d.querySelector('.eff-open').addEventListener('click', goToTaskPage);
    d.querySelector('.eff-pause').addEventListener('click', togglePause);
    d.querySelector('.eff-min').addEventListener('click', function () {
      setMin(true);
      d.classList.add('eff-collapsed');
    });
    d.querySelector('.eff-close').addEventListener('click', dismiss);
    // Collapsed bubble: any click expands it again (and goes no further).
    d.addEventListener('click', function (e) {
      if (!d.classList.contains('eff-collapsed')) return;
      e.stopPropagation();
      e.preventDefault();
      setMin(false);
      d.classList.remove('eff-collapsed');
    }, true);
    if (isMin()) d.classList.add('eff-collapsed');
    document.body.appendChild(d);
    return d;
  }

  // ---- collapsed-bubble preference (persists across pages) --
  var MIN_KEY = 'eggieFocusDockMin';
  function isMin() {
    try { return localStorage.getItem(MIN_KEY) === '1'; } catch (e) { return false; }
  }
  function setMin(v) {
    try { v ? localStorage.setItem(MIN_KEY, '1') : localStorage.removeItem(MIN_KEY); } catch (e) {}
  }

  function ensureMounted() {
    if (mounted && dock) return;
    dock = buildDock();
    mounted = true;
  }

  function teardown() {
    if (timer) { clearInterval(timer); timer = null; }
    if (dock && dock.parentNode) dock.parentNode.removeChild(dock);
    dock = null;
    mounted = false;
  }

  function renderDock(st) {
    if (!dock) return;
    var now = Date.now();
    var rem = computeRemaining(st, now);
    dock.setAttribute('data-mode', st.mode || 'focus');
    dock.classList.toggle('eff-paused', !st.running);
    dock.querySelector('.eff-time').textContent = fmt(rem);
    dock.querySelector('.eff-task').textContent =
      (st.todoTitle && st.todoTitle.trim()) ? st.todoTitle : 'Focus session';
    dock.querySelector('.eff-mode').textContent =
      (st.running ? '' : 'Paused — ') + modeLabel(st.mode);
    dock.querySelector('.eff-pause').textContent = st.running ? '⏸︎' : '▶︎';
  }

  function notifyPhase(mode) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var msg = mode === 'focus'
        ? "Break's over — back to focus."
        : 'Nice work — break time.';
      new Notification('Focus timer', { body: msg });
    } catch (e) {}
  }

  function tick() {
    var st = read();
    if (!st || !st.active) { teardown(); return; }
    if (st.floatDismissed) { teardown(); return; }
    var prevMode = st.mode;
    st = advance(st, Date.now()).state;
    write(st);
    if (prevMode && st.mode !== prevMode) notifyPhase(st.mode);
    lastMode = st.mode;
    renderDock(st);
  }

  function startTicking() {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  }

  // ---- controls --------------------------------------------
  function togglePause() {
    var st = read();
    if (!st || !st.active) return;
    var now = Date.now();
    if (st.running) {
      st.remaining = computeRemaining(st, now);
      st.running = false;
      st.endsAt = null;
    } else {
      st.running = true;
      st.endsAt = now + (st.remaining || 0) * 1000;
    }
    st.updatedAt = now;
    write(st);
    renderDock(st);
  }

  function goToTaskPage() {
    location.href = 'todo.html';
  }

  function showToast() {
    injectStyles();
    var t = document.createElement('div');
    t.className = 'eff-toast';
    t.innerHTML = 'Your focus timer is still running 🌸<br>'
      + 'Pop back to your <b>To-Do List</b> to bring it back.';
    t.title = 'Go to the To-Do List';
    t.addEventListener('click', goToTaskPage);
    document.body.appendChild(t);
    setTimeout(function () {
      if (!t.parentNode) return;
      t.classList.add('eff-leaving');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 360);
    }, 5200);
  }

  function dismiss() {
    var st = read();
    if (st) { st.floatDismissed = true; st.updatedAt = Date.now(); write(st); }
    if (dock) {
      dock.classList.add('eff-leaving');
      var d = dock;
      setTimeout(function () {
        if (timer) { clearInterval(timer); timer = null; }
        if (d && d.parentNode) d.parentNode.removeChild(d);
        dock = null; mounted = false;
        showToast();
      }, 340);
    } else {
      teardown();
      showToast();
    }
  }

  // ---- boot ------------------------------------------------
  function syncFromState() {
    var st = read();
    if (!st || !st.active || st.floatDismissed) { teardown(); return; }
    // catch up any phases that elapsed before this page loaded
    st = advance(st, Date.now()).state;
    write(st);
    lastMode = st.mode;
    ensureMounted();
    renderDock(st);
    startTicking();
  }

  function boot() {
    if (isTaskPage()) {
      // The To-Do page is "home". Returning here clears the dismissed
      // flag so the floating dock comes back on the next page you visit.
      var st = read();
      if (st && st.floatDismissed) {
        st.floatDismissed = false;
        write(st);
      }
      return; // todo.html owns its own dock/overlay/pop-out UI
    }
    syncFromState();
    // Keep multiple open tabs roughly in sync, and react if a session
    // is started/ended/dismissed elsewhere.
    window.addEventListener('storage', function (e) {
      if (e.key && e.key !== KEY) return;
      syncFromState();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
