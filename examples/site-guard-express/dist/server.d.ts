/**
 * BehalfID Site Guard — Express example server
 *
 * Demonstrates two guarded routes (/docs and /admin) and one public route.
 *
 * Start:  npm start
 * Dev:    npm run dev
 *
 * Environment variables:
 *   SITE_GUARD_KEY     – Required. Site key from the BehalfID dashboard.
 *   BEHALFID_BASE_URL  – Optional. Defaults to https://behalfid.com.
 *   PORT               – Optional. Defaults to 3001.
 */
declare const app: import("express-serve-static-core").Express;
export default app;
