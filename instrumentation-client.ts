/**
 * HeyCatch analytics client entry.
 *
 * Next.js >= 15.3 runs this module on the client before hydration, on every
 * page — the placement the HeyCatch install guide requires. Static import, no
 * dynamic import or lazy chunk, no `typeof window` guard (init is a no-op
 * during SSR and is idempotent), and the publishable project key inlined as a
 * literal.
 *
 * `apiHost` is intentionally not passed — the SDK default
 * (https://in.heycatch.ai) is correct. That origin is the only analytics origin
 * allow-listed in the CSP; see ANALYTICS_INGEST_ORIGIN in proxy.ts.
 *
 * `tracingHosts` is intentionally not passed either: this app's API routes are
 * same-origin (/api/*), which the SDK covers automatically.
 *
 * Deviation from the guide, on purpose: the guide asks for an unconditional
 * init. The SDK writes a persistent first-party cookie and a device identifier
 * the moment it initializes, so the call is held behind the site's existing
 * consent choice — see lib/analytics/consent.ts for the reasoning. init() is
 * idempotent, so accepting later starts capture without a reload.
 *
 * Autocapture (pageviews, clicks, SPA route changes) starts at init. Do not add
 * router/history listeners or re-emit clicks and pageviews as custom events;
 * they double-count. Business events belong on the server — see
 * lib/analytics/server.ts.
 *
 * The one sanctioned exception is lib/analytics/funnel.ts, which emits named
 * acquisition milestones autocapture provably cannot produce: which CTA a
 * visitor used, whether they began filling the sign-up form, why a submission
 * failed, and whether a dashboard actually rendered (the dashboard lives under
 * /<workspaceSlug>/dashboard, so no path pattern identifies it). Those are
 * additions to autocapture, not duplicates of it — read that module's header
 * before adding a sixth.
 */
import { analytics } from "@heycatch/sdk";
import { whenAnalyticsConsentGranted } from "@/lib/analytics/consent";

whenAnalyticsConsentGranted(() => {
  analytics.init({
    projectKey: "hck_pk_CmZFEYVf4npR4hbJspc5lFFbG6VE59N4",
    install: {
      framework: "nextjs",
      frameworkVersion: "16",
      agent: "claude-code"
    }
  });
});
