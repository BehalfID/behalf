import { describe, expect, it } from "vitest";
import {
  EXPORT_COLLECTION_ORDER,
  dropMongoId,
  splitManagedProfilePolicy,
  toSnakeCaseRow,
  transformAccount,
  transformApprovalRequest
} from "../scripts/migration/transform";

describe("migration transforms", () => {
  it("drops Mongo _id and converts timestamps", () => {
    const row = transformAccount({
      _id: "objectid",
      accountId: "acct_1",
      name: "Acme",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    });

    expect(row).not.toHaveProperty("_id");
    expect(row).toEqual({
      account_id: "acct_1",
      name: "Acme",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z"
    });
  });

  it("splits managed profile protected repos into child rows", () => {
    const split = splitManagedProfilePolicy({
      _id: "x",
      policyId: "pprf_1",
      accountId: "acct_1",
      enabled: true,
      protectedRepos: [
        { repoHash: "abc", label: "Main", mode: "required", enabled: true },
        { repoHash: "def", mode: "managed" }
      ]
    });

    expect(split.policy).not.toHaveProperty("protected_repos");
    expect(split.policy.policy_id).toBe("pprf_1");
    expect(split.protectedRepos).toEqual([
      {
        policy_id: "pprf_1",
        account_id: "acct_1",
        repo_hash: "abc",
        label: "Main",
        mode: "required",
        enabled: true
      },
      {
        policy_id: "pprf_1",
        account_id: "acct_1",
        repo_hash: "def",
        label: null,
        mode: "managed",
        enabled: true
      }
    ]);
  });

  it("preserves approval argument fingerprint fields", () => {
    const row = transformApprovalRequest({
      approvalId: "apr_1",
      requestId: "req_1",
      argumentFingerprint: "f".repeat(64),
      usedAt: new Date("2026-02-01T00:00:00.000Z")
    });

    expect(row.argument_fingerprint).toBe("f".repeat(64));
    expect(row.used_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("exports collections in FK-safe order", () => {
    expect(EXPORT_COLLECTION_ORDER[0]).toBe("accounts");
    expect(EXPORT_COLLECTION_ORDER.indexOf("agents")).toBeLessThan(
      EXPORT_COLLECTION_ORDER.indexOf("permissions")
    );
    expect(EXPORT_COLLECTION_ORDER.indexOf("permissions")).toBeLessThan(
      EXPORT_COLLECTION_ORDER.indexOf("approval_requests")
    );
    expect(EXPORT_COLLECTION_ORDER.indexOf("verification_logs")).toBeGreaterThan(
      EXPORT_COLLECTION_ORDER.indexOf("agents")
    );
  });

  it("dropMongoId and toSnakeCaseRow are composable", () => {
    expect(toSnakeCaseRow(dropMongoId({ _id: 1, fooBar: 2 }))).toEqual({ foo_bar: 2 });
  });
});
