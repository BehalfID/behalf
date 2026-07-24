/**
 * Subdomain ownership + redirect helpers for the multi-app split.
 *
 * Opt-in via BEHALFID_SUBDOMAIN_ROUTING=1. When disabled (default), the
 * single-app deploy is unchanged.
 *
 * Hostnames are configurable so staging can use *.behalfid.dev (or similar)
 * without hard-coding production DNS into every call site.
 */

export type SubdomainApp = "www" | "auth" | "app" | "console" | "docs";

export type SubdomainHosts = Record<SubdomainApp, string>;

export const DEFAULT_SUBDOMAIN_HOSTS: SubdomainHosts = {
  www: "www.behalfid.com",
  auth: "auth.behalfid.com",
  app: "app.behalfid.com",
  console: "console.behalfid.com",
  docs: "docs.behalfid.com"
};

/** Path prefixes owned by each app (first matching prefix wins). */
const OWNERSHIP: Array<{ app: SubdomainApp; prefixes: string[] }> = [
  {
    app: "auth",
    prefixes: [
      "/login",
      "/signup",
      "/auth",
      "/authenticate",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/invite",
      "/passport",
      "/onboarding",
      "/logout",
      "/api/auth",
      "/api/passport",
      "/api/onboarding",
      "/api/invites",
      "/api/consent-ping"
    ]
  },
  {
    app: "console",
    prefixes: ["/console", "/api/console"]
  },
  {
    app: "app",
    prefixes: [
      "/dashboard",
      "/workspace",
      "/api/dashboard",
      "/api/agents",
      "/api/billing",
      "/api/integrations",
      "/api/gateway",
      "/api/permissions",
      "/api/site-guard",
      "/api/actions",
      "/api/verify",
      "/api/logs",
      "/api/webhooks"
    ]
  },
  {
    app: "docs",
    prefixes: ["/docs"]
  },
  {
    app: "www",
    prefixes: [
      "/",
      "/blog",
      "/legal",
      "/privacy",
      "/terms",
      "/security",
      "/status",
      "/compliance",
      "/design-partners",
      "/design-system",
      "/sandbox",
      "/home-v2",
      "/api/status",
      "/api/health",
      "/api/csp-report",
      "/api/demo"
    ]
  }
];

export function isSubdomainRoutingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const value = env.BEHALFID_SUBDOMAIN_ROUTING?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * Resolve host map from env. Unset entries fall back to DEFAULT_SUBDOMAIN_HOSTS.
 * Example:
 *   BEHALFID_HOST_AUTH=auth.staging.behalfid.com
 */
export function resolveSubdomainHosts(
  env: NodeJS.ProcessEnv = process.env
): SubdomainHosts {
  return {
    www: env.BEHALFID_HOST_WWW?.trim() || DEFAULT_SUBDOMAIN_HOSTS.www,
    auth: env.BEHALFID_HOST_AUTH?.trim() || DEFAULT_SUBDOMAIN_HOSTS.auth,
    app: env.BEHALFID_HOST_APP?.trim() || DEFAULT_SUBDOMAIN_HOSTS.app,
    console: env.BEHALFID_HOST_CONSOLE?.trim() || DEFAULT_SUBDOMAIN_HOSTS.console,
    docs: env.BEHALFID_HOST_DOCS?.trim() || DEFAULT_SUBDOMAIN_HOSTS.docs
  };
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function resolveAppForHost(
  hostname: string,
  hosts: SubdomainHosts = DEFAULT_SUBDOMAIN_HOSTS
): SubdomainApp | null {
  const host = normalizeHostname(hostname);
  for (const [app, configured] of Object.entries(hosts) as Array<
    [SubdomainApp, string]
  >) {
    if (normalizeHostname(configured) === host) return app;
  }
  // Apex / bare domain behaves like www for redirect purposes.
  if (host === "behalfid.com" || host === "www.behalfid.com") return "www";
  return null;
}

export function resolveOwnerForPath(pathname: string): SubdomainApp {
  const path = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  // Workspace public URLs: /<slug>/dashboard → app
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[1] === "dashboard") return "app";
  if (parts.length >= 3 && parts[1] === "api" && (parts[2] === "dashboard" || parts[2] === "billing")) {
    return "app";
  }

  for (const entry of OWNERSHIP) {
    for (const prefix of entry.prefixes) {
      if (prefix === "/") {
        if (path === "/" || path === "") return entry.app;
        continue;
      }
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        return entry.app;
      }
    }
  }

  return "www";
}

/**
 * When the request host is a known subdomain app but the path belongs elsewhere,
 * return the absolute URL to redirect to. Returns null when no redirect needed.
 */
export function resolveSubdomainRedirect(input: {
  hostname: string;
  pathname: string;
  search?: string;
  protocol?: string;
  hosts?: SubdomainHosts;
}): string | null {
  const hosts = input.hosts ?? DEFAULT_SUBDOMAIN_HOSTS;
  const currentApp = resolveAppForHost(input.hostname, hosts);
  if (!currentApp) return null;

  const owner = resolveOwnerForPath(input.pathname);
  if (owner === currentApp) return null;

  // docs can live on www until docs.* is cut over; still redirect when hosts differ.
  if (owner === "docs" && currentApp === "www") {
    if (normalizeHostname(hosts.docs) === normalizeHostname(hosts.www)) {
      return null;
    }
  }

  const targetHost = hosts[owner];
  const protocol = input.protocol ?? "https:";
  const search = input.search ?? "";
  return `${protocol}//${targetHost}${input.pathname}${search}`;
}

/**
 * Cookie Domain for shared developer sessions across auth ↔ app.
 * Empty / unset = host-only cookies (current production-safe default).
 */
export function resolveSessionCookieDomain(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw = env.BEHALFID_COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;
  // Require leading-dot form for parent domain sharing, e.g. .behalfid.com
  return raw.startsWith(".") ? raw : `.${raw}`;
}
