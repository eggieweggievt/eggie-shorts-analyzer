/* ============================================================
   ui-modal.js — EggieUI.modal(): the reusable accessible dialog
   ------------------------------------------------------------
   The hub's pages each hand-rolled their own `.modal-backdrop` +
   `classList.add('open')`, which means no focus trap, no focus
   restoration, no scroll lock, and Escape handled in only one spot.
   This is the shared, dependency-free partner for the `.ui-modal-in`
   / `.ui-modal-*` styles in hub-ui.css. Same house style as the
   other EggieUI helpers: tiny IIFE, no build step, safe to `defer`.

   Drop in with:  <script src="ui-modal.js?v=1" defer></script>
   (hub-core already injects hub-ui.css, which carries the styles.)

   WHAT IT HANDLES FOR YOU
     • role="dialog" + aria-modal, auto-wired aria-labelledby/-describedby
     • Focus trap (Tab / Shift+Tab cycle, wraps at both ends)
     • Focus restoration to whatever was focused before it opened
     • Escape to close + click-outside to close (both opt-out)
     • Body scroll lock with scrollbar-width compensation (no shift)
     • The rest of the page is `inert` + aria-hidden to screen readers
     • Nesting (a dialog opened from a dialog) via a small stack
     • Reduced-motion / 🧘 low-stim: entrance + exit motion drop out
     • Phones: renders as a bottom sheet (see hub-ui.css @media)

   API ─────────────────────────────────────────────────────────
     var m = EggieUI.modal({
       title, description,          // strings; auto-wired to aria-*
       content,                     // HTML string | Node | fn(ctrl)->(string|Node)
       size,                        // 'sm' | 'md' (default) | 'lg'
       actions: [                   // optional footer buttons
         { label, value, variant,   // variant: 'primary'|'ghost'|'danger'|'default'
           autofocus, closeOnClick,  // closeOnClick default true
           onClick(ctrl) }
       ],
       initialFocus,                // selector inside the dialog
       showClose,                   // show the × button (default true)
       closeOnEscape,               // default true
       closeOnBackdrop,             // default true
       returnFocus,                 // element to focus on close (default: trigger)
       ariaLabel,                   // use when there is no visible title
       className,                   // extra class on the panel
       onOpen(ctrl), onClose(result)
     });
     // controller: m.close(result), m.setBusy(bool), m.setContent(c),
     //             m.setTitle(str), m.el, m.body, m.backdrop

   SUGAR (Promise-based, built on the primitive) ───────────────
     await EggieUI.modal.confirm({ title, message, confirmText,
                                   cancelText, danger });  // -> boolean
     await EggieUI.modal.alert({ title, message, okText });  // -> true
   ============================================================ */
