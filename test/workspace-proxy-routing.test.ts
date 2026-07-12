import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_SLUG_HEADER } from "@/lib/workspaceSlug";

type Capture = {
  kind: "next" | "rewrite" | "redirect";
  url?: URL;
  requestHeaders?: Headers;
};

const captures: Capture[] = [];

function mockResponse(kind: Capture["kind"], url?: URL, init?: { request?: { headers?: Headers } }) {
  captures.push({
    kind,
    url,
    requestHeaders: init?.request?.headers
  });
  return {
    status: 200,
    headers: new Headers(),
    cookies: { getAll: () => [], set: vi.fn() }
  };
}

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn((init?: { request?: { headers?: Headers } }) => mockResponse("next", undefined, init)),
    redirect: vi.fn((url: URL) => mockResponse("redirect", url)),
    rewrite: vi.fn((url: URL, init?: { request?: { headers?: Headers } }) =>
      mockResponse("rewrite", url, init)
    )
  }
}));

vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() =>
    vi.fn(() => ({
      status: 200,
      headers: new Headers(),
      cookies: { getAll: () => [] }
    }))
  )
}));

vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "de", "es", "fr"], defaultLocale: "en", localePrefix: "as-needed" }
}));

import { buildWorkspaceRewritePath, matchWorkspacePublicPath, proxy } from "@/proxy";

function makeRequest(path: string, headers?: Record<string, string>) {
  const url = new URL(path, "https://example.test");
  const hdrs = new Headers(headers);
  return {
    nextUrl: {
      pathname: url.pathname,
      search: url.search,
      hostname: url.hostname,
      href: url.href,
      clone() {
        return new URL(url.href);
      }
    },
    headers: hdrs,
    url: url.href
  } as never;
}

beforeEach(() => {
  captures.length = 0;
  vi.clearAllMocks();
});

describe("matchWorkspacePublicPath", () => {
  it("matches /<slug>/dashboard", () => {
    expect(matchWorkspacePublicPath("/trajectus/dashboard")).toEqual({
      slug: "trajectus",
      kind: "dashboard",
      suffix: ""
    });
  });

  it("preserves dashboard suffix paths", () => {
    expect(matchWorkspacePublicPath("/trajectus/dashboard/agents")).toEqual({
      slug: "trajectus",
      kind: "dashboard",
      suffix: "/agents"
    });
    expect(matchWorkspacePublicPath("/trajectus/dashboard/agents/agent_1")).toEqual({
      slug: "trajectus",
      kind: "dashboard",
      suffix: "/agents/agent_1"
    });
  });

  it("matches /<slug>/api/dashboard/... as api", () => {
    expect(matchWorkspacePublicPath("/trajectus/api/dashboard/summary")).toEqual({
      slug: "trajectus",
      kind: "api",
      suffix: "/api/dashboard/summary"
    });
  });

  it("does not match reserved first segments", () => {
    for (const reserved of ["api", "dashboard", "login", "docs", "en", "de"]) {
      expect(matchWorkspacePublicPath(`/${reserved}/dashboard`)).toBeNull();
      expect(matchWorkspacePublicPath(`/${reserved}/api/dashboard/summary`)).toBeNull();
    }
  });

  it("does not match invalid slugs", () => {
    expect(matchWorkspacePublicPath("/-bad-/dashboard")).toBeNull();
    expect(matchWorkspacePublicPath("/has_underscore/dashboard")).toBeNull();
    expect(matchWorkspacePublicPath("/a--/dashboard")).toBeNull();
  });
});

describe("buildWorkspaceRewritePath", () => {
  it("rewrites dashboard paths under /workspace/<slug>/dashboard", () => {
    expect(
      buildWorkspaceRewritePath({ slug: "trajectus", kind: "dashboard", suffix: "" })
    ).toBe("/workspace/trajectus/dashboard");
    expect(
      buildWorkspaceRewritePath({ slug: "trajectus", kind: "dashboard", suffix: "/agents" })
    ).toBe("/workspace/trajectus/dashboard/agents");
  });

  it("rewrites api paths to the internal /api/... suffix", () => {
    expect(
      buildWorkspaceRewritePath({
        slug: "trajectus",
        kind: "api",
        suffix: "/api/dashboard/summary"
      })
    ).toBe("/api/dashboard/summary");
  });
});

describe("proxy() workspace header trust boundary", () => {
  it("strips forged client workspace slug header on direct /api/dashboard requests", () => {
    proxy(
      makeRequest("/api/dashboard/summary", {
        [WORKSPACE_SLUG_HEADER]: "victim"
      })
    );

    expect(captures.length).toBe(1);
    expect(captures[0]?.kind).toBe("next");
    expect(captures[0]?.requestHeaders?.get(WORKSPACE_SLUG_HEADER)).toBeNull();
  });

  it("sets trusted slug from path and ignores forged client header on scoped API", () => {
    proxy(
      makeRequest("/alpha/api/dashboard/summary", {
        [WORKSPACE_SLUG_HEADER]: "victim"
      })
    );

    expect(captures.length).toBe(1);
    expect(captures[0]?.kind).toBe("rewrite");
    expect(captures[0]?.url?.pathname).toBe("/api/dashboard/summary");
    expect(captures[0]?.requestHeaders?.get(WORKSPACE_SLUG_HEADER)).toBe("alpha");
  });

  it("rewrites scoped billing API with trusted beta slug", () => {
    proxy(makeRequest("/beta/api/billing/checkout"));

    expect(captures.length).toBe(1);
    expect(captures[0]?.kind).toBe("rewrite");
    expect(captures[0]?.url?.pathname).toBe("/api/billing/checkout");
    expect(captures[0]?.requestHeaders?.get(WORKSPACE_SLUG_HEADER)).toBe("beta");
  });

  it("never attaches a trusted workspace header for reserved, locale, static, auth, or marketing paths", () => {
    const paths = [
      "/api/health",
      "/login",
      "/docs/quickstart",
      "/en/docs",
      "/_next/static/chunk.js",
      "/authenticate",
      "/pricing"
    ];

    for (const path of paths) {
      captures.length = 0;
      proxy(
        makeRequest(path, {
          [WORKSPACE_SLUG_HEADER]: "victim"
        })
      );
      for (const capture of captures) {
        expect(capture.requestHeaders?.get(WORKSPACE_SLUG_HEADER) ?? null).toBeNull();
      }
    }
  });

  it("preserves query strings on workspace API rewrites", () => {
    proxy(makeRequest("/alpha/api/dashboard/logs?limit=8&cursor=abc"));

    expect(captures[0]?.kind).toBe("rewrite");
    expect(captures[0]?.url?.pathname).toBe("/api/dashboard/logs");
    expect(captures[0]?.url?.search).toBe("?limit=8&cursor=abc");
    expect(captures[0]?.requestHeaders?.get(WORKSPACE_SLUG_HEADER)).toBe("alpha");
  });
});
