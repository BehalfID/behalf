/**
 * Shadow mode — lib/verify.ts unit tests.
 * Proves that shadow decisions are logged with the real policy outcome
 * and that normal (non-shadow) enforcement is unaffected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionFixture, verificationRequestFixture } from "./fixtures";

const modelMocks = vi.hoisted(() => ({
  permissionFind: vi.fn(),
  permissionUpdateOne: vi.fn(),
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
  default: { updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }) }
}));

vi.mock("@/models/VerificationLog", () => ({
  default: { create: modelMocks.verificationLogCreate }
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

describe("verifyAction — shadow mode", () => {
  beforeEach(() => {
    mockPermissions([permissionFixture()]);
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("returns allowed=true and shadow=true when policy would allow", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ shadow: true }));

    expect(decision.allowed).toBe(true);
    expect(decision.shadow).toBe(true);
    expect(decision.shadowDecision).toEqual({
      allowed: true,
      reason: "Action allowed by active permission.",
      risk: "low"
    });
    expect(decision.reason).toBe("Shadow mode: action would have been allowed.");
  });

  it("returns allowed=true and shadow=true when policy would deny (no permission)", async () => {
    mockPermissions([]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ shadow: true }));

    expect(decision.allowed).toBe(true);
    expect(decision.shadow).toBe(true);
    expect(decision.shadowDecision?.allowed).toBe(false);
    expect(decision.shadowDecision?.reason).toBe("No active permission exists for this action.");
    expect(decision.reason).toBe("Shadow mode: action would have been denied.");
  });

  it("logs the real denied decision with shadow=true", async () => {
    mockPermissions([]);
    const { verifyAction } = await import("@/lib/verify");

    await verifyAction(verificationRequestFixture({ shadow: true }));

    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed: false,
        shadow: true,
        reason: "No active permission exists for this action."
      })
    );
  });

  it("logs the real allowed decision with shadow=true", async () => {
    const { verifyAction } = await import("@/lib/verify");

    await verifyAction(verificationRequestFixture({ shadow: true }));

    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: true, shadow: true })
    );
  });

  it("does NOT trigger an approval gate in shadow mode", async () => {
    mockPermissions([permissionFixture({ requiresApproval: true })]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ shadow: true }));

    expect(decision.allowed).toBe(true);
    expect(decision.shadow).toBe(true);
    expect(decision.approvalRequired).toBe(false);
    expect(modelMocks.approvalRequestFindOne).not.toHaveBeenCalled();
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("shadow: disabled agent logs denied but returns allowed=true", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(
      verificationRequestFixture({ agentStatus: "disabled", shadow: true })
    );

    expect(decision.allowed).toBe(true);
    expect(decision.shadow).toBe(true);
    expect(decision.shadowDecision?.allowed).toBe(false);
    expect(decision.shadowDecision?.reason).toBe("Agent is disabled.");
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false, shadow: true })
    );
  });

  it("normal mode still denies — shadow does not pollute the non-shadow path", async () => {
    mockPermissions([]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(false);
    expect((decision as Record<string, unknown>).shadow).toBeUndefined();
    expect((decision as Record<string, unknown>).shadowDecision).toBeUndefined();
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.not.objectContaining({ shadow: true })
    );
  });

  it("normal mode with active permission still allows — not affected by shadow logic", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(true);
    expect((decision as Record<string, unknown>).shadow).toBeUndefined();
  });
});
