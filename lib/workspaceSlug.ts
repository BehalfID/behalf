import { routing } from "@/i18n/routing";

export const WORKSPACE_SLUG_MAX_LENGTH = 63;
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Trusted header set only by proxy rewrites — never trust client-supplied values on non-rewritten paths. */
export const WORKSPACE_SLUG_HEADER = "x-behalf-workspace-slug";

const RESERVED_WORKSPACE_SLUGS = new Set([
  "api",
  "dashboard",
  "login",
  "logout",
  "signup",
  "onboarding",
  "invite",
  "authenticate",
  "verify-email",
  "reset-password",
  "forgot-password",
  "docs",
  "blog",
  "legal",
  "privacy",
  "terms",
  "security",
  "status",
  "sandbox",
  "console",
  "design-system",
  "passport",
  "robots.txt",
  "sitemap.xml",
  "www",
  "admin",
  "app",
  "support",
  "help",
  "billing",
  "settings",
  "agents",
  "approvals",
  "adaptive-delegation",
  "inbox",
  "logs",
  "_next",
  ...routing.locales
]);

export function isReservedWorkspaceSlug(slug: string): boolean {
  return RESERVED_WORKSPACE_SLUGS.has(slug.toLowerCase());
}

export function listReservedWorkspaceSlugs(): string[] {
  return [...RESERVED_WORKSPACE_SLUGS].sort();
}

/**
 * Normalize arbitrary user/company input into a candidate workspace slug.
 * Never returns a reserved slug (falls back to "workspace").
 */
export function normalizeWorkspaceSlug(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, WORKSPACE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

  if (!normalized || isReservedWorkspaceSlug(normalized) || !WORKSPACE_SLUG_PATTERN.test(normalized)) {
    return "workspace";
  }

  return normalized;
}

/** Returns null when valid; otherwise a human-readable error. */
export function validateWorkspaceSlug(slug: string): string | null {
  if (!slug) return "Workspace slug is required.";
  if (slug !== slug.toLowerCase()) return "Workspace slug must be lowercase.";
  if (slug.length > WORKSPACE_SLUG_MAX_LENGTH) {
    return `Workspace slug must be at most ${WORKSPACE_SLUG_MAX_LENGTH} characters.`;
  }
  if (!WORKSPACE_SLUG_PATTERN.test(slug)) {
    return "Workspace slug must start and end with a letter or number and may contain hyphens.";
  }
  if (isReservedWorkspaceSlug(slug)) {
    return "That workspace URL is reserved.";
  }
  return null;
}

/** Stable short suffix derived from public accountId (not a secret). */
export function accountIdSlugSuffix(accountId: string): string {
  const raw = accountId.replace(/^acct[_-]?/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const suffix = (raw || "id").slice(-6);
  return suffix.length >= 4 ? suffix : suffix.padStart(4, "0");
}

export function workspaceDashboardBasePath(slug: string): string {
  return `/${slug}/dashboard`;
}

export function workspaceDashboardHref(slug: string, subpath = ""): string {
  const base = workspaceDashboardBasePath(slug);
  if (!subpath || subpath === "/") return base;
  const normalized = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return `${base}${normalized}`;
}

export function workspaceApiHref(slug: string, apiPath: string): string {
  if (apiPath.startsWith("/api/dashboard") || apiPath.startsWith("/api/billing")) {
    return `/${slug}${apiPath}`;
  }
  return apiPath;
}

export function extractDashboardSubpath(pathname: string): string {
  const legacy = pathname.match(/^\/dashboard(\/.*)?$/);
  if (legacy) return legacy[1] ?? "";
  const scoped = pathname.match(/^\/[^/]+\/dashboard(\/.*)?$/);
  if (scoped) return scoped[1] ?? "";
  const internal = pathname.match(/^\/workspace\/[^/]+\/dashboard(\/.*)?$/);
  if (internal) return internal[1] ?? "";
  return "";
}
