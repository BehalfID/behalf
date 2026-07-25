import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type OAuthPendingContractRow = {
  pendingId: string;
  googleSub: string;
  email: string;
  emailVerified: boolean;
  expiresAt: Date;
  createdAt?: Date;
};

type WriteResult = { deletedCount?: number };

export type OAuthPendingContractDeps = {
  createPendingSignup: (input: {
    pendingId: string;
    googleSub: string;
    email: string;
    emailVerified: boolean;
    tokenHash: string;
    expiresAt: Date;
  }) => Promise<OAuthPendingContractRow>;
  findOnePendingSignup: (
    filter: Record<string, unknown>
  ) => Promise<OAuthPendingContractRow | null>;
  deletePendingSignup: (filter: Record<string, unknown>) => Promise<WriteResult>;
};

export function makeOAuthPendingRepositoryContract(
  name: string,
  factory: () => OAuthPendingContractDeps | Promise<OAuthPendingContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("createPendingSignup stamps createdAt and normalizes email case", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      const created = await deps.createPendingSignup({
        pendingId: "pend_create",
        googleSub: "google_sub_create",
        email: "Pending.User@Example.com",
        emailVerified: true,
        tokenHash: "hash_pending_create",
        expiresAt
      });

      expect(created.pendingId).toBe("pend_create");
      expect(created.createdAt).toBeInstanceOf(Date);

      const found = await deps.findOnePendingSignup({ email: "pending.user@example.com" });
      expect(found?.pendingId).toBe("pend_create");
    });

    it("rejects a duplicate pendingId", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await deps.createPendingSignup({
        pendingId: "pend_dup",
        googleSub: "google_sub_dup_a",
        email: "dup.a@example.com",
        emailVerified: true,
        tokenHash: "hash_dup_a",
        expiresAt
      });

      await expect(
        deps.createPendingSignup({
          pendingId: "pend_dup",
          googleSub: "google_sub_dup_b",
          email: "dup.b@example.com",
          emailVerified: true,
          tokenHash: "hash_dup_b",
          expiresAt
        })
      ).rejects.toThrow();
    });

    it("findOnePendingSignup filters by googleSub", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await deps.createPendingSignup({
        pendingId: "pend_filter_a",
        googleSub: "google_sub_filter_a",
        email: "filter.a@example.com",
        emailVerified: false,
        tokenHash: "hash_filter_a",
        expiresAt
      });
      await deps.createPendingSignup({
        pendingId: "pend_filter_b",
        googleSub: "google_sub_filter_b",
        email: "filter.b@example.com",
        emailVerified: false,
        tokenHash: "hash_filter_b",
        expiresAt
      });

      const found = await deps.findOnePendingSignup({ googleSub: "google_sub_filter_b" });
      expect(found?.pendingId).toBe("pend_filter_b");

      const missing = await deps.findOnePendingSignup({ googleSub: "google_sub_missing" });
      expect(missing).toBeNull();
    });

    it("deletePendingSignup removes the matched row and no-ops on a miss", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await deps.createPendingSignup({
        pendingId: "pend_delete",
        googleSub: "google_sub_delete",
        email: "delete@example.com",
        emailVerified: true,
        tokenHash: "hash_delete",
        expiresAt
      });

      const result = await deps.deletePendingSignup({ pendingId: "pend_delete" });
      expect(result.deletedCount).toBe(1);

      const missed = await deps.deletePendingSignup({ pendingId: "pend_delete_missing" });
      expect(missed.deletedCount).toBe(0);

      await expect(deps.findOnePendingSignup({ pendingId: "pend_delete" })).resolves.toBeNull();
    });
  });
}
