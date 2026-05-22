import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  authenticateDeveloperToken: vi.fn(),
  authenticateSiteGuardKey: vi.fn(),
  updateSiteGuardKeyLastUsed: vi.fn(),
  checkRateLimit: vi.fn(),
  checkSiteAccess: vi.fn()
}));

vi.mock("@/lib/developerToken", () => ({
  authenticateDeveloperToken: routeMocks.authenticateDeveloperToken
}));
vi.mock("@/lib/siteGuardKey", () => ({
  authenticateSiteGuardKey: routeMocks.authenticateSiteGuardKey,
  updateSiteGuardKeyLastUsed: routeMocks.updateSiteGuardKeyLastUsed
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: routeMocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limited." }, { status: 429 })
}));
vi.mock("@/lib/siteGuard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/siteGuard")>()),
  checkSiteAccess: routeMocks.checkSiteAccess
}));

const keyDoc = {
  keyId: "sgk_test",
  siteId: "site_from_key",
  accountId: "acct_key",
  developerUserId: "dev_key",
  name: "Test key",
  keyPreview: "bhf_site_testxx...yyyyyy",
  status: "active"
};

function siteGuardRequest(body: unknown, token?: string, siteKeyToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-developer-token"] = token;
  if (siteKeyToken) headers["authorization"] = `Bearer ${siteKeyToken}`;
  return new Request("http://localhost/api/site-guard/check", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body)
  }) as never;
}

describe("POST /api/site-guard/check route", () => {
  beforeEach(() => {
    routeMocks.checkRateLimit.mockResolvedValue({ limited: false });
    routeMocks.authenticateSiteGuardKey.mockResolvedValue({ keyDoc: null, error: null });
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

  it("returns allowed and denied decisions via developer token", async () => {
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

  it("uses the site key scope and ignores body siteId/domain", async () => {
    routeMocks.authenticateSiteGuardKey.mockResolvedValue({ keyDoc, error: null });
    routeMocks.checkSiteAccess.mockResolvedValueOnce({
      allowed: true,
      reason: "Path allowed by an active Site Guard rule.",
      requestId: "req_key",
      matchedRuleId: "sgr_key",
      siteId: "site_from_key",
      risk: "low"
    });

    const { POST } = await import("@/app/api/site-guard/check/route");
    const response = await POST(siteGuardRequest(
      { siteId: "site_attacker", domain: "evil.example", path: "/docs/api", userAgent: "Bot/1.0" },
      undefined,
      "bhf_site_validkey"
    ));

    expect(response.status).toBe(200);
    expect(routeMocks.checkSiteAccess).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: "site_from_key", accountId: "acct_key" })
    );
    // siteId override from body must not reach checkSiteAccess
    expect(routeMocks.checkSiteAccess).not.toHaveBeenCalledWith(
      expect.objectContaining({ siteId: "site_attacker" })
    );
    expect(routeMocks.authenticateDeveloperToken).not.toHaveBeenCalled();
    expect(routeMocks.updateSiteGuardKeyLastUsed).toHaveBeenCalledWith("sgk_test");
  });

  it("rejects an invalid or revoked site key with 401", async () => {
    routeMocks.authenticateSiteGuardKey.mockResolvedValue({ keyDoc: null, error: "Site Guard key has been revoked." });

    const { POST } = await import("@/app/api/site-guard/check/route");
    const response = await POST(siteGuardRequest(
      { path: "/docs", userAgent: "Bot/1.0" },
      undefined,
      "bhf_site_revokedkey"
    ));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Site Guard key has been revoked." });
    expect(routeMocks.checkSiteAccess).not.toHaveBeenCalled();
  });

  it("requires siteId or domain when using a developer token", async () => {
    const { POST } = await import("@/app/api/site-guard/check/route");
    const response = await POST(siteGuardRequest({ path: "/docs", userAgent: "Bot/1.0" }, "bhf_dev_test"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "siteId or domain is required." });
  });

  it("returns 401 when no auth is provided", async () => {
    routeMocks.authenticateDeveloperToken.mockResolvedValueOnce({ tokenDoc: null, error: null });
    const { POST } = await import("@/app/api/site-guard/check/route");
    const missingAuth = await POST(siteGuardRequest({ siteId: "site_test", userAgent: "bot", path: "/a" }));

    expect(missingAuth.status).toBe(401);
    await expect(missingAuth.json()).resolves.toEqual({ error: "Site Guard key or developer token required." });
  });

  it("rejects malformed JSON before auth checks", async () => {
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
