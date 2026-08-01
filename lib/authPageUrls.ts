/**
 * Canonical public paths for authentication HTML pages.
 *
 * Auth-host URLs follow the same shape as login/signup (`/login`, not `/auth/login`).
 * App Router files may live under `app/<page>` and `app/[locale]/<page>`; callers
 * must not hardcode `/auth/...` page paths independently.
 */

import {
  resolveOwnedHref,
  splitPathAndSearch,
  stripLocalePrefix,
  withLocalePrefix
} from "@/lib/subdomainRouting";

export const AUTH_PAGE_PATHS = {
  login: "/login",
  signup: "/signup",
  completeProfile: "/complete-profile",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  onboarding: "/onboarding",
  logout: "/logout"
} as const;

export type AuthPage = keyof typeof AUTH_PAGE_PATHS;

/** Pre-cutover path still present in emails/bookmarks/OAuth redirects. */
export const LEGACY_COMPLETE_PROFILE_PATH = "/auth/complete-profile";

function appendSearchParams(
  pathname: string,
  params?: URLSearchParams | Record<string, string | null | undefined>
): string {
  if (!params) return pathname;
  const search =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(
          Object.entries(params).flatMap(([key, value]) =>
            value == null || value === "" ? [] : [[key, value]]
          )
        );
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Build a canonical auth-page path (+ optional query), never duplicating `/auth`.
 *
 * Examples:
 *   authPagePath("completeProfile") → "/complete-profile"
 *   authPagePath("completeProfile", { provider: "github", next: "/dashboard" })
 *     → "/complete-profile?provider=github&next=%2Fdashboard"
 */
export function authPagePath(
  page: AuthPage,
  query?: URLSearchParams | Record<string, string | null | undefined>
): string {
  return appendSearchParams(AUTH_PAGE_PATHS[page], query);
}

/** Pending-signup profile completion destination for Google/GitHub callbacks. */
export function completeProfilePath(options?: {
  next?: string | null;
  provider?: "google" | "github" | null;
}): string {
  return authPagePath("completeProfile", {
    provider: options?.provider === "github" ? "github" : undefined,
    next: options?.next ?? undefined
  });
}

/**
 * Absolute or same-host URL for an auth page, respecting subdomain ownership.
 * Safe for apex/local hosts (returns a relative path when no configured host).
 */
export function resolveAuthPageHref(
  page: AuthPage,
  options?: {
    query?: URLSearchParams | Record<string, string | null | undefined>;
    hostname?: string | null;
    protocol?: string;
    locale?: string | null;
    env?: NodeJS.ProcessEnv;
  }
): string {
  return resolveOwnedHref(authPagePath(page, options?.query), {
    hostname: options?.hostname,
    protocol: options?.protocol,
    locale: options?.locale,
    env: options?.env
  });
}

/**
 * If `pathname` is the legacy `/auth/complete-profile` (optionally locale-prefixed),
 * return the canonical `/complete-profile` path with the same locale prefix.
 * Returns null for every other path — including the canonical page itself —
 * so callers cannot create redirect loops.
 */
export function canonicalCompleteProfilePathFromLegacy(
  pathname: string
): string | null {
  const { locale, pathname: bare } = stripLocalePrefix(pathname);
  if (bare !== LEGACY_COMPLETE_PROFILE_PATH) return null;
  return withLocalePrefix(AUTH_PAGE_PATHS.completeProfile, locale);
}

/**
 * Build the public Location for a legacy complete-profile request.
 * Preserves query string; never points back at `/auth/complete-profile`.
 */
export function resolveLegacyCompleteProfileRedirect(input: {
  pathname: string;
  search?: string;
  hostname: string;
  protocol?: string;
  env?: NodeJS.ProcessEnv;
}): string | null {
  const canonicalPath = canonicalCompleteProfilePathFromLegacy(input.pathname);
  if (!canonicalPath) return null;
  const search = input.search ?? "";
  return resolveOwnedHref(`${canonicalPath}${search}`, {
    hostname: input.hostname,
    protocol: input.protocol,
    env: input.env
  });
}

/** True when a path+search already targets the canonical complete-profile page. */
export function isCanonicalCompleteProfilePath(pathWithSearch: string): boolean {
  const { pathname } = splitPathAndSearch(pathWithSearch);
  const { pathname: bare } = stripLocalePrefix(pathname);
  return bare === AUTH_PAGE_PATHS.completeProfile;
}
