import { beforeEach, describe, expect, it, vi } from "vitest";

type Redirect = { url: string; status?: number };
const redirects: Redirect[] = [];
let nexted = 0;

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => {
      nexted += 1;
      return { status: 200, headers: new Headers(), cookies: { getAll: () => [], set: vi.fn() } };
    }),
    redirect: vi.fn((url: URL | string, status?: number) => {
      redirects.push({ url: String(url), status });
      return { status: status ?? 307, headers: new Headers(), cookies: { getAll: () => [], set: vi.fn() } };
    }),
    rewrite: vi.fn(() => ({
      status: 200,
      headers: new Headers(),
      cookies: { getAll: () => [], set: vi.fn() }
    }))
  }
}));

vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() =>
    vi.fn(() => ({ status: 200, headers: new Headers(), cookies: { getAll: () => [] } }))
  )
}));

vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "de", "es", "fr"], defaultLocale: "en", localePrefix: "as-needed" }
}));

import { proxy } from "@/proxy";

/** Absolute URL so `nextUrl.hostname` is the real host, as it is behind Vercel. */
function makeRequest(origin: string, pathWithSearch: string) {
  const url = new URL(pathWithSearch, origin);
  return {
    nextUrl: {
      pathname: url.pathname,
      search: url.search,
      hostname: url.hostname,
      protocol: url.protocol,
      href: url.href,
      clone() {
        return new URL(url.href);
      }
    },
    headers: new Headers(),
    url: url.href
  } as never;
}

beforeEach(() => {
  redirects.length = 0;
  nexted = 0;
  process.env.BEHALFID_SUBDOMAIN_ROUTING = "1";
});

describe("proxy: auth host root redirect", () => {
  it("308s the auth host root to /login on the same host", () => {
    proxy(makeRequest("https://auth.behalfid.com", "/"));
    expect(redirects).toHaveLength(1);
    expect(redirects[0].url).toBe("https://auth.behalfid.com/login");
    expect(redirects[0].status).toBe(308);
  });

  it("preserves the query string through the redirect", () => {
    proxy(makeRequest("https://auth.behalfid.com", "/?next=%2Fdashboard&foo=bar"));
    expect(redirects[0].url).toBe("https://auth.behalfid.com/login?next=%2Fdashboard&foo=bar");
    expect(redirects[0].status).toBe(308);
  });

  it("does not loop on the auth host /login", () => {
    proxy(makeRequest("https://auth.behalfid.com", "/login"));
    expect(redirects.filter((r) => r.url.includes("/login"))).toHaveLength(0);
  });

  it("leaves the www root on the marketing homepage", () => {
    proxy(makeRequest("https://www.behalfid.com", "/"));
    expect(redirects).toHaveLength(0);
  });

  it("leaves the apex root on the marketing homepage", () => {
    proxy(makeRequest("https://behalfid.com", "/"));
    expect(redirects).toHaveLength(0);
  });

  it("does not redirect auth-owned OAuth routes off the auth host", () => {
    for (const path of ["/api/auth/github", "/api/auth/google/callback"]) {
      redirects.length = 0;
      proxy(makeRequest("https://auth.behalfid.com", path));
      expect(redirects).toHaveLength(0);
    }
  });

  it("leaves locale-prefixed auth pages unchanged", () => {
    for (const path of ["/de/login", "/en/signup"]) {
      redirects.length = 0;
      proxy(makeRequest("https://auth.behalfid.com", path));
      expect(redirects).toHaveLength(0);
    }
  });

  it("is inert when subdomain routing is disabled", () => {
    process.env.BEHALFID_SUBDOMAIN_ROUTING = "0";
    proxy(makeRequest("https://auth.behalfid.com", "/"));
    expect(redirects).toHaveLength(0);
  });
});
