import { beforeEach, describe, expect, it, vi } from "vitest";

const keyMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  keyFindOne: vi.fn(),
  keyUpdateOne: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: keyMocks.connectToDatabase }));
vi.mock("@/models/SiteGuardKey", () => ({
  default: {
    findOne: keyMocks.keyFindOne,
    updateOne: keyMocks.keyUpdateOne
  }
}));

const keyDoc = {
  keyId: "sgk_test",
  siteId: "site_test",
  accountId: "acct_test",
  developerUserId: "dev_test",
  name: "Test key",
  keyPreview: "bhf_site_testxx...yyyyyy",
  status: "active" as const
};

function requestWithBearer(token?: string) {
  return new Request("http://localhost/api/site-guard/check", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {}
  }) as never;
}

describe("getSiteGuardKeyFromHeader", () => {
  it("extracts a bhf_site_ token from Authorization: Bearer", async () => {
    const { getSiteGuardKeyFromHeader } = await import("@/lib/siteGuardKey");
    expect(getSiteGuardKeyFromHeader(requestWithBearer("bhf_site_abc123"))).toBe("bhf_site_abc123");
  });

  it("returns null for non-bhf_site_ tokens and missing header", async () => {
    const { getSiteGuardKeyFromHeader } = await import("@/lib/siteGuardKey");
    expect(getSiteGuardKeyFromHeader(requestWithBearer("bhf_dev_abc123"))).toBeNull();
    expect(getSiteGuardKeyFromHeader(requestWithBearer())).toBeNull();
    expect(getSiteGuardKeyFromHeader(requestWithBearer(""))).toBeNull();
  });

  it("returns null when there are extra tokens after the bearer value", async () => {
    const { getSiteGuardKeyFromHeader } = await import("@/lib/siteGuardKey");
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer bhf_site_abc extra" }
    }) as never;
    expect(getSiteGuardKeyFromHeader(req)).toBeNull();
  });
});

describe("hashSiteGuardKey / previewSiteGuardKey", () => {
  it("produces a hex hash and a safe preview", async () => {
    const { hashSiteGuardKey, previewSiteGuardKey } = await import("@/lib/siteGuardKey");
    const token = "bhf_site_abcdefghijklmnopqrstuvwxyz012345";
    expect(hashSiteGuardKey(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSiteGuardKey(token)).toBe(hashSiteGuardKey(token));
    const preview = previewSiteGuardKey(token);
    expect(preview).toMatch(/^bhf_site_/);
    expect(preview).toContain("...");
    expect(preview).not.toBe(token);
  });
});

describe("authenticateSiteGuardKey", () => {
  beforeEach(() => {
    keyMocks.connectToDatabase.mockResolvedValue(undefined);
    keyMocks.keyFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(keyDoc)
    });
  });

  it("returns null keyDoc when no bhf_site_ header is present", async () => {
    const { authenticateSiteGuardKey } = await import("@/lib/siteGuardKey");
    const result = await authenticateSiteGuardKey(requestWithBearer("bhf_dev_other"));
    expect(result).toEqual({ keyDoc: null, error: null });
    expect(keyMocks.keyFindOne).not.toHaveBeenCalled();
  });

  it("returns error when hash lookup finds nothing", async () => {
    keyMocks.keyFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null)
    });
    const { authenticateSiteGuardKey } = await import("@/lib/siteGuardKey");
    const result = await authenticateSiteGuardKey(requestWithBearer("bhf_site_unknown"));
    expect(result).toEqual({ keyDoc: null, error: "Invalid Site Guard key." });
  });

  it("returns error for a revoked key", async () => {
    keyMocks.keyFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...keyDoc, status: "revoked" })
    });
    const { authenticateSiteGuardKey } = await import("@/lib/siteGuardKey");
    const result = await authenticateSiteGuardKey(requestWithBearer("bhf_site_revoked123"));
    expect(result).toEqual({ keyDoc: null, error: "Site Guard key has been revoked." });
  });

  it("returns the keyDoc for a valid active key", async () => {
    const { authenticateSiteGuardKey } = await import("@/lib/siteGuardKey");
    const result = await authenticateSiteGuardKey(requestWithBearer("bhf_site_valid123456"));
    expect(result).toEqual({ keyDoc, error: null });
  });
});
