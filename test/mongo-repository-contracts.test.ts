import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";
import { hashApiKey } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import {
  findAccountById,
  incrementVerificationCount,
  resetVerificationPeriod
} from "@/lib/repositories/accounts";
import { countAgentsByAccountId, countAgentsByScope } from "@/lib/repositories/agents";
import {
  countBillableSeatsByAccountId,
  createMembership,
  deleteMembership,
  findMembershipByAccountAndUser,
  findPendingInvitesByAccountId,
  updateMembershipRole,
  upsertPendingInvite
} from "@/lib/repositories/memberships";
import {
  countProtectedReposByAccountId,
  findManagedProfilePolicyByAccountId,
  upsertManagedProfilePolicy
} from "@/lib/repositories/managedProfiles";
import Account from "@/models/Account";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership from "@/models/AccountMembership";
import Agent from "@/models/Agent";
import ManagedProfilePolicy from "@/models/ManagedProfilePolicy";
import { accountFixture } from "./fixtures";
import { makeAccountRepositoryContract } from "./repository-contracts/accounts.contract";
import { makeAgentRepositoryContract } from "./repository-contracts/agents.contract";
import { makeManagedProfileRepositoryContract } from "./repository-contracts/managedProfiles.contract";
import { makeMembershipRepositoryContract } from "./repository-contracts/memberships.contract";
import { makeApprovalsRepositoryContract } from "./repository-contracts/approvals.contract";
import { makeSessionsRepositoryContract } from "./repository-contracts/sessions.contract";
import { makeVerificationLogsRepositoryContract } from "./repository-contracts/verificationLogs.contract";
import { makeWebhooksRepositoryContract } from "./repository-contracts/webhooks.contract";
import ApprovalRequest from "@/models/ApprovalRequest";
import VerificationLog from "@/models/VerificationLog";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import WebhookEvent from "@/models/WebhookEvent";
import {
  approvalRepository,
  approveApproval,
  consumeApprovedGrant,
  consumeApprovedPauseApproval,
  denyApproval,
  upsertPendingAgentAction,
  upsertPendingManagedProfilePause
} from "@/lib/repositories/approvals";
import {
  createSession,
  findByTokenHash,
  updateActivity
} from "@/lib/repositories/sessions";
import Permission from "@/models/Permission";
import {
  permissionRepository,
  updateMany as updateManyPermissions
} from "@/lib/repositories/permissions";
import {
  makePermissionsRepositoryContract,
  type PermissionContractRow
} from "./repository-contracts/permissions.contract";
import {
  aggregateStats,
  aggregateVerificationLogs,
  countLogs,
  createLog,
  deleteLogs,
  findAgentNames,
  findOneVerificationLog,
  updateLogs
} from "@/lib/repositories/verificationLogs";
import {
  claimNextEvent,
  countWebhookEvents,
  createEndpoint,
  createEvent,
  deleteDeliveries,
  deleteEndpoints,
  deleteEvents,
  findActiveEndpointsForEvent,
  findEndpoint,
  findEvent,
  findOneAndUpdateEndpoint,
  findOneAndUpdateEvent,
  insertDeliveries,
  markEventCompleted,
  markEventFailed,
  recoverStuckEvents,
  retryEvent,
  updateEndpoint,
  updateEndpoints,
  webhookEventExists
} from "@/lib/repositories/webhooks";

let mongoServer: MongoMemoryServer | undefined;

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const rawApiKey = "bhf_sk_contract_abcdefghijklmnopqrstuvwxyz123456";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: "behalf-contract-test" }
  });
  const baseUri = mongoServer.getUri();
  process.env.MONGODB_URI = baseUri.endsWith("/")
    ? `${baseUri}behalf-contract-test`
    : `${baseUri}/behalf-contract-test`;
  await connectToDatabase();
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (globalForMongoose.mongooseCache) {
    globalForMongoose.mongooseCache.conn = null;
    globalForMongoose.mongooseCache.promise = null;
  }
  await mongoServer?.stop();
  delete process.env.MONGODB_URI;
});

