import { expect, it } from "vitest";
import type { AgentCountScope } from "@/lib/repositories/agents";
import { repositoryContractSuite } from "./contractHarness";

export type AgentRepositoryContract = {
  countAgentsByAccountId: (accountId: string) => Promise<number>;
  countAgentsByScope: (scope: AgentCountScope) => Promise<number>;
};

export type AgentContractDeps = AgentRepositoryContract & {
  seedAgent: (overrides?: {
    agentId?: string;
    accountId?: string;
    developerUserId?: string;
    name?: string;
  }) => Promise<{ agentId: string; accountId: string; developerUserId: string }>;
};

export function makeAgentRepositoryContract(
  name: string,
  factory: () => AgentContractDeps | Promise<AgentContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("countAgentsByAccountId counts only agents for that account", async () => {
      const deps = getDeps();
      const target = await deps.seedAgent({ accountId: "acct_agent_a" });
      await deps.seedAgent({ accountId: "acct_agent_a" });
      await deps.seedAgent({ accountId: "acct_agent_b" });

      const count = await deps.countAgentsByAccountId(target.accountId);

      expect(count).toBe(2);
    });

    it("countAgentsByScope counts by accountId", async () => {
      const deps = getDeps();
      const target = await deps.seedAgent({ accountId: "acct_scope_account" });
      await deps.seedAgent({ accountId: "acct_scope_account" });
      await deps.seedAgent({ accountId: "acct_scope_other" });

      const count = await deps.countAgentsByScope({ accountId: target.accountId });

      expect(count).toBe(2);
    });

    it("countAgentsByScope counts by developerUserId", async () => {
      const deps = getDeps();
      const first = await deps.seedAgent({ developerUserId: "dev_scope_a" });
      await deps.seedAgent({ developerUserId: "dev_scope_a" });
      await deps.seedAgent({ developerUserId: "dev_scope_b" });

      const count = await deps.countAgentsByScope({ developerUserId: first.developerUserId });

      expect(count).toBe(2);
    });

    it("missing scopes return 0", async () => {
      const deps = getDeps();

      await expect(deps.countAgentsByScope({ accountId: "acct_no_agents" })).resolves.toBe(0);
      await expect(deps.countAgentsByScope({ developerUserId: "dev_no_agents" })).resolves.toBe(0);
    });
  });
}
