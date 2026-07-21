import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/auth";
import { normalizeEmail } from "@/lib/developerAuth";
import {
  accountInvites,
  accountMemberships,
  accounts,
  agents,
  developerUsers,
  managedProfilePolicies
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
  countProtectedReposByAccountId,
  findManagedProfilePolicyByAccountId,
  upsertManagedProfilePolicy
} from "@/lib/repositories/postgres/managedProfiles";
import {
  createPermission,
  findPermissionsByAccountAndAgent,
  findPermissionsMatchingAction,
  touchPermissionLastUsed
} from "@/lib/repositories/postgres/permissions";
import {
  approveAgentGrant,
  consumeApprovedAgentGrant,
  findApprovalById,
  upsertPendingAgentApproval
} from "@/lib/repositories/postgres/approvals";
import {
  createVerificationLog,
  findVerificationLogsByAccount
} from "@/lib/repositories/postgres/verificationLogs";
import {
  claimNextWebhookEvent,
  countDeadLetterWebhookEvents,
  countPendingWebhookEvents,
  createWebhookEndpoint,
  enqueueWebhookEventRecord,
  findActiveWebhookEndpointsForEvent,
  findWebhookDeliveriesByWebhook,
  insertWebhookDeliveries,
  markWebhookEventCompleted,
  markWebhookEventDeadLetter,
  updateWebhookEndpointStatus
} from "@/lib/repositories/postgres/webhooks";
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
import { makeManagedProfileRepositoryContract } from "./repository-contracts/managedProfiles.contract";
import { makePermissionRepositoryContract } from "./repository-contracts/permissions.contract";
import { makeApprovalRepositoryContract } from "./repository-contracts/approvals.contract";
import { makeVerificationLogRepositoryContract } from "./repository-contracts/verificationLogs.contract";
import { makeWebhookRepositoryContract } from "./repository-contracts/webhooks.contract";

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

  makeManagedProfileRepositoryContract("postgres", async () => {
    const db = context!.db;

    return {
      findManagedProfilePolicyByAccountId: (accountId) =>
        findManagedProfilePolicyByAccountId(db, accountId),
      countProtectedReposByAccountId: (accountId) => countProtectedReposByAccountId(db, accountId),
      upsertManagedProfilePolicy: (accountId, policyId, policy) =>
        upsertManagedProfilePolicy(db, accountId, policyId, policy),
      seedAccount: async (accountId = createPublicId("acct")) => {
        await db.insert(accounts).values({
          accountId,
          name: "Managed Profile Contract Account",
          plan: "free"
        });
        return { accountId };
      },
      countPoliciesByAccountId: async (accountId) => {
        const rows = await db
          .select({ value: managedProfilePolicies.policyId })
          .from(managedProfilePolicies)
          .where(eq(managedProfilePolicies.accountId, accountId));
        return rows.length;
      }
    };
  });

  const seedAgentForContracts = async (overrides: {
    agentId?: string;
    accountId?: string;
    developerUserId?: string;
  } = {}) => {
    const db = context!.db;
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
    await db
      .insert(agents)
      .values({
        agentId,
        accountId,
        developerUserId,
        name: "Contract Agent",
        status: "active",
        apiKeyHash: hashApiKey(`${rawApiKey}_${agentId}`)
      })
      .onConflictDoNothing();

    return { agentId, accountId, developerUserId };
  };

  makePermissionRepositoryContract("postgres", async () => {
    const db = context!.db;
    return {
      createPermission: (input) => createPermission(db, input),
      findPermissionsMatchingAction: (agentId, action) =>
        findPermissionsMatchingAction(db, agentId, action),
      touchPermissionLastUsed: (permissionId, lastUsedAt) =>
        touchPermissionLastUsed(db, permissionId, lastUsedAt),
      findPermissionsByAccountAndAgent: (accountId, agentId, options) =>
        findPermissionsByAccountAndAgent(db, accountId, agentId, options),
      seedAgent: seedAgentForContracts
    };
  });

  makeApprovalRepositoryContract("postgres", async () => {
    const db = context!.db;
    return {
      upsertPendingAgentApproval: (tuple, setOnInsert) =>
        upsertPendingAgentApproval(db, tuple, setOnInsert),
      approveAgentGrant: (approvalId, grantExpiresAt, resolvedBy) =>
        approveAgentGrant(db, approvalId, grantExpiresAt, resolvedBy),
      consumeApprovedAgentGrant: (tuple, now) => consumeApprovedAgentGrant(db, tuple, now),
      findApprovalById: (approvalId) => findApprovalById(db, approvalId),
      seedPermission: async (overrides = {}) => {
        const seeded = await seedAgentForContracts({
          accountId: overrides.accountId,
          agentId: overrides.agentId
        });
        const permissionId = overrides.permissionId ?? createPublicId("perm");
        await createPermission(db, {
          permissionId,
          accountId: seeded.accountId,
          agentId: seeded.agentId,
          action: overrides.action ?? "purchase"
        });
        return { permissionId, agentId: seeded.agentId, accountId: seeded.accountId };
      }
    };
  });

  makeVerificationLogRepositoryContract("postgres", async () => {
    const db = context!.db;
    return {
      createVerificationLog: (input) => createVerificationLog(db, input),
      findVerificationLogsByAccount: (accountId, options) =>
        findVerificationLogsByAccount(db, accountId, options),
      seedAgent: seedAgentForContracts
    };
  });

  makeWebhookRepositoryContract("postgres", async () => {
    const db = context!.db;
    return {
      createWebhookEndpoint: (input) => createWebhookEndpoint(db, input),
      findActiveWebhookEndpointsForEvent: (input) =>
        findActiveWebhookEndpointsForEvent(db, input),
      updateWebhookEndpointStatus: (webhookId, accountId, status) =>
        updateWebhookEndpointStatus(db, webhookId, accountId, status),
      enqueueWebhookEventRecord: (input) => enqueueWebhookEventRecord(db, input),
      claimNextWebhookEvent: (now, maxAttempts) => claimNextWebhookEvent(db, now, maxAttempts),
      markWebhookEventCompleted: (eventId) => markWebhookEventCompleted(db, eventId),
      markWebhookEventDeadLetter: (eventId, lastError) =>
        markWebhookEventDeadLetter(db, eventId, lastError),
      countPendingWebhookEvents: (scope) => countPendingWebhookEvents(db, scope),
      countDeadLetterWebhookEvents: (scope) => countDeadLetterWebhookEvents(db, scope),
      insertWebhookDeliveries: (rows) => insertWebhookDeliveries(db, rows),
      findWebhookDeliveriesByWebhook: (webhookId, scope, options) =>
        findWebhookDeliveriesByWebhook(db, webhookId, scope, options),
      seedAccount: async (accountId = createPublicId("acct")) => {
        await db
          .insert(accounts)
          .values({
            accountId,
            name: "Webhook Contract Account",
            plan: "free"
          })
          .onConflictDoNothing();
        return { accountId };
      }
    };
  });
}
