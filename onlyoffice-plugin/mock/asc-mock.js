/* A fake ONLYOFFICE plugin SDK: just enough of window.Asc.plugin for the
   insert/edit OLE flow, so the plugin can be exercised without installing
   ONLYOFFICE.

   It records every call the wrapper makes (executeMethod, executeCommand,
   callCommand, resizeWindow) and forwards it to the parent harness page.
   The document API is not emulated: callCommand answers with a plausible
   text width in millimetres, which is all insert.js asks for. */
(function () {
  'use strict';

  var log = [],
    info = {};

  function record(entry) {
    entry.at = Date.now();
    log.push(entry);
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ mock: 1, event: 'call', entry: entry }, '*');
      }
    } catch {
      /* a closed parent is not an error here */
    }
  }

  window.Asc = {
    plugin: {
      info: info,
      /* Assigned by plugin.js and invoked by the harness. */
      init: function () {},
      button: function () {},
      executeMethod: function (name, params, callback) {
        record({ kind: 'method', name: name, params: params || [] });
        if (typeof callback === 'function') setTimeout(callback, 0);
      },
      executeCommand: function (command, data, callback) {
        record({ kind: 'command', name: command, data: data });
        if (typeof callback === 'function') setTimeout(callback, 0);
      },
      /* ONLYOFFICE runs the function inside the document; the mock just
         reports a page width. 170 mm is an A4 text column. */
      callCommand: function () {
        var args = arguments,
          callback = args[args.length - 1];
        record({ kind: 'callCommand' });
        if (typeof callback === 'function') setTimeout(function () { callback(170); }, 0);
      },
      resizeWindow: function (w, h, minW, minH, maxW, maxH) {
        record({ kind: 'resize', w: w, h: h, minW: minW, minH: minH, maxW: maxW, maxH: maxH });
      }
    }
  };

  window.AscMock = {
    log: log,
    /** Fresh info, the way ONLYOFFICE would describe a new or existing object. */
    configure: function (next) {
      var key;
      for (key in info) delete info[key];
      for (key in next) info[key] = next[key];
    },
    reset: function () {
      log.length = 0;
    },
    record: record
  };
})();
