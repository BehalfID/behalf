import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: { next: vi.fn(), redirect: vi.fn(), rewrite: vi.fn() }
}));
vi.mock("next-intl/middleware", () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "de", "es", "fr"], defaultLocale: "en", localePrefix: "as-needed" }
}));

import { buildWorkspaceRewritePath, matchWorkspacePublicPath } from "@/proxy";

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

describe("workspace rewrite query preservation", () => {
  it("documents that pathname rewrite via nextUrl.clone keeps the search string", () => {
    // Mirrors proxy.ts: rewriteUrl = request.nextUrl.clone(); rewriteUrl.pathname = ...
    const original = new URL("http://example.test/trajectus/dashboard/agents?tab=all&q=1");
    const match = matchWorkspacePublicPath(original.pathname);
    expect(match).not.toBeNull();
    const rewritePath = buildWorkspaceRewritePath(match!);
    const cloned = new URL(original.href);
    cloned.pathname = rewritePath;
    expect(cloned.pathname).toBe("/workspace/trajectus/dashboard/agents");
    expect(cloned.search).toBe("?tab=all&q=1");
  });
});
