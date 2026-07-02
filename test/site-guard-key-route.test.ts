import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  checkRateLimit: vi.fn()
}));

const dbMocks = vi.hoisted(() => ({
  siteFindOne: vi.fn(),
  keyFind: vi.fn(),
  keyCreate: vi.fn(),
  keyFindOneAndUpdate: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: routeMocks.requireDeveloperApi
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: routeMocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limited." }, { status: 429 })
}));
vi.mock("@/models/Site", () => ({
  default: { findOne: dbMocks.siteFindOne }
}));
vi.mock("@/models/SiteGuardKey", () => ({
  default: {
    find: dbMocks.keyFind,
    create: dbMocks.keyCreate,
    findOneAndUpdate: dbMocks.keyFindOneAndUpdate
  }
}));

const authUser = { userId: "dev_test", primaryAccountId: "acct_test" };
const authContext = { user: authUser, activeAccountId: "acct_test", error: null };
const site = { siteId: "site_test", developerUserId: "dev_test", domain: "docs.example.com" };
const keyDoc = {
  keyId: "sgk_test",
  siteId: "site_test",
  accountId: "acct_test",
  developerUserId: "dev_test",
  name: "Test key",
  keyPreview: "bhf_site_testxx...yyyyyy",
  status: "active",
  createdAt: new Date("2026-05-01"),
  updatedAt: new Date("2026-05-01")
};

function siteKeysRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/dashboard/sites/site_test/keys", {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  }) as never;
}

function siteKeyRevokeRequest(keyId: string) {
  return new Request(`http://localhost/api/dashboard/sites/site_test/keys/${keyId}`, {
    method: "DELETE"
  }) as never;
}

describe("GET /api/dashboard/sites/[siteId]/keys", () => {
  beforeEach(() => {
    routeMocks.requireDeveloperApi.mockResolvedValue(authContext);
    dbMocks.siteFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(site) });
    dbMocks.keyFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([keyDoc])
    });
  });

  it("returns the key list without raw key or hash", async () => {
    const { GET } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await GET(siteKeysRequest("GET"), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(response.status).toBe(200);
    const json = await response.json() as { keys: typeof keyDoc[] };
    expect(json.keys).toHaveLength(1);
    expect(json.keys[0]).not.toHaveProperty("keyHash");
    expect(json.keys[0]).not.toHaveProperty("rawKey");
    expect(json.keys[0]).toMatchObject({ keyId: "sgk_test", keyPreview: "bhf_site_testxx...yyyyyy" });
  });

  it("scopes site and key queries to both developerUserId and accountId", async () => {
    const { GET } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    await GET(siteKeysRequest("GET"), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(dbMocks.siteFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ developerUserId: "dev_test", accountId: "acct_test" })
    );
    expect(dbMocks.keyFind).toHaveBeenCalledWith(
      expect.objectContaining({ developerUserId: "dev_test", accountId: "acct_test" })
    );
  });

  it("returns 404 when site is not owned by the developer", async () => {
    dbMocks.siteFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const { GET } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await GET(siteKeysRequest("GET"), { params: Promise.resolve({ siteId: "site_other" }) });

    expect(response.status).toBe(404);
  });

  it("returns 404 when a different account requests the site keys", async () => {
    routeMocks.requireDeveloperApi.mockResolvedValueOnce({
      user: { userId: "dev_other", primaryAccountId: "acct_other" },
      activeAccountId: "acct_other",
      error: null
    });
    dbMocks.siteFindOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) });
    const { GET } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await GET(siteKeysRequest("GET"), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(response.status).toBe(404);
  });

  it("returns 409 when the authenticated developer has no primary account", async () => {
    routeMocks.requireDeveloperApi.mockResolvedValueOnce({
      user: { userId: "dev_noaccount", primaryAccountId: null },
      activeAccountId: null,
      error: null
    });
    const { GET } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await GET(siteKeysRequest("GET"), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(response.status).toBe(409);
  });
});

