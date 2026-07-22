/**
 * Tests for the approval request lifecycle.
 *
 * The key states are:
 *   pending  — created when verify() hits requiresApproval with no valid grant
 *   approved — set by a human in the dashboard; grantExpiresAt is set
 *   used     — set when the agent's next verify() call consumes the approved grant
 *   denied   — set by a human in the dashboard
 */
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

vi.mock("@/lib/approvals/emitLifecycle", () => ({
  emitApprovalRequested: vi.fn().mockResolvedValue(undefined),
  emitApprovalApproved: vi.fn().mockResolvedValue(undefined),
  emitApprovalDenied: vi.fn().mockResolvedValue(undefined),
  emitApprovalUsed: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/policyEngine/loadPolicy", () => ({
  loadPolicyDocument: vi.fn().mockResolvedValue(null)
}));

function mockPermissions(permissions: unknown[]) {
  modelMocks.permissionFind.mockReturnValue({
    sort: vi.fn().mockResolvedValue(permissions)
  });
}

function pendingUpsertCall() {
  return modelMocks.approvalRequestFindOneAndUpdate.mock.calls.find(
    (call) => call[0]?.status === "pending"
  );
}

function consumeCall() {
  return modelMocks.approvalRequestFindOneAndUpdate.mock.calls.find(
    (call) => call[0]?.status === "approved"
  );
}

describe("approval request lifecycle", () => {
  beforeEach(() => {
    mockPermissions([permissionFixture({ requiresApproval: true })]);
    modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("creates a pending approval request on first verify() call", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(decision.reason).toBe("Permission requires approval before execution.");

    const pending = pendingUpsertCall();
    expect(pending).toBeDefined();
    const [filter, update, opts] = pending!;
    expect(filter).toEqual(expect.objectContaining({
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "purchase",
      vendor: "amazon.com",
      amount: 25,
      argumentFingerprint: null,
      status: "pending"
    }));
    expect(update.$setOnInsert.approvalId).toMatch(/^apr_/);
    expect(update.$setOnInsert.requestId).toMatch(/^req_/);
    expect(update.$setOnInsert.requiredAuthorityLevel).toEqual(expect.any(Number));
    expect(opts).toEqual({ upsert: true, returnDocument: "after" });
  });

  it("does not create duplicate pending requests on repeated verify() calls", async () => {
    const { verifyAction } = await import("@/lib/verify");

    await verifyAction(verificationRequestFixture());
    await verifyAction(verificationRequestFixture());

    // Each verify: consume attempt + pending upsert
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledTimes(4);
    for (const call of modelMocks.approvalRequestFindOneAndUpdate.mock.calls) {
      if (call[0]?.status === "pending") {
        expect(call[2]).toEqual({ upsert: true, returnDocument: "after" });
      }
    }
  });

  function grantFixture(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      approvalId: "apr_granted",
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "purchase",
      vendor: "amazon.com",
      amount: 25,
      argumentFingerprint: null,
      status: "approved",
      grantExpiresAt: new Date(Date.now() + 20 * 60 * 1_000),
      ...overrides
    };
  }

  it("allows execution when an approved, non-expired grant matches the exact request", async () => {
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValueOnce(grantFixture());
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(true);
    expect(decision.approvalRequired).toBe(false);
    expect(decision.reason).toBe("Action allowed by approved permission grant.");
    expect(decision.risk).toBe("low");
    expect(consumeCall()?.[0]).toEqual(expect.objectContaining({
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "purchase",
      vendor: "amazon.com",
      amount: 25,
      argumentFingerprint: null,
      status: "approved"
    }));
  });

  it("marks the grant as used after approval is consumed", async () => {
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValueOnce(grantFixture());
    const { verifyAction } = await import("@/lib/verify");

    await verifyAction(verificationRequestFixture());

    expect(consumeCall()?.[1]).toEqual({
      $set: { status: "used", usedAt: expect.any(Date) }
    });
    expect(consumeCall()?.[2]).toEqual({ returnDocument: "before" });
    expect(pendingUpsertCall()).toBeUndefined();
  });

  it("does not consume a grant approved for a lower amount", async () => {
    // Consume query includes amount:250 so mock returns null (no match)
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ amount: 250 }));

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(pendingUpsertCall()?.[0]).toEqual(expect.objectContaining({ amount: 250, status: "pending" }));
  });

  it("does not consume a grant approved for a different vendor", async () => {
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ vendor: "evil.example" }));

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(pendingUpsertCall()).toBeDefined();
  });

  it("does not consume a grant approved for a different action", async () => {
    mockPermissions([permissionFixture({ action: "deploy", requiresApproval: true })]);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "deploy" }));

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
  });

  it("does not consume a grant when the request omits the approved vendor or amount", async () => {
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(
      verificationRequestFixture({ vendor: undefined, amount: undefined })
    );

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
  });

  it("denies and upserts pending when the grant is expired", async () => {
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(pendingUpsertCall()).toBeDefined();
  });

  it("fails closed if resolveApprovalGate throws", async () => {
    modelMocks.approvalRequestFindOneAndUpdate.mockRejectedValue(new Error("db error"));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
  });

  it("logs approvalRequired=true in VerificationLog", async () => {
    const { verifyAction } = await import("@/lib/verify");

    await verifyAction(verificationRequestFixture());

    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false, approvalRequired: true })
    );
  });
});
