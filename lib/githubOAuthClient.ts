/**
 * Client-safe GitHub OAuth helpers (no Node crypto, DB, or secret access).
 * Server code should use `@/lib/authProviders/providers/github`.
 */

export type GitHubOAuthMode = "login" | "signup" | "link";

export function safeOAuthNextPath(next?: string | null): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  if (next.length > 512) return undefined;
  return next;
}

/**
 * Public href that starts the GitHub redirect.
 *
 * Points at our own route rather than github.com so the single-use state record
 * and its binding cookie are created on the same navigation.
 */
export function githubAuthHref(mode: GitHubOAuthMode, next?: string | null): string {
  const params = new URLSearchParams({ mode });
  const safeNext = safeOAuthNextPath(next);
  if (safeNext) params.set("next", safeNext);
  return `/api/auth/github?${params.toString()}`;
}
