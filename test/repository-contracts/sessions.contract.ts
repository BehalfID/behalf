import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type SessionsRepositoryContract = {
  createSession: (input: {
    sessionId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    lastActivityAt: Date;
  }) => Promise<{ sessionId: string }>;
  findByTokenHash: (
    tokenHash: string,
    options?: { requireUnexpired?: boolean }
  ) => Promise<{ sessionId: string; expiresAt: Date; lastActivityAt?: Date } | null>;
  updateActivity: (sessionId: string, lastActivityAt: Date, expiresAt: Date) => Promise<unknown>;
};

export type SessionsContractDeps = SessionsRepositoryContract;

export function makeSessionsRepositoryContract(
  name: string,
  factory: () => SessionsContractDeps | Promise<SessionsContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("findByTokenHash rejects expired sessions when requireUnexpired is true", async () => {
      const deps = getDeps();
      const tokenHash = "hash_expired_session";
      const past = new Date(Date.now() - 60_000);

      await deps.createSession({
        sessionId: "sess_expired",
        userId: "dev_expired",
        tokenHash,
        expiresAt: past,
        lastActivityAt: past
      });

      const session = await deps.findByTokenHash(tokenHash, { requireUnexpired: true });
      expect(session).toBeNull();
    });

    it("updateActivity slides expiration forward", async () => {
      const deps = getDeps();
      const tokenHash = "hash_sliding_session";
      const now = new Date();
      const initialExpiry = new Date(now.getTime() + 30_000);

      await deps.createSession({
        sessionId: "sess_slide",
        userId: "dev_slide",
        tokenHash,
        expiresAt: initialExpiry,
        lastActivityAt: now
      });

      const nextActivity = new Date(now.getTime() + 5_000);
      const nextExpiry = new Date(now.getTime() + 120_000);
      await deps.updateActivity("sess_slide", nextActivity, nextExpiry);

      const session = await deps.findByTokenHash(tokenHash);
      expect(session?.lastActivityAt?.getTime()).toBe(nextActivity.getTime());
      expect(session?.expiresAt.getTime()).toBe(nextExpiry.getTime());
    });
  });
}
