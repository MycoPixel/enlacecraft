/**
 * Build-time configuration that is not tied to a network client.
 *
 * Kept outside `src/io/` on purpose: `io/cspOrigins.test.ts` treats every URL
 * literal in that directory as a fetch target that must appear in the CSP
 * `connect-src` allowlist. A share *link* base is opened by a browser, never
 * fetched by the app, so it must not be forced into that allowlist.
 */

/**
 * Public web deployment used as the share-link base by the desktop build.
 *
 * The packaged Electron app runs from a `file:` URL, which no other machine
 * can open, so a link created there is addressed to this build instead.
 * `VITE_WEB_APP_URL` lets a fork or staging deploy override it at build time.
 */
const configuredWebAppUrl = import.meta.env?.VITE_WEB_APP_URL?.trim();

export const DEFAULT_WEB_APP_URL = configuredWebAppUrl || "https://enlacecraft.vercel.app";
