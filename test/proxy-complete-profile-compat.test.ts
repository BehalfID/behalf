import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: URL | string, init?: number | ResponseInit) => {
    const location = typeof url === "string" ? url : url.toString();
    const status =
      typeof init === "number" ? init : ((init as ResponseInit | undefined)?.status ?? 307);
    return new Response(null, {
      status,
      headers: { location }
    });
  })
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      redirect: redirectMock,
      next: vi.fn(() => new Response(null, { status: 200 }))
    }
  };
});

vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => () => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, "cookies", {
      value: { getAll: () => [] }
    });
    return response;
  })
}));

import { NextRequest } from "next/server";

describe("proxy complete-profile compatibility", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    vi.stubEnv("BEHALFID_SUBDOMAIN_ROUTING", "1");
    vi.stubEnv("BEHALFID_HOST_AUTH", "auth.behalfid.com");
    vi.stubEnv("BEHALFID_HOST_WWW", "www.behalfid.com");
    vi.stubEnv("BEHALFID_HOST_APP", "app.behalfid.com");
  });

  it("308s /auth/complete-profile → /complete-profile on the auth host", async () => {
    const { proxy } = await import("@/proxy");
    const res = proxy(
      new NextRequest(
        "https://auth.behalfid.com/auth/complete-profile?next=%2Fdashboard&provider=github"
      )
    );
    expect(redirectMock).toHaveBeenCalled();
    const location = res.headers.get("location") ?? "";
    expect(res.status).toBe(308);
    expect(location).toContain("/complete-profile");
    expect(location).toContain("next=%2Fdashboard");
    expect(location).toContain("provider=github");
    expect(location).not.toContain("/auth/complete-profile");
    expect(location).not.toContain("/auth/auth/");
  });

  it("308s www legacy path to auth host canonical URL in one hop", async () => {
    const { proxy } = await import("@/proxy");
    const res = proxy(
      new NextRequest("https://www.behalfid.com/auth/complete-profile?next=%2Fonboarding")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://auth.behalfid.com/complete-profile?next=%2Fonboarding"
    );
  });

  it("does not redirect the canonical /complete-profile path back to legacy", async () => {
    const { proxy } = await import("@/proxy");
    redirectMock.mockClear();
    proxy(new NextRequest("https://auth.behalfid.com/complete-profile?next=%2Fdashboard"));
    const legacyBounce = redirectMock.mock.calls.find(([url]) => {
      const location = typeof url === "string" ? url : url.toString();
      return location.includes("/auth/complete-profile");
    });
    expect(legacyBounce).toBeUndefined();
  });
});
