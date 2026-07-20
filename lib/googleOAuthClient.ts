/**
 * Client-safe Google OAuth helpers (no Node crypto / DB imports).
 * Server routes should prefer `@/lib/googleOAuth`, which re-exports these.
 */

export type GoogleOAuthMode = "login" | "signup";

export function safeOAuthNextPath(next?: string | null): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

/** Public href that starts the Google OAuth redirect (sets state cookie, then redirects to Google). */
export function googleAuthHref(mode: GoogleOAuthMode, next?: string | null): string {
  const params = new URLSearchParams({ mode });
  const safeNext = safeOAuthNextPath(next);
  if (safeNext) params.set("next", safeNext);
  return `/api/auth/google?${params.toString()}`;
}
