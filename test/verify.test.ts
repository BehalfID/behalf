import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionFixture, verificationRequestFixture } from "./fixtures";

const modelMocks = vi.hoisted(() => ({
  permissionFind: vi.fn(),
  permissionUpdateOne: vi.fn(),
  agentUpdateOne: vi.fn(),
  verificationLogCreate: vi.fn(),
  approvalRequestFindOne: vi.fn(),
  approvalRequestFindOneAndUpdate: vi.fn(),
  approvalRequestUpdateOne: vi.fn()
}));

vi.mock("@/models/Permission", () => ({
  default: {
    find: modelMocks.permissionFind,
    updateOne: modelMocks.permissionUpdateOne
  }
}));

vi.mock("@/models/Agent", () => ({
  default: {
    updateOne: modelMocks.agentUpdateOne
  }
}));

vi.mock("@/models/VerificationLog", () => ({
  default: {
    create: modelMocks.verificationLogCreate
  }
}));

vi.mock("@/models/ApprovalRequest", () => ({
  default: {
    findOne: modelMocks.approvalRequestFindOne,
    findOneAndUpdate: modelMocks.approvalRequestFindOneAndUpdate,
    updateOne: modelMocks.approvalRequestUpdateOne
  },
  APPROVAL_GRANT_TTL_MS: 30 * 60 * 1_000
}));

function mockPermissions(permissions: unknown[]) {
  modelMocks.permissionFind.mockReturnValue({
    sort: vi.fn().mockResolvedValue(permissions)
  });
}

