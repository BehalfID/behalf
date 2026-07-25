import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type UsersContractRow = {
  userId: string;
  email: string;
  firstName?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type WriteResult = { matchedCount?: number; modifiedCount?: number; deletedCount?: number };

export type UsersContractDeps = {
  createUser: (input: {
    userId: string;
    email: string;
    passwordHash?: string;
  }) => Promise<UsersContractRow>;
  findByEmail: (email: string) => Promise<UsersContractRow | null>;
  findUsers: (filter?: Record<string, unknown>) => Promise<UsersContractRow[]>;
  countUserDocuments: (filter?: Record<string, unknown>) => Promise<number>;
  /** Existence check — return shape differs by backend (Mongo `.exists()` vs Postgres row); only truthiness is asserted. */
  userExists: (filter: Record<string, unknown>) => Promise<unknown>;
  updateUserByFilter: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ) => Promise<WriteResult>;
  deleteUser: (userId: string) => Promise<WriteResult>;
};

export function makeUsersRepositoryContract(
  name: string,
  factory: () => UsersContractDeps | Promise<UsersContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("createUser stamps createdAt and normalizes email case for lookup", async () => {
      const deps = getDeps();
      const created = await deps.createUser({
        userId: "dev_user_create",
        email: "Contract.User@Example.com",
        passwordHash: "contract-test-password-hash"
      });

      expect(created.userId).toBe("dev_user_create");
      expect(created.createdAt).toBeInstanceOf(Date);

      const found = await deps.findByEmail("contract.user@example.com");
      expect(found?.userId).toBe("dev_user_create");
    });

    it("rejects a duplicate email", async () => {
      const deps = getDeps();
      await deps.createUser({
        userId: "dev_dup_a",
        email: "dup.user@example.com",
        passwordHash: "contract-test-password-hash"
      });

      await expect(
        deps.createUser({
          userId: "dev_dup_b",
          email: "dup.user@example.com",
          passwordHash: "contract-test-password-hash"
        })
      ).rejects.toThrow();
    });

    it("findUsers filters by $in over userId", async () => {
      const deps = getDeps();
      await deps.createUser({ userId: "dev_filter_a", email: "filter.a@example.com" });
      await deps.createUser({ userId: "dev_filter_b", email: "filter.b@example.com" });
      await deps.createUser({ userId: "dev_filter_c", email: "filter.c@example.com" });

      const rows = await deps.findUsers({
        userId: { $in: ["dev_filter_a", "dev_filter_b"] }
      });

      expect(rows.map((row) => row.userId).sort()).toEqual(["dev_filter_a", "dev_filter_b"]);
    });

    it("countUserDocuments counts only matching rows", async () => {
      const deps = getDeps();
      await deps.createUser({ userId: "dev_count_a", email: "count.a@example.com" });
      await deps.createUser({ userId: "dev_count_b", email: "count.b@example.com" });

      await expect(
        deps.countUserDocuments({ userId: { $in: ["dev_count_a", "dev_count_b"] } })
      ).resolves.toBe(2);
      await expect(deps.countUserDocuments({ userId: "dev_count_missing" })).resolves.toBe(0);
    });

    it("userExists resolves truthy when matched and falsy otherwise", async () => {
      const deps = getDeps();
      await deps.createUser({ userId: "dev_exists", email: "exists@example.com" });

      await expect(deps.userExists({ email: "exists@example.com" })).resolves.toBeTruthy();
      await expect(deps.userExists({ email: "missing.user@example.com" })).resolves.toBeFalsy();
    });

    it("updateUserByFilter updates the matched row and no-ops on a miss", async () => {
      const deps = getDeps();
      await deps.createUser({ userId: "dev_update", email: "update@example.com" });

      const updated = await deps.updateUserByFilter(
        { userId: "dev_update" },
        { $set: { firstName: "Ada" } }
      );
      expect(updated.matchedCount).toBe(1);
      expect(updated.modifiedCount).toBe(1);

      const missed = await deps.updateUserByFilter(
        { userId: "dev_update_missing" },
        { $set: { firstName: "Nope" } }
      );
      expect(missed.matchedCount).toBe(0);
    });

    it("deleteUser removes the row so subsequent lookups return null", async () => {
      const deps = getDeps();
      await deps.createUser({ userId: "dev_delete", email: "delete.user@example.com" });

      const result = await deps.deleteUser("dev_delete");
      expect(result.deletedCount).toBe(1);

      await expect(deps.findByEmail("delete.user@example.com")).resolves.toBeNull();
    });
  });
}
