import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashApiKey } from "@/lib/auth";
import { accounts, agents } from "@/lib/db/postgres/schema";
import { createPublicId } from "@/lib/ids";
import {
  findAccountById,
  incrementVerificationCount,
  resetVerificationPeriod
} from "@/lib/repositories/postgres/accounts";
import { countAgentsByAccountId, countAgentsByScope } from "@/lib/repositories/postgres/agents";
import {
  isPostgresRepositoryContractsEnabled,
  resolveSmokeTestUrl,
  setupPostgresContractTestSchema,
  truncatePostgresContractTables,
  type PostgresContractTestContext
} from "../scripts/postgres-smoke";
import { makeAccountRepositoryContract } from "./repository-contracts/accounts.contract";
import { makeAgentRepositoryContract } from "./repository-contracts/agents.contract";

const contractsEnabled = isPostgresRepositoryContractsEnabled();
const rawApiKey = "bhf_sk_contract_abcdefghijklmnopqrstuvwxyz123456";

let context: PostgresContractTestContext | undefined;

beforeAll(async () => {
  if (!contractsEnabled) {
    return;
  }

  const url = resolveSmokeTestUrl();
  expect(url, "POSTGRES_TEST_URL, DATABASE_URL, or POSTGRES_URL required").toBeTruthy();
  context = await setupPostgresContractTestSchema(url);
}, 60_000);

afterEach(async () => {
  if (!context) {
    return;
  }

  await truncatePostgresContractTables(context.sql, context.schemaName);
});

afterAll(async () => {
  await context?.cleanup();
});

describe("postgres repository contracts (optional)", () => {
  it("is skipped unless RUN_POSTGRES_REPOSITORY_CONTRACTS=true and a Postgres URL is set", () => {
    if (process.env.RUN_POSTGRES_REPOSITORY_CONTRACTS === "true" && resolveSmokeTestUrl()) {
      expect(contractsEnabled).toBe(true);
      return;
    }
    expect(contractsEnabled).toBe(false);
  });
});

if (contractsEnabled) {
  makeAccountRepositoryContract("postgres", async () => {
    const db = context!.db;

    return {
      findAccountById: async (accountId) => {
        const account = await findAccountById(db, accountId);
        if (!account) {
          return null;
        }
        return {
          accountId: account.accountId,
          name: account.name,
          verificationCount: account.verificationCount,
          verificationPeriodStart: account.verificationPeriodStart
        };
      },
      resetVerificationPeriod: (accountId, periodStart) =>
        resetVerificationPeriod(db, accountId, periodStart),
      incrementVerificationCount: (accountId) => incrementVerificationCount(db, accountId),
      seedAccount: async (overrides = {}) => {
        const accountId = overrides.accountId ?? createPublicId("acct");
        await db.insert(accounts).values({
          accountId,
          name: overrides.name ?? "Contract Seed Account",
          verificationCount: overrides.verificationCount ?? 0,
          verificationPeriodStart: overrides.verificationPeriodStart ?? new Date(),
          plan: "free"
        });
        return { accountId };
      }
    };
  });

  makeAgentRepositoryContract("postgres", async () => {
    const db = context!.db;

    return {
      countAgentsByAccountId: (accountId) => countAgentsByAccountId(db, accountId),
      countAgentsByScope: (scope) => countAgentsByScope(db, scope),
      seedAgent: async (overrides = {}) => {
        const agentId = overrides.agentId ?? createPublicId("agent");
        const accountId = overrides.accountId ?? createPublicId("acct");
        const developerUserId = overrides.developerUserId ?? createPublicId("dev");
        await db.insert(agents).values({
          agentId,
          accountId,
          developerUserId,
          name: overrides.name ?? "Contract Agent",
          status: "active",
          apiKeyHash: hashApiKey(`${rawApiKey}_${agentId}`)
        });
        return { agentId, accountId, developerUserId };
      }
    };
  });
}
