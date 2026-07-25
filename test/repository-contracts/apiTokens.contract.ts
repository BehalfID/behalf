import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type ApiTokenContractRow = {
  tokenId: string;
  userId: string;
  accountId: string;
  name: string;
  tokenHash?: string;
  createdAt?: Date;
};

type WriteResult = { deletedCount?: number };

export type ApiTokensContractDeps = {
  createApiToken: (input: {
    tokenId: string;
    userId: string;
    accountId: string;
    name: string;
    tokenPreview?: string;
    tokenHash: string;
  }) => Promise<ApiTokenContractRow>;
  findApiTokens: (filter?: Record<string, unknown>) => Promise<ApiTokenContractRow[]>;
  countApiTokens: (filter?: Record<string, unknown>) => Promise<number>;
  deleteApiToken: (filter: Record<string, unknown>) => Promise<WriteResult>;
  seedTenant: (userId: string, accountId: string) => Promise<void>;
};

export function makeApiTokensRepositoryContract(
  name: string,
  factory: () => ApiTokensContractDeps | Promise<ApiTokensContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("createApiToken stamps createdAt", async () => {
      const deps = getDeps();
      await deps.seedTenant("dev_token_create", "acct_token_create");

      const created = await deps.createApiToken({
        tokenId: "tok_create",
        userId: "dev_token_create",
        accountId: "acct_token_create",
        name: "Contract Token",
        tokenHash: "hash_token_create"
      });

      expect(created.tokenId).toBe("tok_create");
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it("rejects a duplicate tokenHash", async () => {
      const deps = getDeps();
      await deps.seedTenant("dev_token_dup", "acct_token_dup");
      await deps.createApiToken({
        tokenId: "tok_dup_a",
        userId: "dev_token_dup",
        accountId: "acct_token_dup",
        name: "Token A",
        tokenHash: "hash_dup_shared"
      });

      await expect(
        deps.createApiToken({
          tokenId: "tok_dup_b",
          userId: "dev_token_dup",
          accountId: "acct_token_dup",
          name: "Token B",
          tokenHash: "hash_dup_shared"
        })
      ).rejects.toThrow();
    });

    it("findApiTokens filters by userId", async () => {
      const deps = getDeps();
      await deps.seedTenant("dev_token_filter_a", "acct_token_filter_a");
      await deps.seedTenant("dev_token_filter_b", "acct_token_filter_b");
      await deps.createApiToken({
        tokenId: "tok_filter_a1",
        userId: "dev_token_filter_a",
        accountId: "acct_token_filter_a",
        name: "A1",
        tokenHash: "hash_filter_a1"
      });
      await deps.createApiToken({
        tokenId: "tok_filter_a2",
        userId: "dev_token_filter_a",
        accountId: "acct_token_filter_a",
        name: "A2",
        tokenHash: "hash_filter_a2"
      });
      await deps.createApiToken({
        tokenId: "tok_filter_b1",
        userId: "dev_token_filter_b",
        accountId: "acct_token_filter_b",
        name: "B1",
        tokenHash: "hash_filter_b1"
      });

      const rows = await deps.findApiTokens({ userId: "dev_token_filter_a" });

      expect(rows.map((row) => row.tokenId).sort()).toEqual(["tok_filter_a1", "tok_filter_a2"]);
    });

    it("countApiTokens counts by accountId", async () => {
      const deps = getDeps();
      await deps.seedTenant("dev_token_count", "acct_token_count");
      await deps.createApiToken({
        tokenId: "tok_count_1",
        userId: "dev_token_count",
        accountId: "acct_token_count",
        name: "Count 1",
        tokenHash: "hash_count_1"
      });
      await deps.createApiToken({
        tokenId: "tok_count_2",
        userId: "dev_token_count",
        accountId: "acct_token_count",
        name: "Count 2",
        tokenHash: "hash_count_2"
      });

      await expect(deps.countApiTokens({ accountId: "acct_token_count" })).resolves.toBe(2);
      await expect(deps.countApiTokens({ accountId: "acct_token_count_missing" })).resolves.toBe(0);
    });

    it("deleteApiToken revokes the matched token and no-ops on a miss", async () => {
      const deps = getDeps();
      await deps.seedTenant("dev_token_delete", "acct_token_delete");
      await deps.createApiToken({
        tokenId: "tok_delete",
        userId: "dev_token_delete",
        accountId: "acct_token_delete",
        name: "Delete Me",
        tokenHash: "hash_delete"
      });

      const result = await deps.deleteApiToken({ tokenId: "tok_delete" });
      expect(result.deletedCount).toBe(1);

      const missed = await deps.deleteApiToken({ tokenId: "tok_delete_missing" });
      expect(missed.deletedCount).toBe(0);

      await expect(deps.findApiTokens({ tokenId: "tok_delete" })).resolves.toEqual([]);
    });
  });
}
