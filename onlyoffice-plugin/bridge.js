/* The editor lives in the #editor iframe and is driven through EnlaceCraft's
   embedding protocol (src/io/embedBridge.ts):
     parent → editor  {enlacecraft:1, id, op, args}
     editor → parent  {enlacecraft:1, id, ok:true, result} | {ok:false, error}
     editor → parent  {enlacecraft:1, event:"ready"|"change"|"selection"}
   This wrapper only opens the window, forwards commands and closes. */
(function () {
  'use strict';

  var frame = null,
    seq = 0,
    pending = {},
    isReady = false,
    readyResolve,
    ready = new Promise(function (resolve) {
      readyResolve = resolve;
    });

  function show(text) {
    var m = document.getElementById('msg');
    if (!m) return;
    m.textContent = text || '';
    m.style.display = text ? 'block' : 'none';
  }

  window.addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.enlacecraft !== 1) return;
    if (d.event === 'ready') {
      isReady = true;
      show('');
      return readyResolve();
    }
    if (d.id == null || !pending[d.id]) return;
    var p = pending[d.id];
    delete pending[d.id];
    if (d.ok) p.resolve(d.result);
    else p.reject(new Error(d.error || 'EnlaceCraft error'));
  });

  /* The editor iframe is our own file, so it shares this page's origin; when
     the plugin runs from file:// that origin is "null" and postMessage needs
     "*". Never post the drawing to anything but the frame we created. */
  function targetOrigin() {
    var o = window.location.origin || '';
    return o && o !== 'null' ? o : '*';
  }

  function run(op, args) {
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        pending[id] = { resolve: resolve, reject: reject };
        frame.contentWindow.postMessage({ enlacecraft: 1, id: id, op: op, args: args || {} }, targetOrigin());
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    frame = document.getElementById('editor');
    frame.src = 'web/index.html?embed';
    frame.addEventListener('load', function () {
      /* A bundle that never speaks the bridge would otherwise wait forever;
         turn "nothing happens" into a message the user can act on. */
      setTimeout(function () {
        if (isReady) return;
        show('The editor did not start. Rebuild the plugin so web/ is present.');
      }, 8000);
    });
  });

  /* The drawing's size in mm: its SVG says it in pt or px (96 per inch). */
  function sizeOf(svg) {
    var head = String(svg || '').slice(0, 2000),
      w = /\bwidth="([\d.]+)(pt|px)?"/.exec(head),
      h = /\bheight="([\d.]+)(pt|px)?"/.exec(head);
    if (!w || !h) return null;
    var k = function (u) { return u === 'pt' ? 25.4 / 72 : 25.4 / 96; };
    return { w: +w[1] * k(w[2]), h: +h[1] * k(h[2]) };
  }

  function pngSize(b64) {
    var s = atob(b64.slice(0, 64)),
      n = function (i) {
        return ((s.charCodeAt(i) << 24) | (s.charCodeAt(i + 1) << 16) | (s.charCodeAt(i + 2) << 8) | s.charCodeAt(i + 3)) >>> 0;
      };
    return { w: n(16), h: n(20) };
  }

  /* ONLYOFFICE's theme. The editor's own Settings choice still wins and is
     remembered; this only asks for the closest look when it has none. */
  var applied = null;
  function applyTheme(theme) {
    if (!theme) return;
    var dark = /dark/i.test(String(theme.type || theme.name || '')),
      root = document.documentElement,
      set = function (k, v) {
        if (v) root.style.setProperty(k, v);
      };
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    set('--bg', theme['background-normal']);
    set('--fg', theme['text-normal']);
    var name = String(theme.name || theme.id || '') + ' ' + String(theme.type || ''),
      look = !dark ? 'light' : /contrast/i.test(name) ? 'dark' : 'gray';
    if (applied === look) return;
    applied = look;
    run('uiTheme', { theme: look }).catch(function () {});
  }

  var P = window.Asc && window.Asc.plugin;
  if (P) {
    var base = P.onThemeChanged;
    P.onThemeChanged = function (theme) {
      try {
        if (typeof base === 'function') base.call(P, theme);
      } catch { /* ignore: a host hook that throws must not break us */ }
      applyTheme(theme);
    };
  }

  window.EnlaceCraftBridge = {
    run: run,
    show: show,
    sizeOf: sizeOf,
    pngSize: pngSize,
    themeFromInfo: function () {
      try {
        if (P && P.info && P.info.theme) applyTheme(P.info.theme);
      } catch { /* ignore: a host hook that throws must not break us */ }
    }
  };
})();
