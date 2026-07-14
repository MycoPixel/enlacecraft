import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
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
});
