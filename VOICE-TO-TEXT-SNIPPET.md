# 🎤 Floating Voice-to-Text — drop-in snippet

Adds a little mic button to **every text field** on a page (textareas, text inputs,
and contenteditable areas). Click it, speak, and it types into whatever field you're
focused on. Self-contained: no libraries, no separate CSS file.

## How to add it

**Option A — paste inline (easiest).**
Paste the whole `<script>…</script>` block below right before the closing `</body>`
tag of your page.

**Option B — as a file.**
Save everything *between* the `<script>` tags into a file named `floating-mic.js`,
then add this line before `</body>`:

```html
<script defer src="floating-mic.js"></script>
```

## Requirements / good to know

- Works in **Chrome and Edge** (uses the built-in Web Speech API). Firefox/Safari don't support it; the button will show a friendly message instead.
- The page must be served over **HTTPS or from `localhost`** (browser rule for microphone access).
- The **first click asks for microphone permission** — the user clicks Allow once.
- It needs an **internet connection** (the browser sends audio to the speech service).
- Customize the look/behavior at the top of the snippet: `COLOR`, `ACTIVE_BG`, `LANG`.

## The snippet

```html
<script>
(function () {
  if (window.__floatingMic) return;
  window.__floatingMic = true;

  // ---- customise here ----
  var COLOR = '#db5e98';                       // mic icon colour
  var ACTIVE_BG = '#e0467a';                   // button colour while listening
  var LANG = navigator.language || 'en-US';    // dictation language

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supported = !!SR;

  // inject styles
  var css =
    '#floating-mic{position:fixed;z-index:2147483646;width:28px;height:28px;display:none;' +
    'align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;' +
    'cursor:pointer;color:' + COLOR + ';background:#fff;box-shadow:0 2px 9px rgba(0,0,0,.18);}' +
    '#floating-mic:hover{filter:brightness(.96);}' +
    '#floating-mic.on{color:#fff;background:' + ACTIVE_BG + ';' +
    'animation:floating-mic-pulse 1.2s ease-in-out infinite;}' +
    '@keyframes floating-mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(224,70,122,.45);}' +
    '50%{box-shadow:0 0 0 6px rgba(224,70,122,0);}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var MIC = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="9" y="2" width="6" height="12" rx="3"></rect>' +
    '<path d="M5 11a7 7 0 0 0 14 0"></path>' +
    '<line x1="12" y1="18" x2="12" y2="22"></line>' +
    '<line x1="8" y1="22" x2="16" y2="22"></line></svg>';

  var rec = null, listening = false, target = null;

  function isEditable(el) {
    if (!el || el.disabled || el.readOnly || el.id === 'floating-mic') return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      var t = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'url', 'email', 'tel'].indexOf(t) >= 0; // never password/number
    }
    return !!el.isContentEditable;
  }

  function insert(text) {
    if (!text || !target) return;
    try { target.focus(); } catch (e) {}
    if (target.isContentEditable) {
      var c = target.textContent || '';
      document.execCommand('insertText', false, (c && !/\s$/.test(c) ? ' ' : '') + text);
      return;
    }
    var s = target.selectionStart != null ? target.selectionStart : target.value.length;
    var e = target.selectionEnd != null ? target.selectionEnd : target.value.length;
    var b = target.value.slice(0, s);
    var chunk = (b && !/\s$/.test(b) ? ' ' : '') + text;
    var proto = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    var setVal = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
    setVal.call(target, b + chunk + target.value.slice(e));
    var p = (b + chunk).length;
    try { target.selectionStart = target.selectionEnd = p; } catch (_) {}
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function buildRec() {
    var r = new SR();
    r.lang = LANG; r.continuous = true; r.interimResults = true;
    r.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) insert(ev.results[i][0].transcript.trim());
      }
    };
    r.onend = function () { if (listening) { try { r.start(); } catch (e) {} } };
    r.onerror = function (ev) {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        stop(); alert('Microphone blocked. Allow it via the lock icon in the address bar, then try again.');
      }
    };
    return r;
  }
  function start() { listening = true; btn.classList.add('on'); if (!rec) rec = buildRec(); try { rec.start(); } catch (e) {} }
  function stop()  { listening = false; btn.classList.remove('on'); try { rec && rec.stop(); } catch (e) {} }

  var btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'floating-mic';
  btn.title = 'Voice to text'; btn.setAttribute('aria-label', 'Voice to text');
  btn.innerHTML = MIC;
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep field focused
  btn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (!supported) { alert('Voice typing needs Chrome or Edge.'); return; }
    listening ? stop() : start();
  });

  function place(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 16) { btn.style.display = 'none'; return; }
    var size = 28;
    var top = r.height > 70 ? (r.top + 6) : (r.top + (r.height - size) / 2);
    var left = r.right - size - 6;
    top = Math.max(6, Math.min(top, innerHeight - size - 6));
    left = Math.max(6, Math.min(left, innerWidth - size - 6));
    btn.style.top = top + 'px'; btn.style.left = left + 'px'; btn.style.display = 'flex';
  }

  document.addEventListener('focusin', function (e) {
    if (e.target === btn) return;
    if (isEditable(e.target)) { target = e.target; place(e.target); }
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      if (document.activeElement === btn) return;
      if (!isEditable(document.activeElement) && !listening) btn.style.display = 'none';
    }, 150);
  });
  addEventListener('scroll', function () { if (target && btn.style.display !== 'none') place(target); }, true);
  addEventListener('resize', function () { if (target && btn.style.display !== 'none') place(target); });

  (document.body || document.documentElement).appendChild(btn);
})();
</script>
```
