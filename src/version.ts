/**
 * The application version, read from package.json at build time.
 *
 * `__APP_VERSION__` is injected by vite.config.ts's `define` (see
 * vite-env.d.ts). The `typeof` guard keeps this module importable from the
 * Vitest suite, whose separate config doesn't define the constant — there it
 * resolves to "dev" instead of throwing a ReferenceError.
 *
 * This is deliberately a build-time constant rather than a `package.json`
 * import: the renderer bundle shouldn't pull the whole manifest (author,
 * scripts, electron-builder config...) in just to read one string.
 */
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