describe("verifyAction permission decisions", () => {
  beforeEach(() => {
    mockPermissions([permissionFixture()]);
    modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    // Default: no approved grant exists; pending upsert succeeds
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("allows an active matching permission and writes a verification log", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(true);
    expect(decision.risk).toBe("low");
    expect(decision.requestId).toMatch(/^req_/);
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: decision.requestId,
        agentId: "agent_test",
        permissionId: "perm_test",
        allowed: true,
        reason: "Action allowed by active permission."
      })
    );
  });

  it("denies disabled agents", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ agentStatus: "disabled" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Agent is disabled.",
      risk: "high"
    }));
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false })
    );
  });

  it("denies when no active permission matches", async () => {
    mockPermissions([]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("No active permission exists for this action.");
  });

  it("denies revoked and expired permissions", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ status: "revoked" })]);
    await expect(verifyAction(verificationRequestFixture())).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Permission has been revoked." })
    );

    mockPermissions([
      permissionFixture({ constraints: { expiresAt: new Date(Date.now() - 1_000) } })
    ]);
    await expect(verifyAction(verificationRequestFixture())).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Permission has expired." })
    );
  });

  it("does not let revoked or expired newer records shadow an older active permission", async () => {
    mockPermissions([
      permissionFixture({ permissionId: "perm_revoked", status: "revoked" }),
      permissionFixture({ permissionId: "perm_active", status: "active" })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(true);
    expect(decision.permissionId).toBe("perm_active");
  });

  it("enforces blockedActions before allowedActions", async () => {
    mockPermissions([
      permissionFixture({
        action: "email",
        allowedActions: ["send email"],
        blockedActions: ["send email"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Action is blocked by this permission.");
  });

  it("denies when any active permission blocks an action another active permission allows", async () => {
    mockPermissions([
      permissionFixture({
        permissionId: "perm_block",
        action: "email",
        blockedActions: ["send email"]
      }),
      permissionFixture({
        permissionId: "perm_allow",
        action: "send email"
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      permissionId: "perm_block",
      reason: "Action is blocked by this permission."
    }));
  });

  it("denies blocked actions regardless of permission ordering", async () => {
    mockPermissions([
      permissionFixture({
        permissionId: "perm_newer_allow",
        action: "send email",
        createdAt: new Date("2026-02-01T00:00:00.000Z")
      }),
      permissionFixture({
        permissionId: "perm_older_block",
        action: "email",
        blockedActions: ["send email"],
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      permissionId: "perm_older_block",
      reason: "Action is blocked by this permission."
    }));
  });

  it("allows only explicit sub-actions when allowedActions are used", async () => {
    mockPermissions([
      permissionFixture({ action: "email", allowedActions: ["read labels"] })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(verifyAction(verificationRequestFixture({ action: "read labels" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ action: "email", allowedActions: ["read labels"] })]);
    await expect(verifyAction(verificationRequestFixture({ action: "send email" }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "No active permission exists for this action."
      })
    );
  });

  it("denies the parent action when allowedActions narrows the permission", async () => {
    mockPermissions([
      permissionFixture({
        action: "access_data",
        allowedActions: ["read email messages"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "access_data" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Action is not included in allowedActions."
    }));
  });

  it("allows a listed allowedAction when allowedActions narrows the permission", async () => {
    mockPermissions([
      permissionFixture({
        action: "access_data",
        allowedActions: ["read email messages"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "read email messages" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: true,
      permissionId: "perm_test"
    }));
  });

  it("keeps blockedActions authoritative over listed allowedActions", async () => {
    mockPermissions([
      permissionFixture({
        action: "access_data",
        allowedActions: ["send email"],
        blockedActions: ["send email"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Action is blocked by this permission."
    }));
  });

  it("denies mismatched action, resource, vendor, and over-limit amount", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([]);
    await expect(verifyAction(verificationRequestFixture({ action: "wire_money" }))).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "No active permission exists for this action." })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "slack.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Resource does not match permission resource." })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["amazon.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "amazon.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["amazon.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "evil.example" }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint."
      })
    );

    mockPermissions([permissionFixture({ constraints: { maxAmount: 100 } })]);
    await expect(verifyAction(verificationRequestFixture({ amount: 100 }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ constraints: { maxAmount: 100 } })]);
    await expect(verifyAction(verificationRequestFixture({ amount: 101 }))).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Amount exceeds maxAmount constraint." })
    );
  });

  it("matches resource constraints against exact and comma-separated vendor values", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ resource: "gmail.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "gmail.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "gmail.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "slack.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "stripe.com" }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Resource does not match permission resource."
      })
    );
  });

  it("enforces allowedVendors and missing vendor/resource inputs fail closed", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["gmail.com", "slack.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "slack.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["gmail.com", "slack.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint."
      })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Resource does not match permission resource."
      })
    );
  });

  it("denies approval-gated permissions without allowing execution", async () => {
    mockPermissions([permissionFixture({ requiresApproval: true })]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      approvalRequired: true,
      reason: "Permission requires approval before execution.",
      risk: "medium"
    }));
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false, approvalRequired: true })
    );
    // Should have upserted a pending ApprovalRequest
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent_test", status: "pending" }),
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ action: "purchase" }) }),
      { upsert: true, new: true }
    );
  });

  it("allows execution when an approved grant exists for the permission", async () => {
    const now = new Date();
    const grantExpiresAt = new Date(now.getTime() + 25 * 60 * 1_000);
    mockPermissions([permissionFixture({ requiresApproval: true })]);
    modelMocks.approvalRequestFindOne.mockResolvedValue({
      approvalId: "apr_test",
      agentId: "agent_test",
      permissionId: "perm_test",
      status: "approved",
      grantExpiresAt
    });
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: true,
      approvalRequired: false,
      reason: "Action allowed by approved permission grant.",
      risk: "low"
    }));
    // Grant should be marked as used
    expect(modelMocks.approvalRequestUpdateOne).toHaveBeenCalledWith(
      { approvalId: "apr_test" },
      { $set: { status: "used", resolvedAt: expect.any(Date) } }
    );
  });

  it("fails closed when permission lookup throws", async () => {
    modelMocks.permissionFind.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Verification failed closed during permission lookup.",
      risk: "high"
    }));
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false })
    );
  });

  it("does not let last-used update failures block verification or leak raw keys", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    modelMocks.agentUpdateOne.mockRejectedValue(new Error("failed for bhf_sk_super_secret_value"));
    const { verifyAction } = await import("@/lib/verify");

    await expect(verifyAction(verificationRequestFixture())).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: true })
    );
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("bhf_sk_super_secret_value");
    expect(JSON.stringify(consoleSpy.mock.calls)).toContain("bhf_sk_[redacted]");
    consoleSpy.mockRestore();
  });

  it("fails closed when constrained amount or vendor inputs are missing", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ constraints: { maxAmount: 100 } })]);
    await expect(verifyAction(verificationRequestFixture({ amount: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "amount is required for permissions with a maxAmount constraint."
      })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["amazon.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint."
      })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Resource does not match permission resource."
      })
    );
  });
});
