import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type ApprovalGrantTuple = {
  agentId: string;
  permissionId: string;
  action: string;
  vendor: string | null;
  amount: number | null;
  argumentFingerprint: string | null;
};

export type ApprovalContractRow = {
  approvalId: string;
  requestId: string;
  accountId?: string | null;
  developerUserId?: string | null;
  kind?: string;
  agentId?: string | null;
  permissionId?: string | null;
  action: string;
  vendor?: string | null;
  amount?: number | null;
  argumentKind?: string | null;
  argumentFingerprint?: string | null;
  argumentPreview?: string | null;
  argumentPreviewTruncated?: boolean | null;
  pauseTool?: string | null;
  pauseRepo?: string | null;
  pauseBranch?: string | null;
  pauseDeviceId?: string | null;
  pauseScope?: string | null;
  requestedDurationMinutes?: number | null;
  pauseReason?: string | null;
  contextReason?: string | null;
  status: string;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
  usedAt?: Date | null;
  grantExpiresAt?: Date | null;
  requiredAuthorityLevel?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type WriteResult = {
  matchedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
};

export type ApprovalsContractDeps = {
  upsertPendingAgentAction: (
    pendingFilter: Record<string, unknown>,
    setOnInsert: Record<string, unknown>
  ) => Promise<ApprovalContractRow | null>;
  upsertPendingManagedProfilePause: (
    pendingFilter: Record<string, unknown>,
    setOnInsert: Record<string, unknown>
  ) => Promise<ApprovalContractRow | null>;
  findOne: (filter: Record<string, unknown>) => Promise<ApprovalContractRow | null>;
  findOneLean: (filter: Record<string, unknown>) => Promise<ApprovalContractRow | null>;
  find: (
    filter?: Record<string, unknown>,
    options?: {
      sort?: Record<string, 1 | -1>;
      limit?: number;
      skip?: number;
      select?: string;
    }
  ) => Promise<ApprovalContractRow[]>;
  approve: (
    approvalId: string,
    scope: { accountId?: string; developerUserId?: string },
    resolvedBy: string,
    grantExpiresAt: Date,
    now?: Date
  ) => Promise<WriteResult>;
  deny: (
    approvalId: string,
    scope: { accountId?: string; developerUserId?: string },
    resolvedBy: string,
    now?: Date
  ) => Promise<WriteResult>;
  consumeApprovedGrant: (
    tuple: ApprovalGrantTuple,
    now?: Date
  ) => Promise<ApprovalContractRow | null>;
  consumeApprovedPauseApproval: (
    filter: Record<string, unknown>,
    now?: Date
  ) => Promise<WriteResult>;
  updateOne: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ) => Promise<WriteResult>;
  deleteMany: (filter: Record<string, unknown>) => Promise<WriteResult>;
  countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
  seedApproval: (input: Record<string, unknown>) => Promise<void>;
};

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

function agentTuple(overrides: Partial<ApprovalGrantTuple> = {}): ApprovalGrantTuple {
  return {
    agentId: "agent_contract",
    permissionId: "perm_contract",
    action: "execute_command",
    vendor: null,
    amount: null,
    argumentFingerprint: "fp_contract",
    ...overrides
  };
}

function pendingFilter(tuple: ApprovalGrantTuple, accountId = "acct_contract") {
  return {
    accountId,
    ...tuple,
    status: "pending"
  };
}

function pendingInsert(
  approvalId: string,
  tuple: ApprovalGrantTuple,
  accountId = "acct_contract"
) {
  return {
    approvalId,
    requestId: `${approvalId}_req`,
    accountId,
    developerUserId: "dev_contract",
    kind: "agent_action",
    ...tuple,
    status: "pending",
    argumentKind: tuple.argumentFingerprint ? "command" : null,
    argumentPreview: tuple.argumentFingerprint ? "npm test" : null,
    argumentPreviewTruncated: false,
    requiredAuthorityLevel: 40
  };
}

