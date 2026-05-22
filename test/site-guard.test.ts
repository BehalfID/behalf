import { beforeEach, describe, expect, it, vi } from "vitest";

const siteGuardMocks = vi.hoisted(() => ({
  siteFindOne: vi.fn(),
  ruleFind: vi.fn(),
  logCreate: vi.fn()
}));

vi.mock("@/models/Site", () => ({
  default: { findOne: siteGuardMocks.siteFindOne }
}));

vi.mock("@/models/SiteAccessRule", () => ({
  default: { find: siteGuardMocks.ruleFind }
}));

vi.mock("@/models/SiteAccessLog", () => ({
  default: { create: siteGuardMocks.logCreate }
}));

const input = {
  accountId: "acct_site",
  developerUserId: "dev_site",
  siteId: "site_test",
  path: "/docs/api",
  userAgent: "ExampleBot/1.0",
  agentIdentifier: "crawler_example"
};

const site = {
  siteId: "site_test",
  accountId: "acct_site",
  developerUserId: "dev_site",
  domain: "docs.example.com",
  status: "active"
};

function rule(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: "sgr_test",
    status: "active",
    agentIdentifier: "crawler_example",
    userAgentPattern: undefined,
    allowedPaths: ["/docs/*"],
    blockedPaths: [],
    requiresApproval: false,
    ...overrides
  };
}

function mockRules(rules: unknown[]) {
  siteGuardMocks.ruleFind.mockReturnValue({
    sort: vi.fn().mockResolvedValue(rules)
  });
}

describe("Site Guard decisions", () => {
  beforeEach(() => {
    siteGuardMocks.siteFindOne.mockResolvedValue(site);
    siteGuardMocks.logCreate.mockResolvedValue({});
    mockRules([rule()]);
  });

  it("matches exact and wildcard paths", async () => {
    const { sitePathMatches } = await import("@/lib/siteGuard");

    expect(sitePathMatches("/docs/api", "/docs/api")).toBe(true);
    expect(sitePathMatches("/docs/*", "/docs/api")).toBe(true);
    expect(sitePathMatches("/docs/api", "/docs/api/v2")).toBe(false);
    expect(sitePathMatches("/docs/*", "/admin")).toBe(false);
  });

  it("lets blocked paths override allowed paths", async () => {
    const { evaluateSiteAccess } = await import("@/lib/siteGuard");
    const decision = evaluateSiteAccess(site as never, [
      rule({ allowedPaths: ["/docs/*"], blockedPaths: ["/docs/private/*"] }),
      rule({ ruleId: "sgr_allow", allowedPaths: ["/docs/private/*"] })
    ] as never, { ...input, path: "/docs/private/key" });

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      matchedRuleId: "sgr_test",
      reason: "Path is blocked by an active Site Guard rule."
    }));
  });

  it("allows active matching rules and denies by default otherwise", async () => {
    const { evaluateSiteAccess } = await import("@/lib/siteGuard");

    expect(evaluateSiteAccess(site as never, [rule()] as never, input)).toEqual(
      expect.objectContaining({ allowed: true, matchedRuleId: "sgr_test" })
    );
    expect(evaluateSiteAccess(site as never, [] as never, input)).toEqual(
      expect.objectContaining({ allowed: false, reason: "No matching active Site Guard rule." })
    );
  });

  it("denies disabled sites and skips disabled rules", async () => {
    const { evaluateSiteAccess } = await import("@/lib/siteGuard");

    expect(evaluateSiteAccess({ status: "disabled" } as never, [rule()] as never, input)).toEqual(
      expect.objectContaining({ allowed: false, reason: "Site is disabled." })
    );
    expect(evaluateSiteAccess(site as never, [rule({ status: "disabled" })] as never, input)).toEqual(
      expect.objectContaining({ allowed: false, reason: "No matching active Site Guard rule." })
    );
  });

  it("denies matching allowed paths when the rule requires approval", async () => {
    const { evaluateSiteAccess } = await import("@/lib/siteGuard");

    expect(evaluateSiteAccess(site as never, [rule({ requiresApproval: true })] as never, input)).toEqual(
      expect.objectContaining({
        allowed: false,
        matchedRuleId: "sgr_test",
        reason: "Site Guard rule requires approval before access.",
        risk: "medium"
      })
    );
  });

  it("scopes site and rule lookup to the developer token owner", async () => {
    const { checkSiteAccess } = await import("@/lib/siteGuard");

    await checkSiteAccess(input);

    expect(siteGuardMocks.siteFindOne).toHaveBeenCalledWith({
      accountId: "acct_site",
      developerUserId: "dev_site",
      siteId: "site_test"
    });
    expect(siteGuardMocks.ruleFind).toHaveBeenCalledWith({
      accountId: "acct_site",
      developerUserId: "dev_site",
      siteId: "site_test"
    });
  });

  it("writes logs for allowed and denied existing-site decisions", async () => {
    const { checkSiteAccess } = await import("@/lib/siteGuard");

    const allowed = await checkSiteAccess(input);
    mockRules([]);
    const denied = await checkSiteAccess(input);

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(siteGuardMocks.logCreate).toHaveBeenCalledWith(expect.objectContaining({
      requestId: allowed.requestId,
      siteId: "site_test",
      ruleId: "sgr_test",
      allowed: true
    }));
    expect(siteGuardMocks.logCreate).toHaveBeenCalledWith(expect.objectContaining({
      requestId: denied.requestId,
      siteId: "site_test",
      allowed: false
    }));
  });

  it("redacts secret-looking metadata and fails closed on lookup or log errors", async () => {
    const { checkSiteAccess, sanitizeSiteGuardMetadata } = await import("@/lib/siteGuard");

    expect(sanitizeSiteGuardMetadata({
      edge: "iad1",
      authorization: "Bearer secret",
      cookie: "session=secret",
      nested: { token: "secret" }
    })).toEqual({
      edge: "iad1",
      authorization: "[redacted]",
      cookie: "[redacted]",
      nested: "[omitted]"
    });

    siteGuardMocks.siteFindOne.mockRejectedValueOnce(new Error("db down"));
    await expect(checkSiteAccess(input)).resolves.toEqual(expect.objectContaining({
      allowed: false,
      reason: "Site Guard failed closed."
    }));

    siteGuardMocks.logCreate.mockRejectedValueOnce(new Error("log down"));
    await expect(checkSiteAccess(input)).resolves.toEqual(expect.objectContaining({
      allowed: false,
      reason: "Site Guard failed closed."
    }));
  });
});