(function () {
  'use strict';

  var FOCUSABLE = [
    'a[href]', 'area[href]', 'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])',
    'audio[controls]', 'video[controls]', 'details>summary:first-of-type',
    'iframe', '[contenteditable]:not([contenteditable="false"])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  var stack = [];          // open dialogs, topmost last
  var scrollLock = null;   // shared body-scroll lock (ref-counted for nesting)
  var seq = 0;

  /* motion is off under the hub's 🧘 low-stim mode OR the OS reduce-motion pref */
  function motionOff() {
    try {
      if (document.documentElement.hasAttribute('data-hub-lowstim')) return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function focusablesIn(root) {
    return Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE)).filter(isVisible);
  }

  /* lock <html> scroll once, compensating for the scrollbar so the page
     behind doesn't reflow. Ref-counted so nested dialogs don't double-lock. */
  function lockScroll() {
    if (scrollLock) { scrollLock.count++; return; }
    var de = document.documentElement, b = document.body;
    var sw = window.innerWidth - de.clientWidth;
    scrollLock = { count: 1, overflow: de.style.overflow, pad: b.style.paddingRight };
    de.style.overflow = 'hidden';
    if (sw > 0) b.style.paddingRight = ((parseFloat(getComputedStyle(b).paddingRight) || 0) + sw) + 'px';
  }
  function unlockScroll() {
    if (!scrollLock) return;
    if (--scrollLock.count > 0) return;
    document.documentElement.style.overflow = scrollLock.overflow;
    document.body.style.paddingRight = scrollLock.pad;
    scrollLock = null;
  }

  /* hide everything except the dialog from AT + pointer/Tab. Returns a restore fn.
     Only touches nodes we actually changed, so it's safe to nest. */
  function applyInert(except) {
    var changed = [];
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === except || el.id === 'ui-toast-wrap') return;
      var t = el.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'LINK' || t === 'TEMPLATE' || t === 'NOSCRIPT') return;
      if (el.getAttribute('aria-hidden') === 'true') return;  // already hidden by someone else — leave it
      el.setAttribute('aria-hidden', 'true');
      try { el.inert = true; } catch (e) {}
      changed.push(el);
    });
    return function restore() {
      changed.forEach(function (el) {
        el.removeAttribute('aria-hidden');
        try { el.inert = false; } catch (e) {}
      });
    };
  }

  function appendContent(parent, content, ctrl) {
    if (typeof content === 'function') content = content(ctrl);
    if (content == null) return;
    if (typeof content === 'string') {
      var w = document.createElement('div');
      w.innerHTML = content;
      while (w.firstChild) parent.appendChild(w.firstChild);
    } else if (content.nodeType) {
      parent.appendChild(content);
    }
  }

  function open(opts) {
    opts = opts || {};
    var uid = 'uimodal-' + (++seq);
    var prevFocus = opts.returnFocus || document.activeElement;
    var controller;   // assigned below; closures reference it lazily

    /* ---- build DOM ---- */
    var backdrop = document.createElement('div');
    backdrop.className = 'ui-modal-backdrop';

    var dialog = document.createElement('div');
    dialog.className = 'ui-modal ui-modal--' + (opts.size || 'md') + ' ui-modal-in' +
      (opts.className ? ' ' + opts.className : '');
    dialog.setAttribute('role', opts.role || 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;   // focus of last resort when nothing inside is focusable

    var titleEl = null;
    if (opts.title || opts.showClose !== false) {
      var head = document.createElement('div');
      head.className = 'ui-modal__head';
      if (opts.title) {
        titleEl = document.createElement('h2');
        titleEl.className = 'ui-modal__title';
        titleEl.id = uid + '-title';
        titleEl.textContent = opts.title;
        head.appendChild(titleEl);
        dialog.setAttribute('aria-labelledby', titleEl.id);
      } else {
        var spacer = document.createElement('span');
        spacer.style.flex = '1';
        head.appendChild(spacer);   // keep the × on the right
      }
      if (opts.showClose !== false) {
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'ui-modal__close';
        x.setAttribute('aria-label', opts.closeLabel || 'Close dialog');
        x.innerHTML = '&times;';
        x.addEventListener('click', function () { controller.close(opts.dismissValue); });
        head.appendChild(x);
      }
      dialog.appendChild(head);
    }
    if (!opts.title && opts.ariaLabel) dialog.setAttribute('aria-label', opts.ariaLabel);

    var body = document.createElement('div');
    body.className = 'ui-modal__body';
    if (opts.description) {
      var desc = document.createElement('p');
      desc.className = 'ui-modal__desc';
      desc.id = uid + '-desc';
      desc.textContent = opts.description;
      body.appendChild(desc);
      dialog.setAttribute('aria-describedby', desc.id);
    }
    dialog.appendChild(body);

    if (opts.actions && opts.actions.length) {
      var foot = document.createElement('div');
      foot.className = 'ui-modal__foot';
      opts.actions.forEach(function (a) {
        var btn = document.createElement('button');
        btn.type = 'button';
        var variant = a.variant && a.variant !== 'default' ? ' ui-btn--' + a.variant : '';
        btn.className = 'ui-btn' + variant;
        btn.textContent = a.label || 'OK';
        if (a.autofocus) btn.setAttribute('data-autofocus', '');
        btn.addEventListener('click', function () {
          var keepOpen = false;
          if (typeof a.onClick === 'function') keepOpen = a.onClick(controller) === false;
          if (a.closeOnClick !== false && keepOpen !== true) controller.close(a.value);
        });
        foot.appendChild(btn);
      });
      dialog.appendChild(foot);
    }

    backdrop.appendChild(dialog);

    /* close on click-outside — guard with mousedown origin so a text selection
       that starts inside the panel and ends on the backdrop doesn't close it. */
    if (opts.closeOnBackdrop !== false) {
      backdrop.addEventListener('mousedown', function (e) { backdrop._down = e.target; });
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop && backdrop._down === backdrop) controller.close(opts.dismissValue);
      });
    }

    /* ---- keyboard: Escape + focus trap (only the topmost dialog reacts) ---- */
    function onKey(e) {
      if (stack[stack.length - 1] !== controller) return;
      if (e.key === 'Escape' && opts.closeOnEscape !== false) {
        e.preventDefault();
        controller.close(opts.dismissValue);
        return;
      }
      if (e.key === 'Tab') {
        var f = focusablesIn(dialog);
        if (!f.length) { e.preventDefault(); dialog.focus(); return; }
        var first = f[0], last = f[f.length - 1], active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault(); first.focus();
        }
      }
    }

    /* ---- busy overlay (for async footer actions) ---- */
    var spin = null;
    function setBusy(on) {
      dialog.classList.toggle('is-busy', !!on);
      if (on) {
        dialog.setAttribute('aria-busy', 'true');
        if (!spin) {
          spin = document.createElement('div');
          spin.className = 'ui-modal__spin';
          spin.setAttribute('aria-hidden', 'true');
          spin.innerHTML = '<span class="ui-spinner"></span>';
          dialog.appendChild(spin);
        }
      } else {
        dialog.removeAttribute('aria-busy');
        if (spin) { dialog.removeChild(spin); spin = null; }
      }
    }

    var removeInert = null;
    var closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      var i = stack.indexOf(controller);
      if (i >= 0) stack.splice(i, 1);

      function finish() {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (removeInert) removeInert();
        unlockScroll();
        try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
        if (typeof opts.onClose === 'function') opts.onClose(result);
      }

      if (motionOff()) { finish(); return; }
      backdrop.classList.add('is-closing');
      dialog.style.transition = 'opacity .18s, transform .18s';
      dialog.style.opacity = '0';
      dialog.style.transform = 'translateY(8px) scale(.985)';
      var done = false;
      function once() { if (done) return; done = true; finish(); }
      backdrop.addEventListener('transitionend', once);
      setTimeout(once, 240);   // belt-and-suspenders if transitionend never fires
    }

    controller = {
      el: dialog, body: body, backdrop: backdrop,
      close: close,
      setBusy: setBusy,
      setTitle: function (t) { if (titleEl) titleEl.textContent = t; },
      setContent: function (c) {
        // wipe everything after the description (keep aria-describedby intact)
        var keep = opts.description ? 1 : 0;
        while (body.childNodes.length > keep) body.removeChild(body.lastChild);
        appendContent(body, c, controller);
      }
    };

    appendContent(body, opts.content, controller);

    /* ---- mount + move focus ---- */
    lockScroll();
    document.body.appendChild(backdrop);
    removeInert = applyInert(backdrop);
    document.addEventListener('keydown', onKey, true);
    stack.push(controller);

    var target = null;
    if (opts.initialFocus) target = dialog.querySelector(opts.initialFocus);
    if (!target) target = dialog.querySelector('[data-autofocus]');
    if (!target) { var f = focusablesIn(dialog); target = f.length ? f[0] : dialog; }
    target.focus();

    if (typeof opts.onOpen === 'function') opts.onOpen(controller);
    return controller;
  }

  /* ---- Promise sugar built on the primitive ---- */
  function confirm(o) {
    o = o || {};
    return new Promise(function (resolve) {
      open({
        title: o.title || 'Are you sure?',
        description: o.message,
        size: o.size || 'sm',
        closeOnBackdrop: o.closeOnBackdrop !== false,
        closeOnEscape: o.closeOnEscape !== false,
        dismissValue: false,
        actions: [
          { label: o.cancelText || 'Cancel', variant: 'ghost', value: false },
          { label: o.confirmText || 'Confirm', variant: o.danger ? 'danger' : 'primary', value: true, autofocus: true }
        ],
        onClose: function (r) { resolve(!!r); }
      });
    });
  }
  function alert(o) {
    o = o || {};
    return new Promise(function (resolve) {
      open({
        title: o.title || 'Heads up',
        description: o.message,
        size: o.size || 'sm',
        dismissValue: true,
        actions: [{ label: o.okText || 'Got it', variant: 'primary', value: true, autofocus: true }],
        onClose: function () { resolve(true); }
      });
    });
  }

  /* ---- register on the EggieUI namespace (create if it doesn't exist yet) ---- */
  var NS = window.EggieUI = window.EggieUI || {};
  NS.modal = open;
  NS.modal.confirm = confirm;
  NS.modal.alert = alert;
  NS.modal.stack = stack;
  NS.modal.closeAll = function () { stack.slice().reverse().forEach(function (c) { c.close(); }); };
  if (window.EggieHub && window.EggieHub.ui) window.EggieHub.ui.modal = NS.modal;
})();
