import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/auth";
import { normalizeEmail } from "@/lib/developerAuth";
import {
  accountInvites,
  accountMemberships,
  accounts,
  agents,
  developerUsers
} from "@/lib/db/postgres/schema";
import { createPublicId } from "@/lib/ids";
import {
  findAccountById,
  incrementVerificationCount,
  resetVerificationPeriod
} from "@/lib/repositories/postgres/accounts";
import { countAgentsByAccountId, countAgentsByScope } from "@/lib/repositories/postgres/agents";
import {
  countBillableSeatsByAccountId,
  createMembership,
  deleteMembership,
  findMembershipByAccountAndUser,
  findPendingInvitesByAccountId,
  updateMembershipRole,
  upsertPendingInvite
} from "@/lib/repositories/postgres/memberships";
import {
  isPostgresRepositoryContractsEnabled,
  resolveSmokeTestUrl,
  setupPostgresContractTestSchema,
  truncatePostgresContractTables,
  type PostgresContractTestContext
} from "../scripts/postgres-smoke";
import { makeAccountRepositoryContract } from "./repository-contracts/accounts.contract";
import { makeAgentRepositoryContract } from "./repository-contracts/agents.contract";
import { makeMembershipRepositoryContract } from "./repository-contracts/memberships.contract";

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

        await db
          .insert(accounts)
          .values({
            accountId,
            name: "Contract Seed Account",
            plan: "free"
          })
          .onConflictDoNothing();

        await db
          .insert(developerUsers)
          .values({
            userId: developerUserId,
            email: `${developerUserId}@contract.test`,
            passwordHash: "contract-test-password-hash"
          })
          .onConflictDoNothing();

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

  makeMembershipRepositoryContract("postgres", async () => {
    const db = context!.db;

    const ensureDeveloperUser = async (userId: string) => {
      await db
        .insert(developerUsers)
        .values({
          userId,
          email: `${userId}@contract.test`,
          passwordHash: "contract-test-password-hash"
        })
        .onConflictDoNothing();
    };

    return {
      countBillableSeatsByAccountId: (accountId) => countBillableSeatsByAccountId(db, accountId),
      findMembershipByAccountAndUser: (accountId, userId) =>
        findMembershipByAccountAndUser(db, accountId, userId),
      createMembership: async (input) => {
        await ensureDeveloperUser(input.userId);
        return createMembership(db, input);
      },
      updateMembershipRole: (membershipId, accountId, role) =>
        updateMembershipRole(db, membershipId, accountId, role),
      deleteMembership: (membershipId, accountId) => deleteMembership(db, membershipId, accountId),
      findPendingInvitesByAccountId: (accountId) => findPendingInvitesByAccountId(db, accountId),
      upsertPendingInvite: async (accountId, email, update) => {
        await ensureDeveloperUser(update.invitedBy);
        return upsertPendingInvite(db, accountId, email, update);
      },
      seedAccount: async (accountId = createPublicId("acct")) => {
        await db.insert(accounts).values({
          accountId,
          name: "Membership Contract Account",
          plan: "free"
        });
        await ensureDeveloperUser("dev_owner");
        return { accountId };
      },
      seedAcceptedInvite: async (accountId, email) => {
        await ensureDeveloperUser("dev_owner");
        await db.insert(accountInvites).values({
          inviteId: createPublicId("inv"),
          accountId,
          email: normalizeEmail(email),
          role: "ENGINEER",
          status: "accepted",
          invitedBy: "dev_owner"
        });
      },
      countMembershipsByAccountId: async (accountId) => {
        const rows = await db
          .select({ value: accountMemberships.membershipId })
          .from(accountMemberships)
          .where(eq(accountMemberships.accountId, accountId));
        return rows.length;
      },
      countInvitesByAccountId: async (accountId) => {
        const rows = await db
          .select({ value: accountInvites.inviteId })
          .from(accountInvites)
          .where(eq(accountInvites.accountId, accountId));
        return rows.length;
      },
      findInviteByEmail: async (accountId, email) => {
        const invite =
          (await db.query.accountInvites.findFirst({
            where: and(
              eq(accountInvites.accountId, accountId),
              eq(accountInvites.email, normalizeEmail(email)),
              eq(accountInvites.status, "pending")
            )
          })) ?? null;
        if (!invite) {
          return null;
        }
        return { inviteId: invite.inviteId, role: invite.role };
      }
    };
  });
}
