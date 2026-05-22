import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  authenticateDeveloperToken: vi.fn(),
  checkRateLimit: vi.fn(),
  checkSiteAccess: vi.fn()
}));

vi.mock("@/lib/developerToken", () => ({
  authenticateDeveloperToken: routeMocks.authenticateDeveloperToken
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: routeMocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limited." }, { status: 429 })
}));
vi.mock("@/lib/siteGuard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/siteGuard")>()),
  checkSiteAccess: routeMocks.checkSiteAccess
}));

function siteGuardRequest(body: unknown, token?: string) {
  return new Request("http://localhost/api/site-guard/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-developer-token": token } : {})
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  }) as never;
}

describe("POST /api/site-guard/check route", () => {
  beforeEach(() => {
    routeMocks.checkRateLimit.mockResolvedValue({ limited: false });
    routeMocks.authenticateDeveloperToken.mockResolvedValue({
      tokenDoc: { accountId: "acct_site", userId: "dev_site" },
      error: null
    });
    routeMocks.checkSiteAccess.mockResolvedValue({
      allowed: true,
      reason: "Path allowed by an active Site Guard rule.",
      requestId: "req_site",
      matchedRuleId: "sgr_site",
      siteId: "site_test",
      risk: "low"
    });
  });

  it("returns allowed and denied decisions", async () => {
    const { POST } = await import("@/app/api/site-guard/check/route");
    const allowed = await POST(siteGuardRequest({
      siteId: "site_test",
      path: "/docs/api",
      userAgent: "ExampleBot/1.0"
    }, "bhf_dev_test"));

    routeMocks.checkSiteAccess.mockResolvedValueOnce({
      allowed: false,
      reason: "No matching active Site Guard rule.",
      requestId: "req_denied",
      matchedRuleId: null,
      siteId: "site_test",
      risk: "high"
    });
    const denied = await POST(siteGuardRequest({
      siteId: "site_test",
      path: "/admin",
      userAgent: "ExampleBot/1.0"
    }, "bhf_dev_test"));

    await expect(allowed.json()).resolves.toEqual({
      allowed: true,
      reason: "Path allowed by an active Site Guard rule.",
      requestId: "req_site",
      matchedRuleId: "sgr_site",
      siteId: "site_test"
    });
    await expect(denied.json()).resolves.toEqual(expect.objectContaining({
      allowed: false,
      reason: "No matching active Site Guard rule."
    }));
  });

  it("rejects invalid route fields and missing auth", async () => {
    const { POST } = await import("@/app/api/site-guard/check/route");
    const malformed = await POST(siteGuardRequest({ siteId: "site_test", userAgent: "bot", path: "/a?secret=1" }));
    routeMocks.authenticateDeveloperToken.mockResolvedValueOnce({ tokenDoc: null, error: null });
    const missingAuth = await POST(siteGuardRequest({ siteId: "site_test", userAgent: "bot", path: "/a" }));

    expect(malformed.status).toBe(400);
    expect(missingAuth.status).toBe(401);
    await expect(missingAuth.json()).resolves.toEqual({ error: "Developer token required." });
  });

  it("rejects malformed JSON before a Site Guard check", async () => {
    const { POST } = await import("@/app/api/site-guard/check/route");

    const response = await POST(siteGuardRequest("{bad json", "bhf_dev_test"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Request body must be valid JSON." });
    expect(routeMocks.authenticateDeveloperToken).not.toHaveBeenCalled();
    expect(routeMocks.checkSiteAccess).not.toHaveBeenCalled();
  });

  it("returns fail-closed decisions for missing or disabled sites", async () => {
    const { POST } = await import("@/app/api/site-guard/check/route");
    routeMocks.checkSiteAccess.mockResolvedValueOnce({
      allowed: false,
      reason: "Site not found.",
      requestId: "req_missing",
      matchedRuleId: null,
      siteId: null,
      risk: "high"
    });
    const missing = await POST(siteGuardRequest({ domain: "missing.example", path: "/docs", userAgent: "bot" }, "bhf_dev_test"));
    routeMocks.checkSiteAccess.mockResolvedValueOnce({
      allowed: false,
      reason: "Site is disabled.",
      requestId: "req_disabled",
      matchedRuleId: null,
      siteId: "site_disabled",
      risk: "high"
    });
    const disabled = await POST(siteGuardRequest({ siteId: "site_disabled", path: "/docs", userAgent: "bot" }, "bhf_dev_test"));

    await expect(missing.json()).resolves.toEqual(expect.objectContaining({ allowed: false, siteId: null }));
    await expect(disabled.json()).resolves.toEqual(expect.objectContaining({
      allowed: false,
      reason: "Site is disabled.",
      siteId: "site_disabled"
    }));
  });
});
