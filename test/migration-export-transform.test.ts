import { describe, expect, it } from "vitest";
import {
  EXPORT_TABLE_ORDER,
  POSTGRES_IMPORT_TABLES,
  camelToSnake,
  checksumRow,
  isObjectIdLike,
  splitManagedProfileProtectedRepos,
  transformDocument,
  transformValue
} from "../scripts/migration/lib/transform";

describe("migration export transforms", () => {
  it("maps camelCase keys to snake_case", () => {
    expect(camelToSnake("accountId")).toBe("account_id");
    expect(camelToSnake("stripeCustomerId")).toBe("stripe_customer_id");
    expect(camelToSnake("lastActivityAt")).toBe("last_activity_at");
    expect(camelToSnake("argumentFingerprint")).toBe("argument_fingerprint");
  });

  it("drops _id and __v", () => {
    const out = transformDocument({
      _id: { toHexString: () => "abc", constructor: { name: "ObjectId" } },
      __v: 0,
      accountId: "acct_1",
      name: "Demo"
    });
    expect(out).toEqual({ account_id: "acct_1", name: "Demo" });
    expect(out).not.toHaveProperty("_id");
    expect(out).not.toHaveProperty("__v");
  });

  it("converts Dates to ISO strings", () => {
    const date = new Date("2024-06-15T12:00:00.000Z");
    expect(transformValue(date)).toBe("2024-06-15T12:00:00.000Z");
    const out = transformDocument({
      createdAt: date,
      nested: { updatedAt: date }
    });
    expect(out.created_at).toBe("2024-06-15T12:00:00.000Z");
    expect((out.nested as { updated_at: string }).updated_at).toBe(
      "2024-06-15T12:00:00.000Z"
    );
  });

  it("converts ObjectId-like values to hex strings", () => {
    const oid = {
      _bsontype: "ObjectId",
      toHexString: () => "507f1f77bcf86cd799439011",
      toString: () => "507f1f77bcf86cd799439011"
    };
    expect(isObjectIdLike(oid)).toBe(true);
    expect(transformValue(oid)).toBe("507f1f77bcf86cd799439011");
  });

  it("splits managed profile protectedRepos into child-table rows", () => {
    const { policy, protectedRepos } = splitManagedProfileProtectedRepos({
      _id: { toHexString: () => "deadbeef", constructor: { name: "ObjectId" } },
      policyId: "mpp_1",
      accountId: "acct_1",
      timezone: "UTC",
      enabled: true,
      workHours: { enabled: false },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "unmanaged",
      toolModes: {},
      pausePolicy: {},
      protectedRepos: [
        {
          repoHash: "hash_a",
          label: "Backend",
          mode: "required",
          enabled: true
        },
        {
          repoHash: "hash_b",
          label: null,
          mode: "managed",
          enabled: false
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z")
    });

    expect(policy).not.toHaveProperty("protected_repos");
    expect(policy).not.toHaveProperty("_id");
    expect(policy.policy_id).toBe("mpp_1");
    expect(policy.account_id).toBe("acct_1");
    expect(policy.created_at).toBe("2024-01-01T00:00:00.000Z");

    expect(protectedRepos).toEqual([
      {
        policy_id: "mpp_1",
        account_id: "acct_1",
        repo_hash: "hash_a",
        label: "Backend",
        mode: "required",
        enabled: true
      },
      {
        policy_id: "mpp_1",
        account_id: "acct_1",
        repo_hash: "hash_b",
        label: null,
        mode: "managed",
        enabled: false
      }
    ]);
  });

  it("keeps CliAuditLog mapped to cli_audit_activities in export order", () => {
    expect(EXPORT_TABLE_ORDER).toContain("cli_audit_activities");
    expect(EXPORT_TABLE_ORDER).not.toContain("cli_audit_logs");
    expect(POSTGRES_IMPORT_TABLES.has("cli_audit_activities")).toBe(true);
  });

  it("imports policy and collaboration tables after drizzle/0005", () => {
    expect(EXPORT_TABLE_ORDER).toContain("policy_documents");
    expect(EXPORT_TABLE_ORDER).toContain("integration_bindings");
    expect(EXPORT_TABLE_ORDER).toContain("collaboration_message_refs");
    expect(POSTGRES_IMPORT_TABLES.has("policy_documents")).toBe(true);
    expect(POSTGRES_IMPORT_TABLES.has("integration_bindings")).toBe(true);
    expect(POSTGRES_IMPORT_TABLES.has("collaboration_message_refs")).toBe(true);
  });

  it("places log tables after state tables", () => {
    const agentsIdx = EXPORT_TABLE_ORDER.indexOf("agents");
    const verificationIdx = EXPORT_TABLE_ORDER.indexOf("verification_logs");
    const cliAuditIdx = EXPORT_TABLE_ORDER.indexOf("cli_audit_activities");
    expect(agentsIdx).toBeGreaterThanOrEqual(0);
    expect(verificationIdx).toBeGreaterThan(agentsIdx);
    expect(cliAuditIdx).toBeGreaterThan(verificationIdx);
  });

  it("builds stable checksums over selected columns", () => {
    const a = checksumRow(
      { account_id: "acct_1", name: "A", plan: "free" },
      ["account_id", "plan"]
    );
    const b = checksumRow(
      { plan: "free", account_id: "acct_1", name: "ignored" },
      ["account_id", "plan"]
    );
    expect(a).toBe(b);
  });
});
