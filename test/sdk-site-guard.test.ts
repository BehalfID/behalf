/**
 * Unit tests for the @behalfid/sdk siteGuard.check() method.
 *
 * All fetch calls are mocked — no production network calls are made.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehalfID } from "../packages/sdk/src/client";

const SITE_KEY = "bhf_site_testkey12345";
const BASE_URL = "https://behalfid.com";

function makeFetchMock(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  });
}

const allowedResponse = {
  allowed: true,
  reason: "Path allowed by an active Site Guard rule.",
  requestId: "req_abc123",
  matchedRuleId: "sgr_xyz",
  siteId: "site_test"
};

const deniedResponse = {
  allowed: false,
  reason: "No matching active Site Guard rule.",
  requestId: "req_def456",
  matchedRuleId: null,
  siteId: "site_test"
};

describe("BehalfID.siteGuard.check — constructor", () => {
  it("accepts bhf_site_ keys without throwing", () => {
    expect(
      () => new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL })
    ).not.toThrow();
  });

  it("still accepts bhf_sk_ keys", () => {
    expect(
      () => new BehalfID({ apiKey: "bhf_sk_agentkey", baseUrl: BASE_URL })
    ).not.toThrow();
  });

  it("rejects keys with an unknown prefix", () => {
    expect(
      () => new BehalfID({ apiKey: "unknown_key", baseUrl: BASE_URL })
    ).toThrow(/apiKey must be a valid agent key.*or site key/i);
  });
});

describe("BehalfID.siteGuard.check — HTTP request shape", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetchMock(allowedResponse));
  });

  it("sends Authorization: Bearer <siteKey>", async () => {
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    await behalf.siteGuard.check({ path: "/docs/api" });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${SITE_KEY}`);
  });

  it("POSTs to /api/site-guard/check", async () => {
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    await behalf.siteGuard.check({ path: "/docs/api" });

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/site-guard/check`);
    expect(init.method).toBe("POST");
  });

  it("includes path, userAgent, and agentIdentifier in the request body", async () => {
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    await behalf.siteGuard.check({
      path: "/docs/getting-started",
      userAgent: "ExampleBot/1.0",
      agentIdentifier: "crawler_alpha"
    });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.path).toBe("/docs/getting-started");
    expect(body.userAgent).toBe("ExampleBot/1.0");
    expect(body.agentIdentifier).toBe("crawler_alpha");
  });

  it("does NOT include siteId in the body by default (site-key flow)", async () => {
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    await behalf.siteGuard.check({
      path: "/docs/api",
      userAgent: "Bot/1.0"
    });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("siteId");
    expect(body).not.toHaveProperty("domain");
  });

  it("includes optional metadata when provided", async () => {
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    await behalf.siteGuard.check({
      path: "/docs/api",
      metadata: { edge: "iad1", version: 2 }
    });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.metadata).toEqual({ edge: "iad1", version: 2 });
  });

  it("omits optional fields when not provided", async () => {
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    await behalf.siteGuard.check({ path: "/docs/api" });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("userAgent");
    expect(body).not.toHaveProperty("agentIdentifier");
    expect(body).not.toHaveProperty("metadata");
  });

  it("respects a custom baseUrl", async () => {
    const behalf = new BehalfID({
      apiKey: SITE_KEY,
      baseUrl: "https://dev.example.com",
      allowInsecureHttp: false
    });
    await behalf.siteGuard.check({ path: "/docs/api" });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://dev.example.com/api/site-guard/check");
  });
});

describe("BehalfID.siteGuard.check — response parsing", () => {
  it("returns typed SiteGuardCheckResult for an allowed response", async () => {
    vi.stubGlobal("fetch", makeFetchMock(allowedResponse));
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    const result = await behalf.siteGuard.check({ path: "/docs/api" });

    expect(result).toEqual({
      allowed: true,
      reason: "Path allowed by an active Site Guard rule.",
      requestId: "req_abc123",
      matchedRuleId: "sgr_xyz",
      siteId: "site_test"
    });
    expect(result.allowed).toBe(true);
  });

  it("returns typed SiteGuardCheckResult for a denied response", async () => {
    vi.stubGlobal("fetch", makeFetchMock(deniedResponse));
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });
    const result = await behalf.siteGuard.check({ path: "/admin/settings" });

    expect(result).toEqual({
      allowed: false,
      reason: "No matching active Site Guard rule.",
      requestId: "req_def456",
      matchedRuleId: null,
      siteId: "site_test"
    });
    expect(result.allowed).toBe(false);
  });
});

describe("BehalfID.siteGuard.check — error handling", () => {
  it("throws on HTTP 4xx/5xx and does not expose the raw site key in the message", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({ error: `unauthorized with token ${SITE_KEY}` }, 401)
    );
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });

    await expect(behalf.siteGuard.check({ path: "/docs/api" })).rejects.toThrow(/BehalfID:/);
    await expect(behalf.siteGuard.check({ path: "/docs/api" })).rejects.not.toThrow(SITE_KEY);

    const error = await behalf.siteGuard.check({ path: "/docs/api" }).catch((e: unknown) => e);
    expect((error as Error).message).toContain("bhf_site_[redacted]");
    expect((error as Error).message).not.toContain(SITE_KEY);
  });

  it("throws on network failure with a generic message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });

    await expect(behalf.siteGuard.check({ path: "/docs/api" })).rejects.toThrow(
      "BehalfID: Network request failed."
    );
  });

  it("throws synchronously when path is missing", () => {
    const behalf = new BehalfID({ apiKey: SITE_KEY, baseUrl: BASE_URL });

    expect(() =>
      behalf.siteGuard.check({ path: "" })
    ).toThrow(/siteGuard\.check requires a non-empty path/);
  });
});
