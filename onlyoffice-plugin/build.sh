#!/usr/bin/env bash
# Builds EnlaceCraft-ONLYOFFICE.plugin from a production build of the app.
#
# The result is a zip with config.json at its root, the wrapper files beside
# it, and the whole built app under web/. ONLYOFFICE installs it offline:
# nothing here is hosted anywhere.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$here/EnlaceCraft-ONLYOFFICE.plugin"

cd "$root"
npm run build

rm -rf "$here/web"
cp -R "$root/dist" "$here/web"

# The plugin is loaded from inside ONLYOFFICE, not from a web server: a
# service worker there would cache an old copy of the editor and never be
# updatable, so the packaged copy drops the PWA bits entirely.
rm -f "$here/web/sw.js" "$here/web"/workbox-*.js "$here/web/registerSW.js" "$here/web/manifest.webmanifest"
sed -i '/vite-plugin-pwa:register-sw/d; /rel="manifest"/d' "$here/web/index.html"

# The editor loads ./assets/... relative to web/index.html; assert that the
# relative base survived, because an absolute base makes the plugin blank.
if grep -q 'src="/assets/' "$here/web/index.html"; then
  echo "error: dist/index.html uses absolute /assets/ paths; check vite.config.ts base" >&2
  exit 1
fi

mkdir -p "$here/resources/img"
cp "$root/build/icon.png" "$here/resources/img/icon.png"
cp "$root/build/icon.png" "$here/resources/img/icon@2x.png"

rm -f "$out"
cd "$here"
zip -q -r "$out" config.json index.html bridge.js insert.js plugin.js resources web

echo "built $out"
