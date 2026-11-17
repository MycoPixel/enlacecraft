# EnlaceCraft for ONLYOFFICE

An ONLYOFFICE plugin for the Document, Spreadsheet and Presentation editors
(desktop and server). It puts the whole EnlaceCraft editor inside a plugin
window, stores the drawing in the document as an OLE object (a PNG preview
plus the `.enlacecraft` project JSON as its data), and opens it again on
double-click.

**No server is involved.** The production build of the app is bundled inside
the `.plugin` file and runs from local files, so it works offline.

## Build

```bash
./build.sh
```

That runs `npm run build` at the repository root, copies `dist/` to `web/`,
and writes `EnlaceCraft-ONLYOFFICE.plugin` (a zip) next to this README.

The app's Vite config already uses a relative base (`base: "./"`), which is
what lets it run from `file://` inside the plugin. `build.sh` checks for
that and fails loudly if it ever changes.

## Install

In ONLYOFFICE: **Plugins → Plugin Manager → Install from file**, pick
`EnlaceCraft-ONLYOFFICE.plugin`. A newer build replaces an older one the same
way.

Then: **Insert → EnlaceCraft** to draw; **OK** inserts the drawing;
**double-click** a drawing (or right-click → Edit) to edit it again.

## How it works

- `index.html` loads ONLYOFFICE's plugin SDK and the editor iframe
  (`web/index.html?embed`).
- `bridge.js` speaks EnlaceCraft's embedding protocol
  (`src/io/embedBridge.ts`): `{enlacecraft:1, id, op, args}` in,
  `{enlacecraft:1, id, ok, result}` out, plus `ready`/`change`/`selection`
  events. It also forwards ONLYOFFICE's light/dark theme.
- `insert.js` exports the project JSON, an SVG (for the physical size) and a
  3× PNG, then builds the `AddOleObject`/`EditOleObject` parameters.
- `plugin.js` wires init/save/close and remembers the window size.

## Notes

- The wrapper files are MPL-2.0; the bundled editor is AGPL-3.0-or-later
  (see the repository's `LICENSE`). The two licences are compatible.
- The plugin GUID is unique to this project. Do not reuse another editor's
  GUID: ONLYOFFICE would treat the two plugins as the same one.
- The ONLYOFFICE SDK is loaded from `../v1/plugins.js` (shipped by the host)
  with the official CDN as a fallback; that fallback is the only network
  request the wrapper can make.
