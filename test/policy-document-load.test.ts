import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMocks = vi.hoisted(() => ({
  findActivePolicyByAccountId: vi.fn()
}));

vi.mock("@/lib/repositories/policyDocuments", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/policyDocuments")>(
    "@/lib/repositories/policyDocuments"
  );
  return {
    ...actual,
    findActivePolicyByAccountId: repoMocks.findActivePolicyByAccountId
  };
});

describe("loadPolicyDocument", () => {
  beforeEach(async () => {
    repoMocks.findActivePolicyByAccountId.mockReset();
    const { clearPolicyDocumentCache } = await import("@/lib/policyEngine/loadPolicy");
    clearPolicyDocumentCache();
  });

  it("returns null when accountId is missing", async () => {
    const { loadPolicyDocument } = await import("@/lib/policyEngine/loadPolicy");
    await expect(loadPolicyDocument(undefined)).resolves.toBeNull();
    expect(repoMocks.findActivePolicyByAccountId).not.toHaveBeenCalled();
  });

  it("loads and caches an active policy document", async () => {
    repoMocks.findActivePolicyByAccountId.mockResolvedValue({
      policyId: "pol_1",
      accountId: "acct_1",
      version: 2,
      enabled: true,
      rules: [
        {
          id: "r1",
          priority: 1,
          when: [],
          then: "require_human",
          reason: "default"
        }
      ]
    });

    const { loadPolicyDocument } = await import("@/lib/policyEngine/loadPolicy");
    const first = await loadPolicyDocument("acct_1");
    const second = await loadPolicyDocument("acct_1");

    expect(first).toEqual(
      expect.objectContaining({
        accountId: "acct_1",
        version: 2,
        enabled: true,
        rules: [expect.objectContaining({ id: "r1" })]
      })
    );
    expect(second).toEqual(first);
    expect(repoMocks.findActivePolicyByAccountId).toHaveBeenCalledTimes(1);
  });

  it("treats empty-rule policies as null for verify compatibility", async () => {
    repoMocks.findActivePolicyByAccountId.mockResolvedValue({
      policyId: "pol_2",
      accountId: "acct_2",
      version: 1,
      enabled: true,
      rules: []
    });

    const { loadPolicyDocument } = await import("@/lib/policyEngine/loadPolicy");
    await expect(loadPolicyDocument("acct_2")).resolves.toBeNull();
  });
});

describe("validatePolicyRules", () => {
  it("rejects duplicate rule ids and unknown outcomes", async () => {
    const { validatePolicyRules } = await import("@/lib/repositories/policyDocuments");

    expect(
      validatePolicyRules([
        { id: "a", priority: 1, when: [], then: "allow", reason: "ok" },
        { id: "a", priority: 2, when: [], then: "deny", reason: "dup" }
      ]).error
    ).toMatch(/Duplicate rule id/);

    expect(
      validatePolicyRules([
        { id: "a", priority: 1, when: [], then: "maybe", reason: "bad" }
      ]).error
    ).toMatch(/then must be one of/);
  });
});
