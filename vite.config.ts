import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Using a relative base so the build works when hosted at any sub-path
// (GitHub Pages project sites, Vercel, a plain static file server, etc).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "autoUpdate" silently swaps in a new service worker (and its
      // freshly-cached assets) the moment a new build is deployed and the
      // person reloads/opens the app again — no "update available, click
      // to refresh" prompt to wire up, which fits a small drawing tool
      // better than manual update UX would.
      registerType: "autoUpdate",
      // Vite's own base is relative ("./"), which lets the build sit at
      // any sub-path; the PWA manifest/SW need an explicit absolute-ish
      // scope instead, since "installed app" semantics (start_url, the
      // service worker's control scope) don't have the same notion of
      // "relative to the current page" a normal asset URL does. "." here
      // resolves relative to the manifest's own location at build output
      // root, which keeps it working under a sub-path the same way base
      // does for everything else.
      manifest: {
        id: ".",
        name: "EnlaceCraft",
        short_name: "EnlaceCraft",
        description: "A browser-based molecule drawing application, inspired by ChemDraw.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        theme_color: "#1b2027",
        background_color: "#1b2027",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML/icons) so the app
        // itself opens offline. PubChem/translation lookups still need a
        // live connection — that's a deliberate, separate runtime-caching
        // policy below, not part of the app shell.
        //
        // The 3D-structure feature (3Dmol.js + OpenChemLib's conformer
        // generator/force-field tables) is deliberately excluded from
        // this list via globIgnores below — it's a secondary, optional
        // view most sketching sessions never open, and its dependencies
        // are large enough that forcing every offline install to carry
        // them would be a bad trade for that. See vite.config.ts's
        // manualChunks, which groups all of it into one stably-named
        // chunk so it can be targeted here. It still gets fetched (and
        // then browser-HTTP-cached) normally the first time someone
        // opens the 3D panel while online.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        globIgnores: ["**/molecule3d-*.js"],
        runtimeCaching: [
          {
            // Compound-by-name/SMILES/autocomplete lookups: prefer a fresh
            // network response (PubChem data doesn't change, but a search
            // should never silently show something stale if it can reach
            // the network), falling back to the last cached answer for the
            // same query when offline — handy for re-opening a compound
            // you already looked up today without a connection.
            urlPattern: /^https:\/\/pubchem\.ncbi\.nlm\.nih\.gov\/rest\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "pubchem-api",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        // Groups the 3D-view feature (3Dmol.js + OpenChemLib, plus the
        // components/io modules that use them) into one stably-named
        // chunk, kept out of the initial load for everyone who never
        // opens the 3D panel (see App.tsx's lazy import) and out of the
        // PWA precache list (see globIgnores above) since it's large and
        // optional. The name has to stay predictable — globIgnores
        // matches on it by pattern, not by content hash.
        manualChunks(id) {
          if (
            id.includes("node_modules/3dmol") ||
            id.includes("node_modules/openchemlib") ||
            id.includes(`${path.sep}src${path.sep}components${path.sep}Molecule3D`) ||
            id.includes(`${path.sep}src${path.sep}io${path.sep}embed3d.ts`)
          ) {
            return "molecule3d";
          }
        },
      },
    },
  },
});
