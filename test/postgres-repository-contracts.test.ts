import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashApiKey } from "@/lib/auth";
import { normalizeEmail } from "@/lib/developerAuth";
import {
  accountInvites,
  accountMemberships,
  accounts,
  agents,
  approvalRequests,
  permissions,
  developerUsers
} from "@/lib/db/postgres/schema";
import * as postgresSchema from "@/lib/db/postgres/schema";
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
import { createPostgresPermissionRepository } from "@/lib/repositories/postgres/permissions";
import {
  consumeApprovedPauseApproval,
  createPostgresApprovalRepository,
  denyApproval
} from "@/lib/repositories/postgres/approvals";
import {
  createSession,
  findByTokenHash as findSessionByTokenHash,
  updateActivity
} from "@/lib/repositories/postgres/sessions";
import {
  countUserDocuments,
  createUser,
  deleteUser,
  findByEmail as findUserByEmail,
  findUsers,
  updateUserByFilter,
  userExists
} from "@/lib/repositories/postgres/users";
import {
  countApiTokens,
  createApiToken,
  deleteApiToken,
  findApiTokens
} from "@/lib/repositories/postgres/apiTokens";
import {
  createPendingSignup,
  deletePendingSignup,
  findOnePendingSignup
} from "@/lib/repositories/postgres/oauthPending";
import {
  createDeviceCode,
  findOneAndDeleteAuthorized,
  findOneDeviceCode,
  updateStatus as updateDeviceCodeStatus
} from "@/lib/repositories/postgres/deviceCodes";
import { createPostgresVerificationLogRepository } from "@/lib/repositories/postgres/verificationLogs";
import { createPostgresWebhookRepository } from "@/lib/repositories/postgres/webhooks";
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
import { makePermissionsRepositoryContract } from "./repository-contracts/permissions.contract";
import { makeApprovalsRepositoryContract } from "./repository-contracts/approvals.contract";
import { makeSessionsRepositoryContract } from "./repository-contracts/sessions.contract";
import { makeVerificationLogsRepositoryContract } from "./repository-contracts/verificationLogs.contract";
import { makeWebhooksRepositoryContract } from "./repository-contracts/webhooks.contract";
import { makeUsersRepositoryContract } from "./repository-contracts/users.contract";
import { makeApiTokensRepositoryContract } from "./repository-contracts/apiTokens.contract";
import { makeOAuthPendingRepositoryContract } from "./repository-contracts/oauthPending.contract";
import { makeDeviceCodesRepositoryContract } from "./repository-contracts/deviceCodes.contract";

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

  makePermissionsRepositoryContract("postgres", async () => {
    const db = context!.db;
    const repository = createPostgresPermissionRepository(db);

    return {
      ...repository,
      seedTenantAgent: async (accountId, developerUserId, agentId) => {
        await db
          .insert(accounts)
          .values({
            accountId,
            name: `${accountId} Contract Account`,
            plan: "free"
          })
          .onConflictDoNothing();
        await db
          .insert(developerUsers)
          .values({
            userId: developerUserId,
            email: `${developerUserId}@permissions.contract.test`,
            passwordHash: "contract-test-password-hash",
            primaryAccountId: accountId
          })
          .onConflictDoNothing();
        await db
          .insert(agents)
          .values({
            agentId,
            accountId,
            developerUserId,
            name: `${agentId} Contract Agent`,
            status: "active",
            apiKeyHash: hashApiKey(`${rawApiKey}_${agentId}`)
          })
          .onConflictDoNothing();
      }
    };
  });

  makeApprovalsRepositoryContract("postgres", async () => {
    const db = context!.db;
    const repository = createPostgresApprovalRepository(db);

    const ensureReferences = async (input: Record<string, unknown>) => {
      const accountId = typeof input.accountId === "string" ? input.accountId : null;
      const developerUserId =
        typeof input.developerUserId === "string" ? input.developerUserId : null;
      const agentId = typeof input.agentId === "string" ? input.agentId : null;
      const permissionId =
        typeof input.permissionId === "string" ? input.permissionId : null;

      if (accountId) {
        await db
          .insert(accounts)
          .values({ accountId, name: `${accountId} Approval Account`, plan: "free" })
          .onConflictDoNothing();
      }
      if (developerUserId) {
        await db
          .insert(developerUsers)
          .values({
            userId: developerUserId,
            email: `${developerUserId}@approvals.contract.test`,
            passwordHash: "contract-test-password-hash",
            primaryAccountId: accountId
          })
          .onConflictDoNothing();
      }
      if (agentId) {
        await db
          .insert(agents)
          .values({
            agentId,
            accountId,
            developerUserId,
            name: `${agentId} Approval Agent`,
            status: "active",
            apiKeyHash: hashApiKey(`${rawApiKey}_approval_${agentId}`)
          })
          .onConflictDoNothing();
      }
      if (permissionId && agentId) {
        await db
          .insert(permissions)
          .values({
            permissionId,
            accountId,
            developerUserId,
            agentId,
            action: typeof input.action === "string" ? input.action : "execute_command",
            status: "active"
          })
          .onConflictDoNothing();
      }
    };

    return {
      ...repository,
      upsertPendingAgentAction: async (filter, insert) => {
        await ensureReferences({ ...filter, ...insert });
        return repository.upsertPendingAgentAction(filter, insert);
      },
      upsertPendingManagedProfilePause: async (filter, insert) => {
        await ensureReferences({ ...filter, ...insert });
        return repository.upsertPendingManagedProfilePause(filter, insert);
      },
      seedApproval: async (input) => {
        await ensureReferences(input);
        await db.insert(approvalRequests).values(input as typeof approvalRequests.$inferInsert);
      }
    };
  });

  describe("approval status transition race (postgres)", () => {
    // Deterministic reproduction of a lost-update race in updateApproval():
    // one connection holds a row lock (simulating a transaction that is about
    // to win the pending->resolved transition) while a second connection's
    // real approve/deny/consume call blocks on that same row, then resumes
    // once the first connection commits a conflicting state change. Only the
    // fixed code (predicate applied directly on the UPDATE) is expected to
    // reject the loser with matchedCount 0; the pre-fix code let both sides
    // win because its WHERE clause only re-checked `approval_id IN (id)`,
    // not the original status/usedAt condition, against the concurrently
    // committed row.
    const openWorkerConnection = async () => {
      const sql = postgres(resolveSmokeTestUrl()!, {
        max: 1,
        prepare: false,
        idle_timeout: 5,
        connect_timeout: 15
      });
      await sql`SET search_path TO ${sql(context!.schemaName)}`;
      return sql;
    };

    it("does not let a concurrent deny succeed once a racing approve has committed", async () => {
      const db = context!.db;
      const accountId = "acct_approval_race_lock";
      const developerUserId = "dev_approval_race_lock";
      const approvalId = "apr_race_lock";

      await db
        .insert(accounts)
        .values({ accountId, name: "Race Account", plan: "free" })
        .onConflictDoNothing();
      await db
        .insert(developerUsers)
        .values({
          userId: developerUserId,
          email: `${developerUserId}@approvals.contract.test`,
          passwordHash: "contract-test-password-hash",
          primaryAccountId: accountId
        })
        .onConflictDoNothing();
      await db.insert(approvalRequests).values({
        approvalId,
        requestId: `${approvalId}_req`,
        accountId,
        developerUserId,
        kind: "agent_action",
        action: "execute_command",
        status: "pending",
        requiredAuthorityLevel: 40
      } as typeof approvalRequests.$inferInsert);

      const lockSql = await openWorkerConnection();
      const denySql = await openWorkerConnection();
      try {
        const denyDb = drizzle(denySql, { schema: postgresSchema });
        let denyPromise!: ReturnType<typeof denyApproval>;

        await lockSql.begin(async (tx) => {
          // Acquire the row lock a winning "approve" transaction would hold.
          await tx`SELECT approval_id FROM approval_requests WHERE approval_id = ${approvalId} FOR UPDATE`;

          // Start a real concurrent deny while the lock is held. Its own
          // UPDATE will block on this row until this transaction commits.
          denyPromise = denyApproval(denyDb, approvalId, { accountId }, "dev_denier");
          await new Promise((resolve) => setTimeout(resolve, 250));

          await tx`UPDATE approval_requests
                   SET status = 'approved', resolved_by = 'dev_approver', resolved_at = now(),
                       grant_expires_at = now() + interval '1 hour'
                   WHERE approval_id = ${approvalId}`;
        });

        const denyResult = await denyPromise;
        expect(denyResult?.matchedCount).toBe(0);

        const [stored] = await db
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.approvalId, approvalId));
        expect(stored?.status).toBe("approved");
      } finally {
        await lockSql.end({ timeout: 5 });
        await denySql.end({ timeout: 5 });
      }
    });

    it("does not let a concurrent consume double-spend an approved pause grant", async () => {
      const db = context!.db;
      const accountId = "acct_pause_race_lock";
      const developerUserId = "dev_pause_race_lock";
      const approvalId = "apr_pause_race_lock";

      await db
        .insert(accounts)
        .values({ accountId, name: "Pause Race Account", plan: "free" })
        .onConflictDoNothing();
      await db
        .insert(developerUsers)
        .values({
          userId: developerUserId,
          email: `${developerUserId}@approvals.contract.test`,
          passwordHash: "contract-test-password-hash",
          primaryAccountId: accountId
        })
        .onConflictDoNothing();
      await db
        .insert(agents)
        .values({
          agentId: "behalf_cli_pause_race_lock",
          accountId,
          developerUserId,
          name: "Pause Race Agent",
          status: "active",
          apiKeyHash: hashApiKey(`${rawApiKey}_pause_race_lock`)
        })
        .onConflictDoNothing();
      await db.insert(approvalRequests).values({
        approvalId,
        requestId: `${approvalId}_req`,
        accountId,
        developerUserId,
        kind: "managed_profile_pause",
        action: "managed_profile_pause",
        vendor: "behalf_cli",
        agentId: "behalf_cli_pause_race_lock",
        pauseTool: "cursor",
        pauseScope: "current_repo",
        pauseRepo: "repo_hash",
        pauseDeviceId: null,
        requestedDurationMinutes: 30,
        pauseReason: "debug",
        contextReason: "required",
        pauseBranch: "main",
        status: "approved",
        grantExpiresAt: new Date(Date.now() + 60_000),
        resolvedAt: new Date(),
        resolvedBy: "dev_approver"
      } as typeof approvalRequests.$inferInsert);

      const lockSql = await openWorkerConnection();
      const consumeSql = await openWorkerConnection();
      try {
        const consumeDb = drizzle(consumeSql, { schema: postgresSchema });
        let consumePromise!: ReturnType<typeof consumeApprovedPauseApproval>;

        await lockSql.begin(async (tx) => {
          // Acquire the row lock a winning "consume" transaction would hold.
          await tx`SELECT approval_id FROM approval_requests WHERE approval_id = ${approvalId} FOR UPDATE`;

          // Start a real concurrent consume attempt while the lock is held.
          consumePromise = consumeApprovedPauseApproval(consumeDb, {
            accountId,
            developerUserId,
            approvalId,
            pauseTool: "cursor",
            pauseScope: "current_repo",
            pauseRepo: "repo_hash",
            pauseDeviceId: null
          });
          await new Promise((resolve) => setTimeout(resolve, 250));

          await tx`UPDATE approval_requests
                   SET status = 'used', resolved_at = now()
                   WHERE approval_id = ${approvalId}`;
        });

        const consumeResult = await consumePromise;
        expect(consumeResult?.matchedCount).toBe(0);

        const [stored] = await db
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.approvalId, approvalId));
        expect(stored?.status).toBe("used");
      } finally {
        await lockSql.end({ timeout: 5 });
        await consumeSql.end({ timeout: 5 });
      }
    });
  });

  makeSessionsRepositoryContract("postgres", async () => {
    const db = context!.db;

    const ensureUser = async (userId: string) => {
      await db
        .insert(developerUsers)
        .values({
          userId,
          email: `${userId}@sessions.contract.test`,
          passwordHash: "contract-test-password-hash"
        })
        .onConflictDoNothing();
    };

    return {
      createSession: async (input) => {
        await ensureUser(input.userId);
        return createSession(db, input);
      },
      findByTokenHash: (tokenHash, options) => findSessionByTokenHash(db, tokenHash, options),
      updateActivity: (sessionId, lastActivityAt, expiresAt) =>
        updateActivity(db, sessionId, lastActivityAt, expiresAt)
    };
  });

  makeUsersRepositoryContract("postgres", async () => {
    const db = context!.db;

    return {
      createUser: (input) => createUser(db, input as never),
      findByEmail: (email) => findUserByEmail(db, email),
      findUsers: (filter) => findUsers(db, filter),
      countUserDocuments: (filter) => countUserDocuments(db, filter),
      userExists: (filter) => userExists(db, filter),
      updateUserByFilter: (filter, update) => updateUserByFilter(db, filter, update),
      deleteUser: (userId) => deleteUser(db, userId)
    };
  });

  makeApiTokensRepositoryContract("postgres", async () => {
    const db = context!.db;

    const ensureTenant = async (userId: string, accountId: string) => {
      await db
        .insert(accounts)
        .values({ accountId, name: `${accountId} API Token Account`, plan: "free" })
        .onConflictDoNothing();
      await db
        .insert(developerUsers)
        .values({
          userId,
          email: `${userId}@apitokens.contract.test`,
          passwordHash: "contract-test-password-hash",
          primaryAccountId: accountId
        })
        .onConflictDoNothing();
    };

    return {
      createApiToken: (input) => createApiToken(db, input),
      findApiTokens: (filter) => findApiTokens(db, filter),
      countApiTokens: (filter) => countApiTokens(db, filter),
      deleteApiToken: (filter) => deleteApiToken(db, filter),
      seedTenant: ensureTenant
    };
  });

  makeOAuthPendingRepositoryContract("postgres", async () => {
    const db = context!.db;

    return {
      createPendingSignup: (input) => createPendingSignup(db, input),
      findOnePendingSignup: (filter) => findOnePendingSignup(db, filter),
      deletePendingSignup: (filter) => deletePendingSignup(db, filter)
    };
  });

  makeDeviceCodesRepositoryContract("postgres", async () => {
    const db = context!.db;

    const ensureUser = async (userId: string) => {
      await db
        .insert(developerUsers)
        .values({
          userId,
          email: `${userId}@devicecodes.contract.test`,
          passwordHash: "contract-test-password-hash"
        })
        .onConflictDoNothing();
    };

    return {
      createDeviceCode: (input) => createDeviceCode(db, input),
      findOneDeviceCode: (filter) => findOneDeviceCode(db, filter),
      updateStatus: async (userCode, status, options) => {
        if (options?.userId) {
          await ensureUser(options.userId);
        }
        return updateDeviceCodeStatus(db, userCode, status, options);
      },
      findOneAndDeleteAuthorized: (deviceCode) => findOneAndDeleteAuthorized(db, deviceCode)
    };
  });

  makeVerificationLogsRepositoryContract("postgres", async () => {
    const db = context!.db;
    const sql = context!.sql;
    const schemaName = context!.schemaName;
    const repository = createPostgresVerificationLogRepository(db);

    return {
      ...repository,
      ensurePartitions: async () => {
        await sql`SET search_path TO ${sql(schemaName)}`;
        await sql`SELECT behalf_ensure_verification_log_partitions(${schemaName}, 3, 13)`;
      },
      seedAgent: async ({ accountId, developerUserId, agentId, name }) => {
        await db
          .insert(accounts)
          .values({ accountId, name: `${accountId} Log Account`, plan: "free" })
          .onConflictDoNothing();
        await db
          .insert(developerUsers)
          .values({
            userId: developerUserId,
            email: `${developerUserId}@logs.contract.test`,
            passwordHash: "contract-test-password-hash",
            primaryAccountId: accountId
          })
          .onConflictDoNothing();
        await db
          .insert(agents)
          .values({
            agentId,
            accountId,
            developerUserId,
            name: name ?? `${agentId} Contract Agent`,
            status: "active",
            apiKeyHash: hashApiKey(`${rawApiKey}_logs_${agentId}`)
          })
          .onConflictDoNothing();
      }
    };
  });

  makeWebhooksRepositoryContract("postgres", async () => {
    const repository = createPostgresWebhookRepository(context!.db);
    return {
      ...repository,
      claimNextEvent: async (maxAttempts, now) => {
        const workerSql = postgres(resolveSmokeTestUrl()!, {
          max: 1,
          prepare: false,
          idle_timeout: 5,
          connect_timeout: 15
        });
        try {
          await workerSql`SET search_path TO ${workerSql(context!.schemaName)}`;
          const workerDb = drizzle(workerSql, { schema: postgresSchema });
          return createPostgresWebhookRepository(workerDb).claimNextEvent(
            maxAttempts,
            now
          );
        } finally {
          await workerSql.end({ timeout: 5 });
        }
      },
      seedTenant: async (accountId, developerUserId) => {
        await context!.db
          .insert(accounts)
          .values({ accountId, name: `${accountId} Webhook Account`, plan: "free" })
          .onConflictDoNothing();
        await context!.db
          .insert(developerUsers)
          .values({
            userId: developerUserId,
            email: `${developerUserId}@webhooks.contract.test`,
            passwordHash: "contract-test-password-hash",
            primaryAccountId: accountId
          })
          .onConflictDoNothing();
      }
    };
  });
}
