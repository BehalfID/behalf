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
