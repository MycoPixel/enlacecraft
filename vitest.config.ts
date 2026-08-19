import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts rather than merging a `test`
// block into it: the app's own Vite config pulls in the React plugin and
// the PWA plugin (service worker generation, manifest, etc.), none of
// which the test suite needs — it only exercises plain model/io functions
// (see src/model, src/io), so a minimal standalone config keeps `npm test`
// fast and free of unrelated build-time side effects.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
