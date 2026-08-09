/**
 * Browser-side analytics identity.
 *
 * Per the HeyCatch install guide: the browser reports *who the user is*, the
 * server reports *what the business knows* (lib/analytics/server.ts). The id is
 * always the stable internal user id — never an email or session token; email
 * and name travel as person properties, which is what makes the dashboard show
 * a readable person instead of an opaque id.
 *
 * Every call is a no-op before init, and init is held behind analytics consent,
 * so these are safe to call unconditionally from auth flows.
 */
import { analytics } from "@heycatch/sdk";

export type AnalyticsIdentity = {
  /** Stable internal user id — the same id the server sends. */
  userId: string;
  email?: string | null;
  name?: string | null;
  plan?: string | null;
  /** ISO timestamp; written only if absent (set-once). */
  signupDate?: string | null;
};

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
}

/** Call after a successful sign-in (or when the session is first resolved). */
export function identifyUser({ userId, email, name, plan, signupDate }: AnalyticsIdentity): void {
  if (!userId) return;
  analytics.setIdentity(
    userId,
    compact({ email, name, plan }),
    compact({ signup_date: signupDate })
  );
}

/** Call when a person property changes outside of sign-in. */
export function setPersonProperties(properties: Record<string, unknown>): void {
  analytics.setPersonProperties(compact(properties));
}

/** Call on sign-out so the next visitor on this device starts anonymous. */
export function resetIdentity(): void {
  analytics.resetIdentity();
}
