import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type VerificationLogRecord = {
  logId: string;
  requestId: string;
  accountId: string | null;
  agentId: string;
  action: string;
  allowed: boolean;
  reason: string;
  risk: string;
};

export type VerificationLogRepositoryContract = {
  createVerificationLog: (input: {
    logId: string;
    requestId: string;
    accountId?: string | null;
    agentId: string;
    action: string;
    allowed: boolean;
    reason: string;
    risk: string;
  }) => Promise<VerificationLogRecord>;
  findVerificationLogsByAccount: (
    accountId: string,
    options?: { limit?: number; agentId?: string }
  ) => Promise<VerificationLogRecord[]>;
};

export type VerificationLogContractDeps = VerificationLogRepositoryContract & {
  seedAgent: (overrides?: {
    agentId?: string;
    accountId?: string;
  }) => Promise<{ agentId: string; accountId: string }>;
};

export function makeVerificationLogRepositoryContract(
  name: string,
  factory: () => VerificationLogContractDeps | Promise<VerificationLogContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("createVerificationLog appends a log row", async () => {
      const deps = getDeps();
      const { agentId, accountId } = await deps.seedAgent({ accountId: "acct_log_create" });

      const log = await deps.createVerificationLog({
        logId: "log_create",
        requestId: "req_create",
        accountId,
        agentId,
        action: "purchase",
        allowed: true,
        reason: "ok",
        risk: "low"
      });

      expect(log.logId).toBe("log_create");
      expect(log.allowed).toBe(true);
    });

    it("findVerificationLogsByAccount returns newest first and respects filters", async () => {
      const deps = getDeps();
      const first = await deps.seedAgent({ accountId: "acct_log_list", agentId: "agent_log_a" });
      const second = await deps.seedAgent({
        accountId: "acct_log_list",
        agentId: "agent_log_b"
      });

      await deps.createVerificationLog({
        logId: "log_old",
        requestId: "req_old",
        accountId: first.accountId,
        agentId: first.agentId,
        action: "a",
        allowed: true,
        reason: "old",
        risk: "low"
      });
      await deps.createVerificationLog({
        logId: "log_new",
        requestId: "req_new",
        accountId: first.accountId,
        agentId: second.agentId,
        action: "b",
        allowed: false,
        reason: "new",
        risk: "high"
      });

      const all = await deps.findVerificationLogsByAccount(first.accountId);
      const limited = await deps.findVerificationLogsByAccount(first.accountId, { limit: 1 });
      const byAgent = await deps.findVerificationLogsByAccount(first.accountId, {
        agentId: first.agentId
      });

      expect(all.map((row) => row.logId)).toEqual(["log_new", "log_old"]);
      expect(limited).toHaveLength(1);
      expect(limited[0]?.logId).toBe("log_new");
      expect(byAgent).toHaveLength(1);
      expect(byAgent[0]?.agentId).toBe(first.agentId);
    });
  });
}
