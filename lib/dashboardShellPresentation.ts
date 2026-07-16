export type DashboardContentVariant = "standard" | "wide" | "focused" | "detail" | "activity";

export function isDashboardPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/dashboard(?:\/|$)/.test(pathname) ||
    /^\/[^/]+\/dashboard(?:\/|$)/.test(pathname) ||
    /^\/workspace\/[^/]+\/dashboard(?:\/|$)/.test(pathname);
}

function getDashboardSubpath(pathname: string): string {
  const legacy = pathname.match(/^\/dashboard(\/.*)?$/);
  if (legacy) return legacy[1] ?? "";
  const scoped = pathname.match(/^\/[^/]+\/dashboard(\/.*)?$/);
  if (scoped) return scoped[1] ?? "";
  const internal = pathname.match(/^\/workspace\/[^/]+\/dashboard(\/.*)?$/);
  if (internal) return internal[1] ?? "";
  return "";
}

export function getDashboardContentVariant(pathname: string): DashboardContentVariant {
  const subpath = getDashboardSubpath(pathname);
  if (subpath === "/logs" || subpath === "/approvals" || subpath === "/inbox") return "wide";
  if (subpath === "/managed-profiles/activity") return "activity";
  if (subpath === "/onboarding" || subpath === "/agents/new") return "focused";
  if (/^\/(agents|webhooks)\/[^/]+$/.test(subpath)) return "detail";
  return "standard";
}

export function isDashboardNavItemActive(pathname: string, href: string): boolean {
  const isDashboardHome = /^(?:\/dashboard|\/[^/]+\/dashboard|\/workspace\/[^/]+\/dashboard)$/.test(href);
  return isDashboardHome ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
