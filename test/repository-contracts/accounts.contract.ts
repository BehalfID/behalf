import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type AccountRecord = {
  accountId: string;
  name: string;
  verificationCount: number;
  verificationPeriodStart: Date;
};

export type AccountRepositoryContract = {
  findAccountById: (accountId: string) => Promise<AccountRecord | null>;
  resetVerificationPeriod: (accountId: string, periodStart: Date) => Promise<unknown>;
  incrementVerificationCount: (accountId: string) => Promise<unknown>;
};

export type AccountContractDeps = AccountRepositoryContract & {
  seedAccount: (overrides?: {
    accountId?: string;
    name?: string;
    verificationCount?: number;
    verificationPeriodStart?: Date;
  }) => Promise<{ accountId: string }>;
};

export function makeAccountRepositoryContract(
  name: string,
  factory: () => AccountContractDeps | Promise<AccountContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("findAccountById returns the expected account", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount({ name: "Contract Test Account" });

      const account = await deps.findAccountById(accountId);

      expect(account).not.toBeNull();
      expect(account?.accountId).toBe(accountId);
      expect(account?.name).toBe("Contract Test Account");
    });

    it("findAccountById returns null for missing account", async () => {
      const deps = getDeps();

      const account = await deps.findAccountById("acct_missing_contract");

      expect(account).toBeNull();
    });

    it("resetVerificationPeriod sets verificationCount to 1 and updates verificationPeriodStart", async () => {
      const deps = getDeps();
      const periodStart = new Date("2026-03-01T00:00:00.000Z");
      const { accountId } = await deps.seedAccount({
        verificationCount: 42,
        verificationPeriodStart: new Date("2026-01-01T00:00:00.000Z")
      });

      await deps.resetVerificationPeriod(accountId, periodStart);

      const account = await deps.findAccountById(accountId);
      expect(account?.verificationCount).toBe(1);
      expect(account?.verificationPeriodStart?.toISOString()).toBe(periodStart.toISOString());
    });

    it("incrementVerificationCount increments exactly once", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount({ verificationCount: 3 });

      await deps.incrementVerificationCount(accountId);

      const account = await deps.findAccountById(accountId);
      expect(account?.verificationCount).toBe(4);
    });
  });
}
