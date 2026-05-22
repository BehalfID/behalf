/**
 * Tests for the Site Guard helper behavior used in both the Next.js and
 * Express examples (examples/site-guard-nextjs and examples/site-guard-express).
 *
 * These tests verify the contract that all Site Guard helpers must satisfy:
 *  - Sends Authorization: Bearer with the site key (never siteId)
 *  - Does NOT include siteId in the body for the site-key flow
 *  - Allowed decision passes through (returns allowed: true)
 *  - Denied decision fails closed (returns allowed: false)
 *  - Failed fetch fails closed (returns allowed: false)
 *  - Missing SITE_GUARD_KEY env var fails closed (returns allowed: false)
 *  - Non-2xx response from BehalfID fails closed (returns allowed: false)
 *
 * fetch is mocked globally — no live BehalfID server is required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The helper function under test.
// This is the same logic used in both example packages.  It is defined
// inline here so the test does not depend on the examples/ directory being
// part of the TypeScript project (examples/ is excluded in tsconfig.json).
// ---------------------------------------------------------------------------

type SiteGuardDecision = {
  allowed: boolean;
  reason: string;
  requestId: string;
  matchedRuleId: string | null;
  siteId: string | null;
};

type SiteGuardInput = {
  path: string;
  userAgent: string;
  agentIdentifier?: string;
};

function failClosed(reason: string): SiteGuardDecision {
  return { allowed: false, reason, requestId: "", matchedRuleId: null, siteId: null };
}

async function checkSiteGuardAccess(
  input: SiteGuardInput,
): Promise<SiteGuardDecision> {
  const baseUrl = process.env.BEHALFID_BASE_URL ?? "https://behalfid.com";
  const key = process.env.SITE_GUARD_KEY;

  if (!key) {
    return failClosed("SITE_GUARD_KEY is not configured.");
  }

  try {
    const response = await fetch(`${baseUrl}/api/site-guard/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        path: input.path,
        userAgent: input.userAgent,
        agentIdentifier: input.agentIdentifier,
      }),
    });

    if (!response.ok) {
      return failClosed("Site Guard check returned an error.");
    }

    return (await response.json()) as SiteGuardDecision;
  } catch {
    return failClosed("Site Guard is unavailable.");
  }
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  // Default env — tests that need a missing key override this.
  process.env.SITE_GUARD_KEY = "bhf_site_test_key";
  process.env.BEHALFID_BASE_URL = "https://behalfid.com";
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDecision(decision: Partial<SiteGuardDecision>, status = 200) {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ allowed: true, reason: "", requestId: "req_1", matchedRuleId: null, siteId: "site_1", ...decision }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const sampleInput: SiteGuardInput = {
  path: "/docs/api",
  userAgent: "ExampleBot/1.0",
  agentIdentifier: "crawler_example",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkSiteGuardAccess — authorization", () => {
  it("sends Authorization: Bearer with the site key", async () => {
    mockDecision({ allowed: true });

    await checkSiteGuardAccess(sampleInput);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer bhf_site_test_key");
  });

  it("does NOT include siteId in the request body for the site-key flow", async () => {
    mockDecision({ allowed: true });

    await checkSiteGuardAccess(sampleInput);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("siteId");
    expect(body).not.toHaveProperty("domain");
  });

  it("sends path, userAgent, and agentIdentifier in the body", async () => {
    mockDecision({ allowed: true });

    await checkSiteGuardAccess(sampleInput);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.path).toBe("/docs/api");
    expect(body.userAgent).toBe("ExampleBot/1.0");
    expect(body.agentIdentifier).toBe("crawler_example");
  });

  it("omits agentIdentifier from the body when not provided", async () => {
    mockDecision({ allowed: true });

    await checkSiteGuardAccess({ path: "/docs/api", userAgent: "ExampleBot/1.0" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.agentIdentifier).toBeUndefined();
  });

  it("calls the correct BehalfID endpoint", async () => {
    mockDecision({ allowed: true });

    await checkSiteGuardAccess(sampleInput);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://behalfid.com/api/site-guard/check");
  });

  it("uses BEHALFID_BASE_URL when set", async () => {
    process.env.BEHALFID_BASE_URL = "http://localhost:3000";
    mockDecision({ allowed: true });

    await checkSiteGuardAccess(sampleInput);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/api/site-guard/check");
  });
});

describe("checkSiteGuardAccess — allowed decision", () => {
  it("returns allowed: true when Site Guard allows the path", async () => {
    mockDecision({ allowed: true, reason: "Path allowed by an active Site Guard rule.", requestId: "req_abc" });

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(true);
    expect(decision.requestId).toBe("req_abc");
  });
});

describe("checkSiteGuardAccess — denied decision", () => {
  it("returns allowed: false when Site Guard denies the path", async () => {
    mockDecision({ allowed: false, reason: "Path is blocked by an active Site Guard rule." });

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Path is blocked by an active Site Guard rule.");
  });

  it("returns allowed: false when no rule matches (deny by default)", async () => {
    mockDecision({ allowed: false, reason: "No matching active Site Guard rule." });

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(false);
  });
});

describe("checkSiteGuardAccess — fail closed behaviors", () => {
  it("fails closed when SITE_GUARD_KEY is not set", async () => {
    delete process.env.SITE_GUARD_KEY;

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("SITE_GUARD_KEY");
    // fetch must not have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fails closed when fetch throws (network error)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("unavailable");
  });

  it("fails closed when BehalfID returns a non-2xx response", async () => {
    mockDecision({ allowed: false }, 500);

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("error");
  });

  it("fails closed on HTTP 503 from BehalfID", async () => {
    mockFetch.mockResolvedValue(
      new Response("Service Unavailable", { status: 503 }),
    );

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(false);
  });

  it("fails closed on HTTP 401 (invalid key)", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).toBe(false);
  });
});

describe("checkSiteGuardAccess — fail-closed contract: no accidental allows", () => {
  it("never returns allowed: true on a network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).not.toBe(true);
  });

  it("never returns allowed: true on a missing key", async () => {
    delete process.env.SITE_GUARD_KEY;

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).not.toBe(true);
  });

  it("never returns allowed: true on a 5xx error", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 500 }));

    const decision = await checkSiteGuardAccess(sampleInput);

    expect(decision.allowed).not.toBe(true);
  });
});
