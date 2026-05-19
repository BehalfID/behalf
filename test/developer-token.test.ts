import { beforeEach, describe, expect, it, vi } from "vitest";

const developerTokenMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  tokenFindOne: vi.fn(),
  tokenUpdateOne: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: developerTokenMocks.connectToDatabase }));
vi.mock("@/models/DeveloperApiToken", () => ({
  default: {
    findOne: developerTokenMocks.tokenFindOne,
    updateOne: developerTokenMocks.tokenUpdateOne
  }
}));

function tokenRequest(token?: string) {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: token ? { "x-developer-token": token } : undefined
  }) as never;
}

describe("developer token authentication", () => {
  beforeEach(() => {
    developerTokenMocks.connectToDatabase.mockResolvedValue(undefined);
    developerTokenMocks.tokenUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("updates lastUsedAt for valid developer tokens", async () => {
    developerTokenMocks.tokenFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        tokenId: "tok_test",
        accountId: "acct_test",
        tokenHash: "stored_hash"
      })
    });
    const { authenticateDeveloperToken, hashDeveloperToken } = await import("@/lib/developerToken");

    const result = await authenticateDeveloperToken(tokenRequest("bhf_dev_super_secret_value"));

    expect(result.error).toBeNull();
    expect(developerTokenMocks.tokenFindOne).toHaveBeenCalledWith({
      tokenHash: hashDeveloperToken("bhf_dev_super_secret_value")
    });
    expect(developerTokenMocks.tokenUpdateOne).toHaveBeenCalledWith(
      { tokenId: "tok_test" },
      { $set: { lastUsedAt: expect.any(Date) } }
    );
  });

  it("does not update lastUsedAt for invalid developer tokens", async () => {
    developerTokenMocks.tokenFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null)
    });
    const { authenticateDeveloperToken } = await import("@/lib/developerToken");

    const result = await authenticateDeveloperToken(tokenRequest("bhf_dev_invalid_value"));

    expect(result).toEqual({ tokenDoc: null, error: "Invalid developer token." });
    expect(developerTokenMocks.tokenUpdateOne).not.toHaveBeenCalled();
  });

  it("does not expose raw developer tokens when lastUsedAt updates fail", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    developerTokenMocks.tokenFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        tokenId: "tok_test",
        accountId: "acct_test",
        tokenHash: "stored_hash"
      })
    });
    developerTokenMocks.tokenUpdateOne.mockRejectedValue(new Error("failed for bhf_dev_super_secret_value"));
    const { authenticateDeveloperToken } = await import("@/lib/developerToken");

    await expect(authenticateDeveloperToken(tokenRequest("bhf_dev_super_secret_value"))).resolves.toEqual(
      expect.objectContaining({ error: null })
    );
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("bhf_dev_super_secret_value");
    expect(JSON.stringify(consoleSpy.mock.calls)).toContain("bhf_dev_[redacted]");
    consoleSpy.mockRestore();
  });
});
