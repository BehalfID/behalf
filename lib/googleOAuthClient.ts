/**
 * Client-safe Google OAuth helpers (no Node crypto / DB imports).
 * Server routes should prefer `@/lib/googleOAuth`, which re-exports these.
 */

import { safeRelativePath } from "@/lib/safeRedirect";

export type GoogleOAuthMode = "login" | "signup" | "reauth";

export function safeOAuthNextPath(next?: string | null): string | undefined {
  return safeRelativePath(next);
}

/** Public href that starts the Google OAuth redirect (sets state cookie, then redirects to Google). */
export function googleAuthHref(mode: GoogleOAuthMode, next?: string | null): string {
  const params = new URLSearchParams({ mode });
  const safeNext = safeOAuthNextPath(next);
  if (safeNext) params.set("next", safeNext);
  return `/api/auth/google?${params.toString()}`;
}
