/* EnlaceCraft in ONLYOFFICE: the editor runs in the iframe and the drawing
   goes into the document as an OLE object (a PNG preview plus the
   .enlacecraft project JSON as its data), so a double-click opens it here
   again for editing. */
(function () {
  'use strict';

  var RD = window.EnlaceCraftBridge,
    run = RD.run,
    show = RD.show,
    EI = window.EnlaceCraftInsert,
    busy = false,
    closed = false;

  function close() {
    if (closed) return;
    closed = true;
    window.Asc.plugin.executeCommand('close', '');
  }

  function save() {
    if (busy) return;
    busy = true;
    var info = window.Asc.plugin.info;
    EI.parts(run)
      .then(function (p) {
        return EI.params(p, info.objectId, info.resize);
      })
      .then(function (param) {
        window.Asc.plugin.executeMethod(info.objectId === undefined ? 'AddOleObject' : 'EditOleObject', [param], close);
        /* Close even if the editor does not answer. */
        setTimeout(close, 4000);
      })
      .catch(function (e) {
        busy = false;
        /* Nothing drawn: nothing to put in the document. */
        if (/sheet is empty/i.test(e.message)) return close();
        show('Could not insert the drawing: ' + e.message);
      });
  }

  /* The window's size: last time's, else as large as the screen allows.
     Giving ONLYOFFICE a minimum and no maximum (0) also makes it resizable
     by its edges; the size the user gives it is remembered. */
  var KEY = 'enlacecraft-onlyoffice-size',
    MIN_W = 800,
    MIN_H = 560,
    BIG = 100000,
    ownUntil = 0;

  function remembered() {
    try {
      var z = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (z && z.w >= MIN_W && z.h >= MIN_H) return z;
    } catch { /* ignore: storage can be blocked inside the editor */ }
    return null;
  }
  function remember(z) {
    try {
      localStorage.setItem(KEY, JSON.stringify(z));
    } catch { /* ignore: storage can be blocked inside the editor */ }
  }
  function resizeTo(w, h) {
    ownUntil = Date.now() + 800;
    window.Asc.plugin.resizeWindow(Math.round(w), Math.round(h), MIN_W, MIN_H, 0, 0);
  }

  function toggleBig() {
    var z = remembered();
    if (z && z.max) {
      remember({ w: z.w, h: z.h });
      resizeTo(z.w, z.h);
    } else {
      remember({ w: window.innerWidth, h: window.innerHeight, max: true });
      resizeTo(BIG, BIG);
    }
  }

  function titleDoubleClick() {
    try {
      var fe = window.frameElement,
        win = fe && fe.closest && fe.closest('.asc-window');
      var head = win && win.querySelector('.header');
      if (!head || head.__ecBig) return;
      head.__ecBig = true;
      head.title = 'Double-click: whole window / back';
      head.addEventListener('dblclick', function (e) {
        if (e.target && e.target.closest && e.target.closest('.tool, .close, button')) return;
        toggleBig();
      });
    } catch { /* ignore: the window chrome is ONLYOFFICE's, not ours */ }
  }

  function sizeWindow() {
    if (typeof window.Asc.plugin.resizeWindow !== 'function') return;
    var sw = (window.screen && window.screen.availWidth) || 1400,
      sh = (window.screen && window.screen.availHeight) || 900,
      z = remembered();
    try {
      if (z && z.max) resizeTo(BIG, BIG);
      else if (z) resizeTo(z.w, z.h);
      else resizeTo(Math.max(MIN_W, Math.min(sw - 60, 2400)), Math.max(MIN_H, Math.min(sh - 140, 1600)));
    } catch {
      return;
    }
    titleDoubleClick();
    var t = 0;
    setTimeout(function () {
      window.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          if (Date.now() < ownUntil) return;
          var w = window.innerWidth,
            h = window.innerHeight;
          if (w >= MIN_W && h >= MIN_H) remember({ w: w, h: h });
        }, 400);
      });
    }, 1000);
  }

  window.Asc.plugin.init = function (data) {
    RD.themeFromInfo();
    sizeWindow();
    /* A drawing opened by double-click: its .enlacecraft JSON. */
    if (data && String(data).length > 60e6) return show('This drawing is too large to open.');
    if (data)
      run('set', { text: String(data), format: 'json' }).catch(function (e) {
        show('Could not open this drawing: ' + e.message);
      });
  };

  window.Asc.plugin.button = function (id) {
    if (id === 0) save();
    else close();
  };
})();