describe("POST /api/dashboard/sites/[siteId]/keys", () => {
  beforeEach(() => {
    routeMocks.requireDeveloperApi.mockResolvedValue(authContext);
    dbMocks.siteFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(site) });
    dbMocks.keyCreate.mockResolvedValue(keyDoc);
  });

  it("creates a key and returns rawKey once", async () => {
    const { POST } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await POST(siteKeysRequest("POST", { name: "Test key" }), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(response.status).toBe(201);
    const json = await response.json() as { key: typeof keyDoc; rawKey: string };
    expect(json).toHaveProperty("rawKey");
    expect(json.rawKey).toMatch(/^bhf_site_/);
    expect(json.key).not.toHaveProperty("keyHash");
    expect(json.key.keyId).toBe("sgk_test");
  });

  it("scopes the site lookup to both developerUserId and accountId", async () => {
    const { POST } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    await POST(siteKeysRequest("POST", { name: "Test key" }), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(dbMocks.siteFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ developerUserId: "dev_test", accountId: "acct_test" })
    );
  });

  it("returns 404 when a different account tries to create a key", async () => {
    routeMocks.requireDeveloperApi.mockResolvedValueOnce({
      user: { userId: "dev_other", primaryAccountId: "acct_other" },
      activeAccountId: "acct_other",
      error: null
    });
    dbMocks.siteFindOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) });
    const { POST } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await POST(siteKeysRequest("POST", { name: "Key" }), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(response.status).toBe(404);
  });

  it("rejects a missing name", async () => {
    const { POST } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await POST(siteKeysRequest("POST", {}), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "name is required." });
  });

  it("rejects unknown fields", async () => {
    const { POST } = await import("@/app/api/dashboard/sites/[siteId]/keys/route");
    const response = await POST(siteKeysRequest("POST", { name: "Key", extra: true }), { params: Promise.resolve({ siteId: "site_test" }) });

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/dashboard/sites/[siteId]/keys/[keyId]", () => {
  beforeEach(() => {
    routeMocks.requireDeveloperApi.mockResolvedValue(authContext);
    dbMocks.siteFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(site) });
    dbMocks.keyFindOneAndUpdate.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...keyDoc, status: "revoked" })
    });
  });

  it("revokes an active key", async () => {
    const { DELETE } = await import("@/app/api/dashboard/sites/[siteId]/keys/[keyId]/route");
    const response = await DELETE(siteKeyRevokeRequest("sgk_test"), { params: Promise.resolve({ siteId: "site_test", keyId: "sgk_test" }) });

    expect(response.status).toBe(200);
    const json = await response.json() as { key: typeof keyDoc };
    expect(json.key.status).toBe("revoked");
    expect(json.key).not.toHaveProperty("keyHash");
  });

  it("scopes the site and key queries to both developerUserId and accountId", async () => {
    const { DELETE } = await import("@/app/api/dashboard/sites/[siteId]/keys/[keyId]/route");
    await DELETE(siteKeyRevokeRequest("sgk_test"), { params: Promise.resolve({ siteId: "site_test", keyId: "sgk_test" }) });

    expect(dbMocks.siteFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ developerUserId: "dev_test", accountId: "acct_test" })
    );
    expect(dbMocks.keyFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ developerUserId: "dev_test", accountId: "acct_test" }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("returns 404 when a different account tries to revoke a key", async () => {
    routeMocks.requireDeveloperApi.mockResolvedValueOnce({
      user: { userId: "dev_other", primaryAccountId: "acct_other" },
      activeAccountId: "acct_other",
      error: null
    });
    dbMocks.siteFindOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) });
    const { DELETE } = await import("@/app/api/dashboard/sites/[siteId]/keys/[keyId]/route");
    const response = await DELETE(siteKeyRevokeRequest("sgk_test"), { params: Promise.resolve({ siteId: "site_test", keyId: "sgk_test" }) });

    expect(response.status).toBe(404);
  });

  it("returns 409 when the authenticated developer has no primary account", async () => {
    routeMocks.requireDeveloperApi.mockResolvedValueOnce({
      user: { userId: "dev_noaccount", primaryAccountId: null },
      activeAccountId: null,
      error: null
    });
    const { DELETE } = await import("@/app/api/dashboard/sites/[siteId]/keys/[keyId]/route");
    const response = await DELETE(siteKeyRevokeRequest("sgk_test"), { params: Promise.resolve({ siteId: "site_test", keyId: "sgk_test" }) });

    expect(response.status).toBe(409);
  });

  it("returns 404 for an already-revoked or unknown key", async () => {
    dbMocks.keyFindOneAndUpdate.mockReturnValue({
      select: vi.fn().mockResolvedValue(null)
    });
    const { DELETE } = await import("@/app/api/dashboard/sites/[siteId]/keys/[keyId]/route");
    const response = await DELETE(siteKeyRevokeRequest("sgk_missing"), { params: Promise.resolve({ siteId: "site_test", keyId: "sgk_missing" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Site Guard key not found or already revoked." });
  });
});
