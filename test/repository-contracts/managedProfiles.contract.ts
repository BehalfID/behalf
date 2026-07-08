import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type ManagedProfilePolicyRecord = {
  policyId: string;
  accountId: string;
  enabled?: boolean;
  protectedRepos?: Array<{ repoHash: string; label?: string; mode?: string; enabled?: boolean }>;
};

export type ManagedProfileRepositoryContract = {
  findManagedProfilePolicyByAccountId: (accountId: string) => Promise<ManagedProfilePolicyRecord | null>;
  countProtectedReposByAccountId: (accountId: string) => Promise<number>;
  upsertManagedProfilePolicy: (
    accountId: string,
    policyId: string,
    policy: Record<string, unknown>
  ) => Promise<ManagedProfilePolicyRecord>;
};

export type ManagedProfileContractDeps = ManagedProfileRepositoryContract & {
  seedAccount: (accountId?: string) => Promise<{ accountId: string }>;
  countPoliciesByAccountId: (accountId: string) => Promise<number>;
};

export function makeManagedProfileRepositoryContract(
  name: string,
  factory: () => ManagedProfileContractDeps | Promise<ManagedProfileContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("findManagedProfilePolicyByAccountId returns existing policy", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_policy_find");
      await deps.upsertManagedProfilePolicy(accountId, "pprf_find", {
        enabled: true,
        protectedRepos: [{ repoHash: "abc123", label: "Main", mode: "required", enabled: true }]
      });

      const policy = await deps.findManagedProfilePolicyByAccountId(accountId);

      expect(policy).not.toBeNull();
      expect(policy?.policyId).toBe("pprf_find");
      expect(policy?.accountId).toBe(accountId);
      expect(policy?.protectedRepos).toHaveLength(1);
    });

    it("missing policy returns null", async () => {
      const deps = getDeps();

      const policy = await deps.findManagedProfilePolicyByAccountId("acct_no_policy");

      expect(policy).toBeNull();
    });

    it("countProtectedReposByAccountId returns protectedRepos length", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_repo_count");
      await deps.upsertManagedProfilePolicy(accountId, "pprf_repos", {
        protectedRepos: [
          { repoHash: "repo_a", mode: "required", enabled: true },
          { repoHash: "repo_b", mode: "managed", enabled: true }
        ]
      });

      const count = await deps.countProtectedReposByAccountId(accountId);

      expect(count).toBe(2);
    });

    it("missing policy protected repo count is 0", async () => {
      const deps = getDeps();

      const count = await deps.countProtectedReposByAccountId("acct_no_policy_repos");

      expect(count).toBe(0);
    });

    it("upsertManagedProfilePolicy creates a policy", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_policy_create");

      const policy = await deps.upsertManagedProfilePolicy(accountId, "pprf_create", {
        enabled: false,
        timezone: "America/New_York"
      });

      expect(policy.policyId).toBe("pprf_create");
      expect(policy.accountId).toBe(accountId);
      expect(await deps.countPoliciesByAccountId(accountId)).toBe(1);
    });

    it("upsertManagedProfilePolicy updates an existing policy instead of duplicating it", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_policy_upsert");
      await deps.upsertManagedProfilePolicy(accountId, "pprf_original", {
        enabled: false,
        protectedRepos: [{ repoHash: "original", mode: "required", enabled: true }]
      });

      const updated = await deps.upsertManagedProfilePolicy(accountId, "pprf_updated", {
        enabled: true,
        protectedRepos: [
          { repoHash: "updated_a", mode: "required", enabled: true },
          { repoHash: "updated_b", mode: "managed", enabled: true }
        ]
      });

      expect(updated.enabled).toBe(true);
      expect(updated.protectedRepos).toHaveLength(2);
      expect(await deps.countPoliciesByAccountId(accountId)).toBe(1);
      const stored = await deps.findManagedProfilePolicyByAccountId(accountId);
      expect(stored?.enabled).toBe(true);
      expect(stored?.protectedRepos).toHaveLength(2);
    });
  });
}
