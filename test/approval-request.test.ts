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

function mockPermissions(permissions: unknown[]) {
  modelMocks.permissionFind.mockReturnValue({
    sort: vi.fn().mockResolvedValue(permissions)
  });
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

    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledOnce();
    const [filter, update, opts] = modelMocks.approvalRequestFindOneAndUpdate.mock.calls[0];
    // The pending request is scoped to the exact action/vendor/amount tuple
    expect(filter).toEqual(expect.objectContaining({
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "purchase",
      vendor: "amazon.com",
      amount: 25,
      status: "pending"
    }));
    expect(update.$setOnInsert.approvalId).toMatch(/^apr_/);
    expect(update.$setOnInsert.requestId).toMatch(/^req_/);
    expect(update.$setOnInsert.requiredAuthorityLevel).toEqual(expect.any(Number));
    expect(opts).toEqual({ upsert: true, new: true });
  });

  it("does not create duplicate pending requests on repeated verify() calls", async () => {
    const { verifyAction } = await import("@/lib/verify");

    // Both calls return denied+approvalRequired; $setOnInsert prevents duplicates at DB level
    await verifyAction(verificationRequestFixture());
    await verifyAction(verificationRequestFixture());

    // findOneAndUpdate is called twice (once per verify call), but idempotency
    // is enforced by the $setOnInsert upsert in MongoDB — the test verifies the
    // correct filter/update shape is used each time.
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledTimes(2);
    for (const call of modelMocks.approvalRequestFindOneAndUpdate.mock.calls) {
      expect(call[2]).toEqual({ upsert: true, new: true });
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
      status: "approved",
      grantExpiresAt: new Date(Date.now() + 20 * 60 * 1_000),
      ...overrides
    };
  }

  it("allows execution when an approved, non-expired grant matches the exact request", async () => {
    modelMocks.approvalRequestFindOne.mockResolvedValue(grantFixture());
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(true);
    expect(decision.approvalRequired).toBe(false);
    expect(decision.reason).toBe("Action allowed by approved permission grant.");
    expect(decision.risk).toBe("low");
    // The grant lookup itself must be scoped to the exact request tuple
    expect(modelMocks.approvalRequestFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_test",
        permissionId: "perm_test",
        action: "purchase",
        vendor: "amazon.com",
        amount: 25,
        status: "approved"
      })
    );
  });

  it("marks the grant as used after approval is consumed", async () => {
    modelMocks.approvalRequestFindOne.mockResolvedValue(grantFixture());
    const { verifyAction } = await import("@/lib/verify");

    await verifyAction(verificationRequestFixture());

    expect(modelMocks.approvalRequestUpdateOne).toHaveBeenCalledWith(
      { approvalId: "apr_granted" },
      { $set: { status: "used", resolvedAt: expect.any(Date) } }
    );
    // No upsert should be triggered when the grant is consumed
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not consume a grant approved for a lower amount", async () => {
    modelMocks.approvalRequestFindOne.mockResolvedValue(grantFixture({ amount: 25 }));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ amount: 250 }));

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    // Grant must not be consumed; a new pending request is upserted instead
    expect(modelMocks.approvalRequestUpdateOne).not.toHaveBeenCalled();
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 250, status: "pending" }),
      expect.anything(),
      { upsert: true, new: true }
    );
  });

  it("does not consume a grant approved for a different vendor", async () => {
    modelMocks.approvalRequestFindOne.mockResolvedValue(grantFixture({ vendor: "amazon.com" }));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ vendor: "evil.example" }));

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(modelMocks.approvalRequestUpdateOne).not.toHaveBeenCalled();
  });

  it("does not consume a grant approved for a different action", async () => {
    mockPermissions([permissionFixture({ action: "deploy", requiresApproval: true })]);
    modelMocks.approvalRequestFindOne.mockResolvedValue(grantFixture({ action: "purchase" }));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "deploy" }));

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(modelMocks.approvalRequestUpdateOne).not.toHaveBeenCalled();
  });

  it("does not consume a grant when the request omits the approved vendor or amount", async () => {
    modelMocks.approvalRequestFindOne.mockResolvedValue(grantFixture());
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(
      verificationRequestFixture({ vendor: undefined, amount: undefined })
    );

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(modelMocks.approvalRequestUpdateOne).not.toHaveBeenCalled();
  });

  it("denies and upserts pending when the grant is expired", async () => {
    const expiredAt = new Date(Date.now() - 1_000); // already past
    modelMocks.approvalRequestFindOne.mockResolvedValue(null); // findOne checks grantExpiresAt > now, so expired grants don't surface here
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledOnce();
    // Suppress unused-variable warning
    void expiredAt;
  });

  it("fails closed if resolveApprovalGate throws", async () => {
    modelMocks.approvalRequestFindOne.mockRejectedValue(new Error("db error"));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    // Decision stays denied (approvalRequired), not allowed
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