export function makeApprovalsRepositoryContract(
  name: string,
  factory: () => ApprovalsContractDeps | Promise<ApprovalsContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("creates, retrieves, and normalizes an agent-action request", async () => {
      const deps = getDeps();
      const tuple = agentTuple({ amount: 12.5 });
      const created = await deps.upsertPendingAgentAction(
        pendingFilter(tuple),
        pendingInsert("apr_create", tuple)
      );
      const found = await deps.findOneLean({ approvalId: "apr_create" });

      expect(created?.approvalId).toBe("apr_create");
      expect(found?.requestId).toBe("apr_create_req");
      expect(found?.kind).toBe("agent_action");
      expect(found?.amount).toBe(12.5);
      expect(found?.vendor ?? null).toBeNull();
      expect(found?.argumentKind).toBe("command");
      expect(found?.argumentPreview).toBe("npm test");
      expect(found?.argumentPreviewTruncated).toBe(false);
      expect(found?.requiredAuthorityLevel).toBe(40);
      expect(found?.createdAt).toBeInstanceOf(Date);
      expect(found?.updatedAt).toBeInstanceOf(Date);
    });

    it("dedupes the same pending fingerprint but isolates different fingerprints", async () => {
      const deps = getDeps();
      const firstTuple = agentTuple({ argumentFingerprint: "fp_same" });
      const secondTuple = agentTuple({ argumentFingerprint: "fp_other" });

      const first = await deps.upsertPendingAgentAction(
        pendingFilter(firstTuple),
        pendingInsert("apr_same_first", firstTuple)
      );
      const duplicate = await deps.upsertPendingAgentAction(
        pendingFilter(firstTuple),
        pendingInsert("apr_same_second", firstTuple)
      );
      const different = await deps.upsertPendingAgentAction(
        pendingFilter(secondTuple),
        pendingInsert("apr_other", secondTuple)
      );

      expect(first?.approvalId).toBe("apr_same_first");
      expect(duplicate?.approvalId).toBe("apr_same_first");
      expect(different?.approvalId).toBe("apr_other");
      expect(await deps.countDocuments({ accountId: "acct_contract", status: "pending" })).toBe(2);
    });

    it("dedupes Mongo-compatible nullable conflict keys", async () => {
      const deps = getDeps();
      const tuple = agentTuple({
        agentId: null as unknown as string,
        permissionId: null as unknown as string,
        vendor: null,
        amount: null,
        argumentFingerprint: null
      });
      const first = await deps.upsertPendingAgentAction(
        pendingFilter(tuple),
        pendingInsert("apr_null_first", tuple)
      );
      const duplicate = await deps.upsertPendingAgentAction(
        pendingFilter(tuple),
        pendingInsert("apr_null_second", tuple)
      );

      expect(first?.approvalId).toBe("apr_null_first");
      expect(duplicate?.approvalId).toBe("apr_null_first");
      expect(await deps.countDocuments({ accountId: "acct_contract", status: "pending" })).toBe(1);
    });

    it("allows a new pending request after the prior request resolves", async () => {
      const deps = getDeps();
      const tuple = agentTuple();
      await deps.upsertPendingAgentAction(
        pendingFilter(tuple),
        pendingInsert("apr_resolved", tuple)
      );
      expect(
        (await deps.approve("apr_resolved", { accountId: "acct_contract" }, "dev_approver", future()))
          .matchedCount
      ).toBe(1);

      const next = await deps.upsertPendingAgentAction(
        pendingFilter(tuple),
        pendingInsert("apr_after_resolved", tuple)
      );
      expect(next?.approvalId).toBe("apr_after_resolved");
    });

    it("conditions approve and deny on a pending prior state", async () => {
      const deps = getDeps();
      const approveTuple = agentTuple({ argumentFingerprint: "fp_approve" });
      const denyTuple = agentTuple({ argumentFingerprint: "fp_deny" });
      await deps.upsertPendingAgentAction(
        pendingFilter(approveTuple),
        pendingInsert("apr_approve", approveTuple)
      );
      await deps.upsertPendingAgentAction(
        pendingFilter(denyTuple),
        pendingInsert("apr_deny", denyTuple)
      );

      const approvedAt = new Date();
      const approved = await deps.approve(
        "apr_approve",
        { accountId: "acct_contract" },
        "dev_approver",
        future(),
        approvedAt
      );
      const invalidSecond = await deps.deny(
        "apr_approve",
        { accountId: "acct_contract" },
        "dev_denier"
      );
      const denied = await deps.deny(
        "apr_deny",
        { accountId: "acct_contract" },
        "dev_denier"
      );

      expect(approved.matchedCount).toBe(1);
      expect(invalidSecond.matchedCount).toBe(0);
      expect(denied.matchedCount).toBe(1);
      expect((await deps.findOne({ approvalId: "apr_approve" }))?.status).toBe("approved");
      expect((await deps.findOne({ approvalId: "apr_deny" }))?.status).toBe("denied");
    });

    it("rejects expired grants and wrong fingerprints", async () => {
      const deps = getDeps();
      const expiredTuple = agentTuple({ argumentFingerprint: "fp_expired" });
      const fingerprintTuple = agentTuple({ argumentFingerprint: "fp_right" });
      await deps.seedApproval({
        ...pendingInsert("apr_expired", expiredTuple),
        status: "approved",
        grantExpiresAt: past(),
        resolvedAt: new Date()
      });
      await deps.seedApproval({
        ...pendingInsert("apr_fingerprint", fingerprintTuple),
        approvalId: "apr_fingerprint",
        requestId: "apr_fingerprint_req",
        status: "approved",
        grantExpiresAt: future(),
        resolvedAt: new Date()
      });

      expect(await deps.consumeApprovedGrant(expiredTuple)).toBeNull();
      expect(
        await deps.consumeApprovedGrant({
          ...fingerprintTuple,
          argumentFingerprint: "fp_wrong"
        })
      ).toBeNull();
    });

    it("consumes a grant once, persists usedAt, and has one concurrent winner", async () => {
      const deps = getDeps();
      const tuple = agentTuple({ argumentFingerprint: "fp_consume" });
      await deps.seedApproval({
        ...pendingInsert("apr_consume", tuple),
        status: "approved",
        grantExpiresAt: future(),
        resolvedAt: new Date()
      });

      const now = new Date();
      const results = await Promise.all([
        deps.consumeApprovedGrant(tuple, now),
        deps.consumeApprovedGrant(tuple, now),
        deps.consumeApprovedGrant(tuple, now)
      ]);
      const winners = results.filter((row) => row !== null);
      const stored = await deps.findOne({ approvalId: "apr_consume" });

      expect(winners).toHaveLength(1);
      expect(winners[0]?.status).toBe("approved");
      expect(stored?.status).toBe("used");
      expect(stored?.usedAt?.getTime()).toBe(now.getTime());
      expect(await deps.consumeApprovedGrant(tuple, now)).toBeNull();
    });

    it("isolates approval reads and transitions by tenant and agent", async () => {
      const deps = getDeps();
      const one = agentTuple({ agentId: "agent_one", argumentFingerprint: "fp_one" });
      const two = agentTuple({ agentId: "agent_two", argumentFingerprint: "fp_two" });
      await deps.upsertPendingAgentAction(
        pendingFilter(one, "acct_one"),
        pendingInsert("apr_tenant_one", one, "acct_one")
      );
      await deps.upsertPendingAgentAction(
        pendingFilter(two, "acct_two"),
        pendingInsert("apr_tenant_two", two, "acct_two")
      );

      expect(await deps.findOne({ approvalId: "apr_tenant_one", accountId: "acct_two" })).toBeNull();
      expect(
        (await deps.approve("apr_tenant_one", { accountId: "acct_two" }, "dev_wrong", future()))
          .matchedCount
      ).toBe(0);
      expect((await deps.find({ accountId: "acct_one", agentId: "agent_one" }))).toHaveLength(1);
      expect((await deps.find({ accountId: "acct_one", agentId: "agent_two" }))).toHaveLength(0);
    });

    it("creates, reuses, finds, and consumes managed-profile-pause approvals", async () => {
      const deps = getDeps();
      const filter = {
        accountId: "acct_pause",
        developerUserId: "dev_pause",
        kind: "managed_profile_pause",
        pauseTool: "cursor",
        pauseScope: "current_repo",
        pauseRepo: "repo_hash",
        pauseDeviceId: null,
        status: "pending"
      };
      const insert = {
        approvalId: "apr_pause",
        requestId: "apr_pause_req",
        action: "managed_profile_pause",
        vendor: "behalf_cli",
        agentId: "behalf_cli_pause",
        permissionId: null,
        requestedDurationMinutes: 30,
        pauseReason: "debug",
        contextReason: "required",
        pauseBranch: "main"
      };

      const first = await deps.upsertPendingManagedProfilePause(filter, insert);
      const reused = await deps.upsertPendingManagedProfilePause(filter, {
        ...insert,
        approvalId: "apr_pause_other",
        requestId: "apr_pause_other_req"
      });
      expect(first?.approvalId).toBe("apr_pause");
      expect(reused?.approvalId).toBe("apr_pause");
      expect((await deps.findOneLean({ approvalId: "apr_pause" }))?.pauseRepo).toBe("repo_hash");

      await deps.approve("apr_pause", { accountId: "acct_pause" }, "dev_approver", future());
      const consumed = await deps.consumeApprovedPauseApproval({
        accountId: "acct_pause",
        developerUserId: "dev_pause",
        approvalId: "apr_pause",
        pauseTool: "cursor",
        pauseScope: "current_repo",
        pauseRepo: "repo_hash",
        pauseDeviceId: null
      });
      expect(consumed.matchedCount).toBe(1);
      expect((await deps.findOne({ approvalId: "apr_pause" }))?.status).toBe("used");
    });

    it("permits Mongo-valid duplicate pause tuples", async () => {
      const deps = getDeps();
      const common = {
        accountId: "acct_pause_dupe",
        developerUserId: "dev_pause_dupe",
        kind: "managed_profile_pause",
        action: "managed_profile_pause",
        pauseTool: "cursor",
        pauseScope: "all",
        pauseRepo: null,
        pauseDeviceId: null,
        status: "pending"
      };
      await deps.seedApproval({
        ...common,
        approvalId: "apr_pause_dupe_one",
        requestId: "apr_pause_dupe_one_req"
      });
      await deps.seedApproval({
        ...common,
        approvalId: "apr_pause_dupe_two",
        requestId: "apr_pause_dupe_two_req"
      });

      expect(
        await deps.countDocuments({
          accountId: "acct_pause_dupe",
          kind: "managed_profile_pause",
          status: "pending"
        })
      ).toBe(2);
    });
  });
}
