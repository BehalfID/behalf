import { beforeEach, describe, expect, it, vi } from "vitest";

const tokenMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  requireVerifiedDeveloperApi: vi.fn(),
  connectToDatabase: vi.fn(),
  createDeveloperToken: vi.fn(),
  createPublicId: vi.fn(),
  tokenFind: vi.fn(),
  tokenCountDocuments: vi.fn(),
  tokenCreate: vi.fn(),
  tokenDeleteOne: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: tokenMocks.requireDeveloperApi,
  requireVerifiedDeveloperApi: tokenMocks.requireVerifiedDeveloperApi
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: tokenMocks.connectToDatabase }));
vi.mock("@/lib/ids", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ids")>()),
  createDeveloperToken: tokenMocks.createDeveloperToken,
  createPublicId: tokenMocks.createPublicId
}));
vi.mock("@/models/DeveloperApiToken", () => ({
  default: {
    find: tokenMocks.tokenFind,
    countDocuments: tokenMocks.tokenCountDocuments,
    create: tokenMocks.tokenCreate,
    deleteOne: tokenMocks.tokenDeleteOne
  }
}));

function dashboardRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/dashboard/tokens", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }) as never;
}

describe("dashboard developer token routes", () => {
  beforeEach(() => {
    const authValue = {
      user: { userId: "dev_test" },
      account: { accountId: "acct_test" },
      error: null
    };
    tokenMocks.requireDeveloperApi.mockResolvedValue(authValue);
    tokenMocks.requireVerifiedDeveloperApi.mockResolvedValue(authValue);
    tokenMocks.connectToDatabase.mockResolvedValue(undefined);
    tokenMocks.createDeveloperToken.mockReturnValue("bhf_dev_super_secret_value");
    tokenMocks.createPublicId.mockReturnValue("tok_test");
    tokenMocks.tokenCountDocuments.mockResolvedValue(0);
    tokenMocks.tokenCreate.mockResolvedValue({});
    tokenMocks.tokenDeleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  it("lists token metadata without raw token material", async () => {
    tokenMocks.tokenFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            tokenId: "tok_test",
            name: "CI",
            accountId: "acct_test",
            tokenPreview: "bhf_dev_supe...value",
            createdAt: new Date("2026-05-01T00:00:00.000Z"),
            lastUsedAt: new Date("2026-05-02T00:00:00.000Z")
          }
        ])
      })
    });
    const { GET } = await import("@/app/api/dashboard/tokens/route");

    const response = await GET(dashboardRequest("GET"));
    const json = await response.json();

    expect(json.tokens).toHaveLength(1);
    expect(JSON.stringify(json)).toContain("bhf_dev_supe...value");
    expect(JSON.stringify(json)).not.toContain("bhf_dev_super_secret_value");
    expect(tokenMocks.tokenFind).toHaveBeenCalledWith({ userId: "dev_test" });
  });

  it("returns the raw developer token only on create and stores a hash plus preview", async () => {
    const { POST } = await import("@/app/api/dashboard/tokens/route");
    const { hashDeveloperToken } = await import("@/lib/developerToken");

    const response = await POST(dashboardRequest("POST", { name: "CI" }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.token).toBe("bhf_dev_super_secret_value");
    expect(json.tokenPreview).toBe("bhf_dev_supe..._value");
    expect(tokenMocks.tokenCreate).toHaveBeenCalledWith(expect.objectContaining({
      tokenId: "tok_test",
      userId: "dev_test",
      accountId: "acct_test",
      name: "CI",
      tokenPreview: "bhf_dev_supe..._value",
      tokenHash: hashDeveloperToken("bhf_dev_super_secret_value")
    }));
    expect(JSON.stringify(tokenMocks.tokenCreate.mock.calls)).not.toContain("bhf_dev_super_secret_value");
  });

  it("revokes tokens by deleting only records owned by the current developer", async () => {
    const { DELETE } = await import("@/app/api/dashboard/tokens/[tokenId]/route");

    const response = await DELETE(dashboardRequest("DELETE"), {
      params: Promise.resolve({ tokenId: "tok_test" })
    });

    expect(response.status).toBe(204);
    expect(tokenMocks.tokenDeleteOne).toHaveBeenCalledWith({
      tokenId: "tok_test",
      userId: "dev_test"
    });
  });
});
