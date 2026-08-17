/**
 * Client-side funnel milestones for the acquisition path.
 *
 * Autocapture already sends pageviews, clicks and rage-clicks, so this module
 * deliberately re-emits neither. It covers only the moments autocapture cannot
 * infer, which are exactly the ones the funnel was blind to:
 *
 * - **Which** sign-up entry point a visitor used. Autocapture sees "a click on
 *   an anchor whose href is /signup"; it cannot say whether that was the hero,
 *   the header, the closing band or a pricing card, so it cannot say which
 *   surface is doing the work.
 * - Whether someone who reached /signup **started the form** rather than landing
 *   and leaving. A pageview cannot separate "never started" from "started and
 *   abandoned", and those two failures have opposite fixes.
 * - Whether a submission **succeeded or failed**, and for which reason.
 * - Whether a signed-in session actually **reached a rendered dashboard**. This
 *   is not answerable from the URL: `/dashboard` is only a redirect stub and the
 *   real dashboard lives at `/<workspaceSlug>/dashboard`, so a funnel step keyed
 *   on the `/dashboard` path matches nobody.
 *
 * Every call is a no-op until `analytics.init()` runs, and init is held behind
 * consent (lib/analytics/consent.ts), so these are safe to call unconditionally
 * from UI code. The transport flushes its queue on page unload, so a milestone
 * emitted immediately before a navigation still arrives.
 *
 * Business truth about a completed signup stays server-side — see
 * lib/analytics/server.ts. These events describe browser intent, not billing.
 */
import { analytics } from "@heycatch/sdk";

/**
 * Where a sign-up click came from. Values are stable identifiers, not labels:
 * renaming a button must not silently split a funnel, so change the copy freely
 * and leave these alone.
 */
export type SignupCtaPlacement =
  | "home_hero"
  /** The closing band in MarketingLayout — present on every marketing page. */
  | "site_closing"
  | "header"
  | "header_mobile"
  | "pricing_free"
  | "pricing_pro"
  | "pricing_developers";

/** Auth surfaces that share the sign-up funnel vocabulary. */
export type AuthMode = "signup" | "login";

/** How the account was created or entered. */
export type AuthMethod = "password" | "google" | "github" | "passkey";

/**
 * Carries the entry point across the navigation to /signup.
 *
 * The click event itself is enough to count entry points, but it cannot enrich
 * what happens *next*. Stashing the placement lets `signup_form_started` and
 * `signup_completed` carry the surface that produced them, so "the hero brings
 * people who never start the form" is one breakdown rather than a session join.
 *
 * sessionStorage, not localStorage: attribution belongs to this visit.
 */
const PLACEMENT_STORAGE_KEY = "behalfid_signup_placement";

function storePlacement(placement: SignupCtaPlacement): void {
  try {
    sessionStorage.setItem(PLACEMENT_STORAGE_KEY, placement);
  } catch {
    // Hardened browser contexts block storage. Attribution degrades to "unknown";
    // the events themselves still send.
  }
}

/** The entry point recorded for this visit, if the visitor arrived via a CTA. */
export function readSignupPlacement(): SignupCtaPlacement | "unknown" {
  try {
    const stored = sessionStorage.getItem(PLACEMENT_STORAGE_KEY);
    return (stored as SignupCtaPlacement | null) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * A visitor clicked something that starts sign-up.
 *
 * Emitted on the click rather than on the /signup pageview because the question
 * this answers — which surface moves people off the homepage — is about the
 * origin, and a pageview has already lost it.
 */
export function trackSignupCtaClick(placement: SignupCtaPlacement): void {
  if (typeof window === "undefined") return;
  storePlacement(placement);
  analytics.trackEvent("signup_cta_clicked", { placement });
}

/**
 * The visitor put real input into the auth form — the first step that separates
 * "landed here" from "is actually trying".
 *
 * Fires once per form: callers hold the latch, so a per-keystroke handler stays
 * a single event.
 */
export function trackAuthFormStarted(mode: AuthMode, field: string): void {
  if (typeof window === "undefined") return;
  analytics.trackEvent(`${mode}_form_started`, {
    field,
    placement: readSignupPlacement()
  });
}

/** The form was submitted. Pairs with `*_succeeded` / `*_failed` below. */
export function trackAuthSubmitted(mode: AuthMode, method: AuthMethod): void {
  if (typeof window === "undefined") return;
  analytics.trackEvent(`${mode}_submitted`, { method, placement: readSignupPlacement() });
}

/**
 * The attempt failed.
 *
 * `reason` is the message the visitor was shown. It is server-authored copy
 * (validation, rate limiting, duplicate email), never a credential and never
 * free-typed input, so it is safe to send and is the whole point of the event:
 * a stalled funnel step is only actionable once you know what people were told.
 */
export function trackAuthFailed(mode: AuthMode, method: AuthMethod, reason: string): void {
  if (typeof window === "undefined") return;
  analytics.trackEvent(`${mode}_failed`, {
    method,
    reason: reason.slice(0, 200),
    placement: readSignupPlacement()
  });
}

/** The credential exchange succeeded. Not the same as reaching the dashboard. */
export function trackAuthSucceeded(mode: AuthMode, method: AuthMethod): void {
  if (typeof window === "undefined") return;
  analytics.trackEvent(`${mode}_succeeded`, { method, placement: readSignupPlacement() });
}

/**
 * The session was authenticated but is being held at the email-verification
 * gate instead of continuing to the dashboard.
 *
 * This is the step between "logged in" and "reached the dashboard" — without it
 * the two look adjacent in the funnel and the drop between them has no
 * explanation.
 */
export function trackEmailVerificationGate(): void {
  if (typeof window === "undefined") return;
  analytics.trackEvent("email_verification_required", { placement: readSignupPlacement() });
}

/**
 * A dashboard actually rendered for a signed-in user.
 *
 * Keyed on the component mounting rather than on a path, because the dashboard
 * is served from `/<workspaceSlug>/dashboard` — the slug differs per workspace,
 * so no single URL pattern identifies "the dashboard" for a funnel step.
 */
export function trackDashboardReached(view: string, hasWorkspace: boolean): void {
  if (typeof window === "undefined") return;
  analytics.trackEvent("dashboard_reached", { view, workspace_resolved: hasWorkspace });
}