makeAccountRepositoryContract("mongo", async () => ({
  findAccountById: async (accountId) => {
    const account = await findAccountById(accountId);
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
  resetVerificationPeriod,
  incrementVerificationCount,
  seedAccount: async (overrides = {}) => {
    const accountId = overrides.accountId ?? createPublicId("acct");
    await Account.create(
      accountFixture({
        accountId,
        name: overrides.name ?? "Contract Seed Account",
        verificationCount: overrides.verificationCount ?? 0,
        verificationPeriodStart: overrides.verificationPeriodStart ?? new Date()
      })
    );
    return { accountId };
  }
}));

makeAgentRepositoryContract("mongo", async () => ({
  countAgentsByAccountId,
  countAgentsByScope,
  seedAgent: async (overrides = {}) => {
    const agentId = overrides.agentId ?? createPublicId("agent");
    const accountId = overrides.accountId ?? createPublicId("acct");
    const developerUserId = overrides.developerUserId ?? createPublicId("dev");
    await Agent.create({
      agentId,
      accountId,
      developerUserId,
      name: overrides.name ?? "Contract Agent",
      status: "active",
      apiKeyHash: hashApiKey(`${rawApiKey}_${agentId}`)
    });
    return { agentId, accountId, developerUserId };
  }
}));

makeMembershipRepositoryContract("mongo", async () => ({
  countBillableSeatsByAccountId,
  findMembershipByAccountAndUser,
  createMembership,
  updateMembershipRole,
  deleteMembership,
  findPendingInvitesByAccountId,
  upsertPendingInvite,
  seedAccount: async (accountId = createPublicId("acct")) => {
    await Account.create(accountFixture({ accountId, name: "Membership Contract Account" }));
    return { accountId };
  },
  seedAcceptedInvite: async (accountId, email) => {
    await AccountInvite.create({
      inviteId: createPublicId("inv"),
      accountId,
      email,
      role: "ENGINEER",
      status: "accepted",
      invitedBy: "dev_owner"
    });
  },
  countMembershipsByAccountId: (accountId) => AccountMembership.countDocuments({ accountId }),
  countInvitesByAccountId: (accountId) => AccountInvite.countDocuments({ accountId }),
  findInviteByEmail: async (accountId, email) => {
    const invite = await AccountInvite.findOne({ accountId, email, status: "pending" }).lean();
    if (!invite) {
      return null;
    }
    return { inviteId: invite.inviteId, role: invite.role };
  }
}));

makeManagedProfileRepositoryContract("mongo", async () => ({
  findManagedProfilePolicyByAccountId,
  countProtectedReposByAccountId,
  upsertManagedProfilePolicy,
  seedAccount: async (accountId = createPublicId("acct")) => {
    await Account.create(accountFixture({ accountId, name: "Managed Profile Contract Account" }));
    return { accountId };
  },
  countPoliciesByAccountId: (accountId) => ManagedProfilePolicy.countDocuments({ accountId })
}));

makeApprovalsRepositoryContract("mongo", async () => {
  const lean = (value: unknown) => {
    if (!value) return null;
    return (typeof (value as { toObject?: unknown }).toObject === "function"
      ? (value as { toObject: () => Record<string, unknown> }).toObject()
      : value) as never;
  };

  return {
    upsertPendingAgentAction: async (pendingFilter, setOnInsert) =>
      lean(await upsertPendingAgentAction(pendingFilter, setOnInsert)),
    upsertPendingManagedProfilePause: async (pendingFilter, setOnInsert) =>
      lean(await upsertPendingManagedProfilePause(pendingFilter, setOnInsert)),
    findOne: async (filter) => lean(await approvalRepository.findOne(filter)),
    findOneLean: async (filter) => lean(await approvalRepository.findOneLean(filter)),
    find: async (filter = {}, options = {}) => {
      const query = ApprovalRequest.find(filter);
      if (options.sort) query.sort(options.sort);
      if (options.skip !== undefined) query.skip(options.skip);
      if (options.limit !== undefined) query.limit(options.limit);
      if (options.select) query.select(options.select);
      return (await query).map((row) => lean(row)!);
    },
    approve: approveApproval,
    deny: denyApproval,
    consumeApprovedGrant: async (tuple, now) => lean(await consumeApprovedGrant(tuple, now)),
    consumeApprovedPauseApproval,
    updateOne: approvalRepository.updateOne,
    deleteMany: approvalRepository.deleteMany,
    countDocuments: approvalRepository.countDocuments,
    seedApproval: async (input) => {
      await ApprovalRequest.create(input);
    }
  };
});

makeSessionsRepositoryContract("mongo", async () => ({
  createSession,
  findByTokenHash,
  updateActivity
}));

makePermissionsRepositoryContract("mongo", async () => {
  const lean = (value: unknown): PermissionContractRow => {
    const row =
      value && typeof (value as { toObject?: unknown }).toObject === "function"
        ? (value as { toObject: () => Record<string, unknown> }).toObject()
        : (value as Record<string, unknown>);
    return row as PermissionContractRow;
  };

  return {
    create: async (input) => lean(await permissionRepository.create(input)),
    findMatchingForVerify: async (agentId, action) =>
      (await permissionRepository.findMatchingForVerify(agentId, action)).map(lean),
    find: async (filter = {}, options = {}) => {
      const query = Permission.find(filter).sort(options.sort ?? {});
      if (options.skip !== undefined) query.skip(options.skip);
      if (options.limit !== undefined) query.limit(options.limit);
      return (await query).map(lean);
    },
    findOne: async (filter) => {
      const row = await permissionRepository.findOne(filter);
      return row ? lean(row) : null;
    },
    findOneAndUpdate: async (filter, update, options) => {
      const row = await permissionRepository.findOneAndUpdate(filter, update, options);
      return row ? lean(row) : null;
    },
    findByPermissionId: async (permissionId, scope) => {
      const row = await permissionRepository.findByPermissionId(permissionId, scope);
      return row ? lean(row) : null;
    },
    revoke: permissionRepository.revoke,
    findByAgentId: async (agentId, scope) =>
      (await permissionRepository.findByAgentId(agentId, scope)).map(lean),
    findActiveByAgentId: async (agentId, scope) =>
      (await permissionRepository.findActiveByAgentId(agentId, scope)).map(lean),
    updateOne: permissionRepository.updateOne,
    updateMany: updateManyPermissions,
    deleteOne: permissionRepository.deleteOne,
    deleteMany: permissionRepository.deleteMany,
    countDocuments: permissionRepository.countDocuments,
    seedTenantAgent: async () => {}
  };
});

makeVerificationLogsRepositoryContract("mongo", async () => {
  const lean = (value: unknown) => {
    if (!value) return null;
    return (typeof (value as { toObject?: unknown }).toObject === "function"
      ? (value as { toObject: () => Record<string, unknown> }).toObject()
      : value) as never;
  };

  return {
    createLog: async (input) => lean(await createLog(input as never))!,
    find: async (filter = {}, options = {}) => {
      const query = VerificationLog.find(filter).sort(options.sort ?? { createdAt: -1 });
      if (options.skip !== undefined) query.skip(options.skip);
      if (options.limit !== undefined) query.limit(options.limit);
      if (options.select) query.select(options.select);
      return (await query).map((row) => lean(row)!);
    },
    findOne: async (filter, options = {}) => {
      const query = findOneVerificationLog(filter);
      if (options.sort) query.sort(options.sort);
      if (options.select) query.select(options.select);
      return lean(await query);
    },
    countDocuments: countLogs,
    aggregateStats: async (query, limit) => {
      const result = await aggregateStats(query, limit);
      if (!result) return null;
      return {
        total: result.total,
        allowed: result.allowed,
        denied: result.denied,
        highRisk: result.highRisk,
        approvalRequired: result.approvalRequired,
        topDeniedAction: result.topDeniedAction,
        topVendor: result.topVendor
      };
    },
    aggregate: async (pipeline) =>
      (await aggregateVerificationLogs(pipeline as never)) as Array<{
        _id: string;
        total: number;
        allowed: number;
        denied: number;
      }>,
    findAgentNames,
    updateMany: updateLogs,
    deleteMany: deleteLogs,
    seedAgent: async ({ accountId, developerUserId, agentId, name }) => {
      await Agent.create({
        agentId,
        accountId,
        developerUserId,
        name: name ?? `${agentId} Contract Agent`,
        status: "active",
        apiKeyHash: hashApiKey(`${rawApiKey}_logs_${agentId}`)
      });
    }
  };
});

makeWebhooksRepositoryContract("mongo", async () => {
  const lean = <T>(value: T): T => {
    if (!value) return value;
    return (typeof (value as { toObject?: unknown }).toObject === "function"
      ? (value as { toObject: () => unknown }).toObject()
      : value) as T;
  };

  return {
    createEndpoint: async (input) => lean(await createEndpoint(input as never)) as never,
    createEvent: async (input) => lean(await createEvent(input as never)) as never,
    findEndpoint: async (filter, select) =>
      lean(await findEndpoint(filter, select)) as never,
    listEndpoints: async (filter = {}, options = {}) => {
      const query = WebhookEndpoint.find(filter).sort(
        options.sort ?? { createdAt: -1, webhookId: -1 }
      );
      if (options.skip !== undefined) query.skip(options.skip);
      if (options.limit !== undefined) query.limit(options.limit);
      return (await query).map((row) => lean(row)) as never;
    },
    findActiveEndpointsForEvent: async (event) =>
      (await findActiveEndpointsForEvent(event as never)).map((row) => lean(row)) as never,
    updateEndpoint,
    updateEndpoints,
    listEvents: async (filter = {}, options = {}) => {
      const query = WebhookEvent.find(filter).sort(
        options.sort ?? { createdAt: -1, eventId: -1 }
      );
      if (!options.sort?.eventId) {
        query.sort({
          ...(options.sort ?? { createdAt: -1 }),
          eventId: options.sort?.createdAt === 1 ? 1 : -1
        });
      }
      if (options.skip !== undefined) query.skip(options.skip);
      if (options.limit !== undefined) query.limit(options.limit);
      return (await query).map((row) => lean(row)) as never;
    },
    findEvent: async (filter) => lean(await findEvent(filter)) as never,
    recoverStuckEvents,
    claimNextEvent: async (maxAttempts, now) =>
      lean(await claimNextEvent(maxAttempts, now)) as never,
    insertDeliveries: async (deliveries) =>
      (await insertDeliveries(deliveries as never)).map((row) => lean(row)) as never,
    markEventCompleted,
    markEventFailed,
    retryEvent,
    listDeliveries: async (filter = {}, options = {}) => {
      const query = WebhookDelivery.find(filter).sort({
        ...(options.sort ?? { createdAt: -1 }),
        deliveryId: options.sort?.createdAt === 1 ? 1 : -1
      });
      if (options.skip !== undefined) query.skip(options.skip);
      if (options.limit !== undefined) query.limit(options.limit);
      return (await query).map((row) => lean(row)) as never;
    },
    deleteDeliveries,
    deleteEvents,
    deleteEndpoints,
    countEvents: countWebhookEvents,
    findOneAndUpdateEndpoint: async (filter, update, options) =>
      lean(await findOneAndUpdateEndpoint(filter, update, options)) as never,
    findOneAndUpdateEvent: async (filter, update, options) =>
      lean(await findOneAndUpdateEvent(filter, update, options)) as never,
    eventExists: webhookEventExists,
    seedTenant: async () => {}
  };
});
