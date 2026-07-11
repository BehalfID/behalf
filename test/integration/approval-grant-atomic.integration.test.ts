/**
 * Mongo integration: atomic single-use approval grant consumption.
 * Uses the shared integration MongoMemoryServer from test/integration/setup.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApprovalIntent } from "@/lib/approvalIntent";
import { verifyAction } from "@/lib/verify";
import ApprovalRequest, { APPROVAL_GRANT_TTL_MS } from "@/models/ApprovalRequest";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import { permissionFixture } from "../fixtures";

vi.mock("@/lib/auth", () => ({
  recordAgentKeyUse: vi.fn()
}));

describe("atomic approval grant consumption (mongo)", () => {
  const intent = buildApprovalIntent({ action: "execute_command", command: "npm test" })!;

  beforeEach(async () => {
    await Permission.create(
      permissionFixture({
        action: "execute_command",
        requiresApproval: true
      })
    );
    await ApprovalRequest.create({
      approvalId: "apr_atomic",
      requestId: "req_atomic",
      accountId: "acct_test",
      developerUserId: "dev_test",
      kind: "agent_action",
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "execute_command",
      vendor: null,
      amount: null,
      argumentKind: "command",
      argumentFingerprint: intent.fingerprint,
      argumentPreview: "npm test",
      argumentPreviewTruncated: false,
      status: "approved",
      resolvedBy: "dev_approver",
      resolvedAt: new Date("2026-06-01T00:00:00.000Z"),
      grantExpiresAt: new Date(Date.now() + APPROVAL_GRANT_TTL_MS)
    });
  });

  it("allows at most one concurrent consumer of the same grant", async () => {
    const input = {
      agentId: "agent_test",
      accountId: "acct_test",
      developerUserId: "dev_test",
      agentStatus: "active",
      action: "execute_command",
      policyContext: { toolInput: { command: "npm test" } }
    };

    const results = await Promise.all([
      verifyAction(input),
      verifyAction(input),
      verifyAction(input),
      verifyAction(input)
    ]);

    const allowed = results.filter((r) => r.allowed);
    const denied = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(1);
    expect(allowed[0].reason).toBe("Action allowed by approved permission grant.");
    expect(denied.length).toBe(3);

    const grant = await ApprovalRequest.findOne({ approvalId: "apr_atomic" }).lean();
    expect(grant?.status).toBe("used");
    expect(grant?.usedAt).toBeInstanceOf(Date);
    expect(grant?.resolvedBy).toBe("dev_approver");
    expect(grant?.resolvedAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");

    const logs = await VerificationLog.find({ agentId: "agent_test" }).lean();
    expect(logs.filter((l) => l.allowed)).toHaveLength(1);
  });
});
