import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type AgentApprovalTuple = {
  agentId: string;
  permissionId: string;
  action: string;
  vendor?: string | null;
  amount?: string | number | null;
  argumentFingerprint?: string | null;
};

export type ApprovalRecord = {
  approvalId: string;
  requestId: string;
  status: string;
  argumentFingerprint: string | null;
  usedAt: Date | null;
};

export type ApprovalRepositoryContract = {
  upsertPendingAgentApproval: (
    tuple: AgentApprovalTuple,
    setOnInsert: {
      approvalId: string;
      requestId: string;
      accountId?: string | null;
      requiredAuthorityLevel?: number | null;
    }
  ) => Promise<ApprovalRecord>;
  approveAgentGrant: (
    approvalId: string,
    grantExpiresAt: Date,
    resolvedBy?: string
  ) => Promise<ApprovalRecord | null>;
  consumeApprovedAgentGrant: (
    tuple: AgentApprovalTuple,
    now: Date
  ) => Promise<ApprovalRecord | null>;
  findApprovalById: (approvalId: string) => Promise<ApprovalRecord | null>;
};

export type ApprovalContractDeps = ApprovalRepositoryContract & {
  seedPermission: (overrides?: {
    permissionId?: string;
    agentId?: string;
    accountId?: string;
    action?: string;
  }) => Promise<{ permissionId: string; agentId: string; accountId: string }>;
};

export function makeApprovalRepositoryContract(
  name: string,
  factory: () => ApprovalContractDeps | Promise<ApprovalContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("upsertPendingAgentApproval creates a pending approval once", async () => {
      const deps = getDeps();
      const seeded = await deps.seedPermission({
        accountId: "acct_apr_upsert",
        permissionId: "perm_apr_upsert",
        action: "purchase"
      });
      const tuple: AgentApprovalTuple = {
        agentId: seeded.agentId,
        permissionId: seeded.permissionId,
        action: "purchase",
        vendor: "acme",
        amount: 12.5,
        argumentFingerprint: null
      };

      const first = await deps.upsertPendingAgentApproval(tuple, {
        approvalId: "apr_first",
        requestId: "req_first",
        accountId: seeded.accountId,
        requiredAuthorityLevel: 40
      });
      const second = await deps.upsertPendingAgentApproval(tuple, {
        approvalId: "apr_second",
        requestId: "req_second",
        accountId: seeded.accountId,
        requiredAuthorityLevel: 40
      });

      expect(first.approvalId).toBe("apr_first");
      expect(second.approvalId).toBe("apr_first");
      expect(second.status).toBe("pending");
    });

    it("consumeApprovedAgentGrant marks an approved grant as used once", async () => {
      const deps = getDeps();
      const seeded = await deps.seedPermission({
        accountId: "acct_apr_consume",
        permissionId: "perm_apr_consume",
        action: "execute_command"
      });
      const fingerprint = "a".repeat(64);
      const tuple: AgentApprovalTuple = {
        agentId: seeded.agentId,
        permissionId: seeded.permissionId,
        action: "execute_command",
        vendor: null,
        amount: null,
        argumentFingerprint: fingerprint
      };

      const pending = await deps.upsertPendingAgentApproval(tuple, {
        approvalId: "apr_consume",
        requestId: "req_consume",
        accountId: seeded.accountId
      });
      const grantExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await deps.approveAgentGrant(pending.approvalId, grantExpiresAt, "user_approver");

      const now = new Date();
      const consumed = await deps.consumeApprovedAgentGrant(tuple, now);
      const again = await deps.consumeApprovedAgentGrant(tuple, now);
      const stored = await deps.findApprovalById(pending.approvalId);

      expect(consumed?.approvalId).toBe(pending.approvalId);
      expect(consumed?.status).toBe("used");
      expect(again).toBeNull();
      expect(stored?.status).toBe("used");
      expect(stored?.usedAt).toBeTruthy();
    });

    it("does not consume expired grants", async () => {
      const deps = getDeps();
      const seeded = await deps.seedPermission({
        accountId: "acct_apr_expired",
        permissionId: "perm_apr_expired",
        action: "purchase"
      });
      const tuple: AgentApprovalTuple = {
        agentId: seeded.agentId,
        permissionId: seeded.permissionId,
        action: "purchase",
        vendor: null,
        amount: null,
        argumentFingerprint: null
      };

      const pending = await deps.upsertPendingAgentApproval(tuple, {
        approvalId: "apr_expired",
        requestId: "req_expired",
        accountId: seeded.accountId
      });
      await deps.approveAgentGrant(
        pending.approvalId,
        new Date(Date.now() - 60_000),
        "user_approver"
      );

      const consumed = await deps.consumeApprovedAgentGrant(tuple, new Date());

      expect(consumed).toBeNull();
    });
  });
}
