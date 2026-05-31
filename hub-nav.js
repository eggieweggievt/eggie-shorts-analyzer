/* ============================================================
   hub-nav.js — animated hamburger navigation for Eggie's Creator Hub
   Drop-in: <script src="hub-nav.js"></script> before </body>.
   Finds the existing .back-row pill nav on the page, hides the
   pills, and replaces them with an animated hamburger button that
   opens a slide-in drawer holding the same links. The original
   <a class="back-link"> nodes are reused, so each page keeps its
   own theme + link set automatically, and the current page is
   marked active. No dependencies.
   ============================================================ */
(function () {
  if (window.__hubNavInit) return;
  window.__hubNavInit = true;

  /* ---- inject styles (runs as soon as the script is parsed) ---- */
  var CSS = [
    '.back-row[data-hubnav] > a.back-link{display:none!important}',          /* hide raw <a> pills, keep <button> burger */
    '.hubnav-burger{position:relative;cursor:pointer}',
    '.hubnav-box{position:relative;display:inline-block;width:20px;height:14px;flex:0 0 auto}',
    '.hubnav-line{position:absolute;left:0;width:100%;height:2.4px;border-radius:3px;background:currentColor;',
      'transition:transform .3s cubic-bezier(.6,.05,.28,1),top .3s cubic-bezier(.6,.05,.28,1),opacity .18s ease}',
    '.hubnav-line:nth-child(1){top:0}',
    '.hubnav-line:nth-child(2){top:5.8px}',
    '.hubnav-line:nth-child(3){top:11.6px}',
    '.hubnav-burger.open .hubnav-line:nth-child(1){top:5.8px;transform:rotate(45deg)}',
    '.hubnav-burger.open .hubnav-line:nth-child(2){opacity:0;transform:scaleX(.2)}',
    '.hubnav-burger.open .hubnav-line:nth-child(3){top:5.8px;transform:rotate(-45deg)}',

    '.hubnav-overlay{position:fixed;inset:0;z-index:8000;background:rgba(55,48,90,0.32);',
      'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);',
      'opacity:0;visibility:hidden;transition:opacity .28s ease,visibility .28s ease}',
    '.hubnav.open .hubnav-overlay{opacity:1;visibility:visible}',

    '.hubnav-drawer{position:fixed;top:0;left:0;height:100%;width:min(310px,84vw);z-index:8001;',
      'display:flex;flex-direction:column;gap:4px;padding:18px 16px;box-sizing:border-box;',
      'background:rgba(255,255,255,0.97);border-right:2px solid rgba(144,165,255,0.35);',
      'box-shadow:18px 0 50px rgba(90,90,160,0.22);overflow-y:auto;',
      'transform:translateX(-104%);transition:transform .34s cubic-bezier(.5,.05,.2,1)}',
    '.hubnav.open .hubnav-drawer{transform:translateX(0)}',

    '.hubnav-drawer-head{display:flex;align-items:center;justify-content:space-between;',
      'margin:2px 4px 12px;font-weight:800;font-size:15px;letter-spacing:.2px;color:#5b54a8;opacity:.9}',
    '.hubnav-close{border:none;background:rgba(144,165,255,0.16);color:#5b54a8;width:32px;height:32px;',
      'border-radius:50%;cursor:pointer;font-size:16px;line-height:1;display:inline-flex;',
      'align-items:center;justify-content:center;font-family:inherit;transition:background .15s ease}',
    '.hubnav-close:hover{background:rgba(144,165,255,0.32)}',

    '.hubnav-list{display:flex;flex-direction:column;gap:6px}',
    '.hubnav-list .back-link.hubnav-item{display:flex!important;width:100%;justify-content:flex-start;',
      'box-sizing:border-box;border-radius:13px;margin:0;font-size:15px;padding:11px 15px}',
    '.hubnav-list .back-link.hubnav-item.active{color:#fff;border-color:transparent;',
      'background:linear-gradient(135deg,#ff9ec8,#9aa6ff 60%,#8fe3d0);box-shadow:0 6px 16px rgba(144,165,255,0.32)}',
    '.hubnav-list .back-link.hubnav-item:hover{transform:translateX(2px)}',

    '.hubnav.open .hubnav-list .hubnav-item{animation:hubnavIn .34s ease both}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(1){animation-delay:.03s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(2){animation-delay:.06s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(3){animation-delay:.09s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(4){animation-delay:.12s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(5){animation-delay:.15s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(6){animation-delay:.18s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(7){animation-delay:.21s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(8){animation-delay:.24s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(9){animation-delay:.27s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(10){animation-delay:.30s}',
    '.hubnav.open .hubnav-list .hubnav-item:nth-child(11){animation-delay:.33s}',
    '@keyframes hubnavIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}',

    '@media print{.hubnav,.back-row[data-hubnav]{display:none!important}}',
    'body.public-mode .hubnav{display:none!important}',
    '@media (prefers-reduced-motion:reduce){',
      '.hubnav-line,.hubnav-drawer,.hubnav-overlay{transition-duration:.01ms!important}',
      '.hubnav.open .hubnav-list .hubnav-item{animation:none!important}}'
  ].join('');

  var style = document.createElement('style');
  style.id = 'hubnav-css';
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  /* ---- build the menu ---- */
  function init() {
    var row = document.querySelector('.back-row');
    if (!row || row.dataset.hubnav) return;

    var links = Array.prototype.slice.call(row.querySelectorAll('a'));
    if (!links.length) return;
    row.dataset.hubnav = '1';

    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    var menu = document.createElement('div');
    menu.className = 'hubnav';

    var overlay = document.createElement('div');
    overlay.className = 'hubnav-overlay';

    var drawer = document.createElement('nav');
    drawer.className = 'hubnav-drawer';
    drawer.setAttribute('aria-label', 'Site navigation');

    var head = document.createElement('div');
    head.className = 'hubnav-drawer-head';
    var headLabel = document.createElement('span');
    headLabel.textContent = 'Navigate';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hubnav-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '&#10005;';
    head.appendChild(headLabel);
    head.appendChild(closeBtn);

    var list = document.createElement('div');
    list.className = 'hubnav-list';

    var activeLabel = null;
    links.forEach(function (a) {
      var hrefFile = (a.getAttribute('href') || '').split('#')[0].split('/').pop().toLowerCase();
      a.classList.add('hubnav-item');
      if (a.classList.contains('active') || (hrefFile && hrefFile === here)) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
        if (!activeLabel) activeLabel = a.textContent.trim();
      }
      list.appendChild(a);
    });

    drawer.appendChild(head);
    drawer.appendChild(list);
    menu.appendChild(overlay);
    menu.appendChild(drawer);
    document.body.appendChild(menu);

    /* burger button reuses the page's own .back-link pill styling */
    var burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'back-link hubnav-burger';
    burger.setAttribute('aria-label', 'Open navigation menu');
    burger.setAttribute('aria-haspopup', 'true');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML =
      '<span class="hubnav-box" aria-hidden="true">' +
      '<span class="hubnav-line"></span><span class="hubnav-line"></span><span class="hubnav-line"></span>' +
      '</span><span class="hubnav-burger-label">' + (activeLabel ? esc(activeLabel) : 'Menu') + '</span>';
    row.appendChild(burger);

    function open() {
      menu.classList.add('open');
      burger.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      var first = list.querySelector('a');
      if (first) setTimeout(function () { first.focus(); }, 60);
    }
    function shut() {
      menu.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }
    burger.addEventListener('click', function () {
      menu.classList.contains('open') ? shut() : open();
    });
    overlay.addEventListener('click', shut);
    closeBtn.addEventListener('click', function () { shut(); burger.focus(); });
    list.addEventListener('click', function (e) { if (e.target.closest('a')) shut(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) { shut(); burger.focus(); }
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* The <script> tag sits at the end of <body>, after .back-row, so the
     nav is already in the DOM — run immediately to avoid any flash of the
     old pills, and keep a DOMContentLoaded fallback for safety. init() is
     idempotent (guards on row.dataset.hubnav). */
  init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
})();
