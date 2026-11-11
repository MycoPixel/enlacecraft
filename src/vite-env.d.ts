/// <reference types="vite/client" />

/**
 * Build-time constant injected by vite.config.ts from package.json's
 * `version` — the same number electron-builder uses for release artifacts.
 * Declared here so the renderer can read it without an import; tests run
 * through vitest.config.ts, which doesn't define it, so any module reading
 * this must tolerate `undefined` (see src/version.ts).
 */
declare const __APP_VERSION__: string;
