/**
 * Runtime Postgres repository bindings for composition.
 *
 * Adapters under lib/repositories/postgres/* take `(db, ...args)`.
 * This module binds `getPostgresDb()` so call signatures match Mongo modules
 * where implementations exist. Missing methods throw clearly — no silent Mongo fallback.
 */

import type { BehalfPostgresDb } from "@/lib/db/postgres";
import type { RepositoryAggregate } from "@/lib/repositories/backend";
import * as mongoAccounts from "@/lib/repositories/mongo/accounts";
import * as mongoAgents from "@/lib/repositories/mongo/agents";
import * as mongoMemberships from "@/lib/repositories/mongo/memberships";
import * as mongoManagedProfiles from "@/lib/repositories/mongo/managedProfiles";
import * as mongoPermissions from "@/lib/repositories/mongo/permissions";
import * as mongoApprovals from "@/lib/repositories/mongo/approvals";
import * as mongoVerificationLogs from "@/lib/repositories/mongo/verificationLogs";
import * as mongoWebhooks from "@/lib/repositories/mongo/webhooks";
import * as mongoStripeEvents from "@/lib/repositories/mongo/stripeEvents";
import * as mongoUsers from "@/lib/repositories/mongo/users";
import * as mongoSessions from "@/lib/repositories/mongo/sessions";
import * as mongoApiTokens from "@/lib/repositories/mongo/apiTokens";
import * as mongoOauthPending from "@/lib/repositories/mongo/oauthPending";
import * as mongoDeviceCodes from "@/lib/repositories/mongo/deviceCodes";
import * as mongoSites from "@/lib/repositories/mongo/sites";
import * as mongoCli from "@/lib/repositories/mongo/cli";
import * as mongoStatus from "@/lib/repositories/mongo/status";
import * as mongoEnterpriseInquiries from "@/lib/repositories/mongo/enterpriseInquiries";
import * as mongoPermissionProfiles from "@/lib/repositories/mongo/permissionProfiles";
import * as mongoPolicyDocuments from "@/lib/repositories/mongo/policyDocuments";
import * as mongoIntegrationBindings from "@/lib/repositories/mongo/integrationBindings";
import * as mongoAccountDeletion from "@/lib/repositories/mongo/accountDeletion";
import * as pgAccounts from "@/lib/repositories/postgres/accounts";
import * as pgAgents from "@/lib/repositories/postgres/agents";
import * as pgMemberships from "@/lib/repositories/postgres/memberships";
import * as pgManagedProfiles from "@/lib/repositories/postgres/managedProfiles";
import * as pgPermissions from "@/lib/repositories/postgres/permissions";
import * as pgApprovals from "@/lib/repositories/postgres/approvals";
import * as pgVerificationLogs from "@/lib/repositories/postgres/verificationLogs";
import * as pgWebhooks from "@/lib/repositories/postgres/webhooks";
import * as pgStripeEvents from "@/lib/repositories/postgres/stripeEvents";
import * as pgUsers from "@/lib/repositories/postgres/users";
import * as pgSessions from "@/lib/repositories/postgres/sessions";
import * as pgApiTokens from "@/lib/repositories/postgres/apiTokens";
import * as pgOauthPending from "@/lib/repositories/postgres/oauthPending";
import * as pgDeviceCodes from "@/lib/repositories/postgres/deviceCodes";
import * as pgSites from "@/lib/repositories/postgres/sites";
import * as pgCli from "@/lib/repositories/postgres/cli";
import * as pgStatus from "@/lib/repositories/postgres/status";
import * as pgEnterpriseInquiries from "@/lib/repositories/postgres/enterpriseInquiries";
import * as pgPermissionProfiles from "@/lib/repositories/postgres/permissionProfiles";
import * as pgPolicyDocuments from "@/lib/repositories/postgres/policyDocuments";
import * as pgIntegrationBindings from "@/lib/repositories/postgres/integrationBindings";
import * as pgAccountDeletion from "@/lib/repositories/postgres/accountDeletion";

/** Aggregates that currently have a Postgres adapter module (may be partial). */
export const POSTGRES_READY_AGGREGATES = [
  "accounts",
  "agents",
  "memberships",
  "managedProfiles",
  "permissions",
  "approvals",
  "verificationLogs",
  "webhooks",
  "stripeEvents",
  "users",
  "sessions",
  "apiTokens",
  "oauthPending",
  "deviceCodes",
  "sites",
  "cli",
  "status",
  "enterpriseInquiries",
  "permissionProfiles",
  "policyDocuments",
  "integrationBindings",
  "accountDeletion"
] as const satisfies readonly RepositoryAggregate[];

export type PostgresReadyAggregate = (typeof POSTGRES_READY_AGGREGATES)[number];

type AnyFn = (...args: never[]) => unknown;

// Tracked in https://github.com/BehalfID/behalf/issues/144 (method-level adapter gaps).
function notImplemented(aggregate: string, method: string): AnyFn {
  return (() => {
    throw new Error(`${method} is not implemented on postgres ${aggregate} adapter`);
  }) as AnyFn;
}

function bindDb<Args extends unknown[], R>(
  db: BehalfPostgresDb,
  fn: (db: BehalfPostgresDb, ...args: Args) => R
): (...args: Args) => R {
  return (...args: Args) => fn(db, ...args);
}

/**
 * Builds a Repositories-shaped module: every function export from the Mongo
 * module is either a db-bound Postgres implementation or throws.
 */
function makePostgresAggregate<M extends Record<string, unknown>>(
  aggregate: string,
  mongoModule: M,
  implemented: Partial<Record<keyof M, AnyFn>>
): M {
  const out = { ...mongoModule };
  for (const key of Object.keys(mongoModule) as Array<keyof M>) {
    const value = mongoModule[key];
    if (typeof value !== "function") continue;
    const impl = implemented[key];
    out[key] = (typeof impl === "function" ? impl : notImplemented(aggregate, String(key))) as M[keyof M];
  }
  return out;
}

function bindAccounts(db: BehalfPostgresDb): typeof mongoAccounts {
  return makePostgresAggregate("accounts", mongoAccounts, {
    findAccountById: bindDb(db, pgAccounts.findAccountById),
    findAccountByIdLean: bindDb(db, pgAccounts.findAccountByIdLean),
    findAccountBySlug: bindDb(db, pgAccounts.findAccountBySlug),
    findAccountBySlugLean: bindDb(db, pgAccounts.findAccountBySlugLean),
    findAccount: bindDb(db, pgAccounts.findAccount),
    listAccounts: bindDb(db, pgAccounts.listAccounts),
    createAccount: bindDb(db, pgAccounts.createAccount),
    updateAccount: bindDb(db, pgAccounts.updateAccount),
    findAccountAndUpdate: bindDb(db, pgAccounts.findAccountAndUpdate),
    countAccounts: bindDb(db, pgAccounts.countAccounts),
    resetVerificationPeriod: bindDb(db, pgAccounts.resetVerificationPeriod),
    incrementVerificationCount: bindDb(db, pgAccounts.incrementVerificationCount)
  });
}

function bindAgents(db: BehalfPostgresDb): typeof mongoAgents {
  return makePostgresAggregate("agents", mongoAgents, {
    countAgentsByAccountId: bindDb(db, pgAgents.countAgentsByAccountId),
    countAgentsByScope: bindDb(db, pgAgents.countAgentsByScope),
    createAgent: bindDb(db, pgAgents.createAgent),
    findAgentByAgentId: bindDb(db, pgAgents.findAgentByAgentId),
    findAgentByApiKeyHash: bindDb(db, pgAgents.findAgentByApiKeyHash),
    listAgents: bindDb(db, pgAgents.listAgents),
    updateAgent: bindDb(db, pgAgents.updateAgent),
    updateAgents: bindDb(db, pgAgents.updateAgents),
    deleteAgents: bindDb(db, pgAgents.deleteAgents),
    rotateAgentKey: bindDb(db, pgAgents.rotateAgentKey),
    touchAgentLastUsedAt: bindDb(db, pgAgents.touchAgentLastUsedAt)
  });
}

function bindMemberships(db: BehalfPostgresDb): typeof mongoMemberships {
  return makePostgresAggregate("memberships", mongoMemberships, {
    countBillableSeatsByAccountId: bindDb(db, pgMemberships.countBillableSeatsByAccountId),
    findMembershipByAccountAndUser: bindDb(db, pgMemberships.findMembershipByAccountAndUser),
    findMembershipByUserAndAccount: bindDb(db, pgMemberships.findMembershipByUserAndAccount),
    findMembershipsByAccountId: bindDb(db, pgMemberships.findMembershipsByAccountId),
    findMembershipsByUserId: bindDb(db, pgMemberships.findMembershipsByUserId),
    createMembership: bindDb(db, pgMemberships.createMembership),
    ensureOwnerMembership: bindDb(db, pgMemberships.ensureOwnerMembership),
    createMembershipOrFindExisting: bindDb(db, pgMemberships.createMembershipOrFindExisting),
    updateMembershipRole: bindDb(db, pgMemberships.updateMembershipRole),
    deleteMembership: bindDb(db, pgMemberships.deleteMembership),
    deleteMembershipById: bindDb(db, pgMemberships.deleteMembershipById),
    deleteMembershipsByAccountId: bindDb(db, pgMemberships.deleteMembershipsByAccountId),
    countMembershipsByAccountExcludingUser: bindDb(
      db,
      pgMemberships.countMembershipsByAccountExcludingUser
    ),
    findInviteByTokenHash: bindDb(db, pgMemberships.findInviteByTokenHash),
    acceptInvite: bindDb(db, pgMemberships.acceptInvite),
    revokeInvite: bindDb(db, pgMemberships.revokeInvite),
    markInviteAccepted: bindDb(db, pgMemberships.markInviteAccepted),
    findPendingInvitesByAccountId: bindDb(db, pgMemberships.findPendingInvitesByAccountId),
    upsertPendingInvite: bindDb(db, pgMemberships.upsertPendingInvite),
    deleteInvitesByAccountId: bindDb(db, pgMemberships.deleteInvitesByAccountId)
  });
}

function bindManagedProfiles(db: BehalfPostgresDb): typeof mongoManagedProfiles {
  return makePostgresAggregate("managedProfiles", mongoManagedProfiles, {
    findManagedProfilePolicyByAccountId: bindDb(
      db,
      pgManagedProfiles.findManagedProfilePolicyByAccountId
    ),
    findManagedProfilePolicyProtectedReposByAccountId: bindDb(
      db,
      pgManagedProfiles.findManagedProfilePolicyProtectedReposByAccountId
    ),
    countProtectedReposByAccountId: bindDb(db, pgManagedProfiles.countProtectedReposByAccountId),
    upsertManagedProfilePolicy: bindDb(db, pgManagedProfiles.upsertManagedProfilePolicy)
  });
}

function bindPermissions(db: BehalfPostgresDb): typeof mongoPermissions {
  return makePostgresAggregate("permissions", mongoPermissions, {
    findMatchingForVerify: bindDb(db, pgPermissions.findMatchingForVerify),
    createPermission: bindDb(db, pgPermissions.createPermission),
    findByPermissionId: bindDb(db, pgPermissions.findByPermissionId),
    revokePermission: bindDb(db, pgPermissions.revokePermission),
    findPermissionsByAgentId: bindDb(db, pgPermissions.findPermissionsByAgentId),
    findActivePermissionsByAgentId: bindDb(db, pgPermissions.findActivePermissionsByAgentId),
    updatePermission: bindDb(db, pgPermissions.updatePermission),
    deletePermissions: bindDb(db, pgPermissions.deletePermissions),
    countPermissions: bindDb(db, pgPermissions.countPermissions),
    findPermissions: bindDb(db, pgPermissions.findPermissions),
    findOnePermission: bindDb(db, pgPermissions.findOnePermission),
    findOneAndUpdatePermission: bindDb(db, pgPermissions.findOneAndUpdatePermission),
    deletePermission: bindDb(db, pgPermissions.deletePermission)
  });
}

function bindApprovals(db: BehalfPostgresDb): typeof mongoApprovals {
  return makePostgresAggregate("approvals", mongoApprovals, {
    consumeApprovedGrant: bindDb(db, pgApprovals.consumeApprovedGrant),
    upsertPendingAgentAction: bindDb(db, pgApprovals.upsertPendingAgentAction),
    upsertPendingManagedProfilePause: bindDb(db, pgApprovals.upsertPendingManagedProfilePause),
    findApproval: bindDb(db, pgApprovals.findApproval),
    findApprovalLean: bindDb(db, pgApprovals.findApprovalLean),
    listApprovals: bindDb(db, pgApprovals.listApprovals),
    approveApproval: bindDb(db, pgApprovals.approveApproval),
    denyApproval: bindDb(db, pgApprovals.denyApproval),
    consumeApprovedPauseApproval: bindDb(db, pgApprovals.consumeApprovedPauseApproval),
    deleteApprovals: bindDb(db, pgApprovals.deleteApprovals),
    countApprovals: bindDb(db, pgApprovals.countApprovals),
    findOneApproval: bindDb(db, pgApprovals.findOneApproval),
    findApprovals: bindDb(db, pgApprovals.findApprovals),
    updateApproval: bindDb(db, pgApprovals.updateApproval)
  });
}

function bindVerificationLogs(db: BehalfPostgresDb): typeof mongoVerificationLogs {
  return makePostgresAggregate("verificationLogs", mongoVerificationLogs, {
    createLog: bindDb(db, pgVerificationLogs.createLog),
    findLogs: bindDb(db, pgVerificationLogs.findLogs),
    findOneLog: bindDb(db, pgVerificationLogs.findOneLog),
    countLogs: bindDb(db, pgVerificationLogs.countLogs),
    aggregateStats: bindDb(db, pgVerificationLogs.aggregateStats),
    findAgentNames: bindDb(db, pgVerificationLogs.findAgentNames),
    updateLogs: bindDb(db, pgVerificationLogs.updateLogs),
    deleteLogs: bindDb(db, pgVerificationLogs.deleteLogs),
    findOneVerificationLog: bindDb(db, pgVerificationLogs.findOneVerificationLog),
    findVerificationLogs: bindDb(db, pgVerificationLogs.findVerificationLogs),
    aggregateVerificationLogs: bindDb(db, pgVerificationLogs.aggregateVerificationLogs)
  });
}

function bindWebhooks(db: BehalfPostgresDb): typeof mongoWebhooks {
  return makePostgresAggregate("webhooks", mongoWebhooks, {
    createEndpoint: bindDb(db, pgWebhooks.createEndpoint),
    createEvent: bindDb(db, pgWebhooks.createEvent),
    findEndpoint: bindDb(db, pgWebhooks.findEndpoint),
    listEndpoints: bindDb(db, pgWebhooks.listEndpoints),
    findActiveEndpointsForEvent: bindDb(db, pgWebhooks.findActiveEndpointsForEvent),
    updateEndpoint: bindDb(db, pgWebhooks.updateEndpoint),
    updateEndpoints: bindDb(db, pgWebhooks.updateEndpoints),
    listEvents: bindDb(db, pgWebhooks.listEvents),
    findEvent: bindDb(db, pgWebhooks.findEvent),
    recoverStuckEvents: bindDb(db, pgWebhooks.recoverStuckEvents),
    claimNextEvent: bindDb(db, pgWebhooks.claimNextEvent),
    insertDeliveries: bindDb(db, pgWebhooks.insertDeliveries),
    markEventCompleted: bindDb(db, pgWebhooks.markEventCompleted),
    markEventFailed: bindDb(db, pgWebhooks.markEventFailed),
    retryEvent: bindDb(db, pgWebhooks.retryEvent),
    listDeliveries: bindDb(db, pgWebhooks.listDeliveries),
    deleteDeliveries: bindDb(db, pgWebhooks.deleteDeliveries),
    deleteEvents: bindDb(db, pgWebhooks.deleteEvents),
    deleteEndpoints: bindDb(db, pgWebhooks.deleteEndpoints),
    countWebhookEvents: bindDb(db, pgWebhooks.countWebhookEvents),
    findOneAndUpdateEndpoint: bindDb(db, pgWebhooks.findOneAndUpdateEndpoint),
    findOneAndUpdateEvent: bindDb(db, pgWebhooks.findOneAndUpdateEvent),
    webhookEventExists: bindDb(db, pgWebhooks.webhookEventExists)
  });
}

function bindStripeEvents(db: BehalfPostgresDb): typeof mongoStripeEvents {
  return makePostgresAggregate("stripeEvents", mongoStripeEvents, {
    createStripeEventIfAbsent: bindDb(db, pgStripeEvents.createStripeEventIfAbsent),
    findStripeEvent: bindDb(db, pgStripeEvents.findStripeEvent),
    deleteStripeEvents: bindDb(db, pgStripeEvents.deleteStripeEvents)
  });
}

function bindUsers(db: BehalfPostgresDb): typeof mongoUsers {
  return makePostgresAggregate("users", mongoUsers, {
    findByEmail: bindDb(db, pgUsers.findByEmail),
    findByEmailWithPassword: bindDb(db, pgUsers.findByEmailWithPassword),
    findByUserId: bindDb(db, pgUsers.findByUserId),
    findByGoogleSub: bindDb(db, pgUsers.findByGoogleSub),
    findByPasswordResetTokenHash: bindDb(db, pgUsers.findByPasswordResetTokenHash),
    findByVerificationTokenHash: bindDb(db, pgUsers.findByVerificationTokenHash),
    findByVerificationCodeHash: bindDb(db, pgUsers.findByVerificationCodeHash),
    findByUserIds: bindDb(db, pgUsers.findByUserIds),
    existsByEmail: bindDb(db, pgUsers.existsByEmail),
    existsByEmailOrGoogleSub: bindDb(db, pgUsers.existsByEmailOrGoogleSub),
    createUser: bindDb(db, pgUsers.createUser),
    updateUser: bindDb(db, pgUsers.updateUser),
    updateUserAtomic: bindDb(db, pgUsers.updateUserAtomic),
    findUnverifiedExpired: bindDb(db, pgUsers.findUnverifiedExpired),
    deleteUser: bindDb(db, pgUsers.deleteUser)
  });
}

function bindSessions(db: BehalfPostgresDb): typeof mongoSessions {
  return makePostgresAggregate("sessions", mongoSessions, {
    createSession: bindDb(db, pgSessions.createSession),
    findByTokenHash: bindDb(db, pgSessions.findByTokenHash),
    findBySessionId: bindDb(db, pgSessions.findBySessionId),
    updateActivity: bindDb(db, pgSessions.updateActivity),
    deleteBySessionId: bindDb(db, pgSessions.deleteBySessionId),
    deleteByTokenHash: bindDb(db, pgSessions.deleteByTokenHash),
    deleteByUserId: bindDb(db, pgSessions.deleteByUserId),
    deleteManyByUserId: bindDb(db, pgSessions.deleteManyByUserId),
    updateActiveAccountId: bindDb(db, pgSessions.updateActiveAccountId),
    clearActiveAccountIdForUserAccount: bindDb(db, pgSessions.clearActiveAccountIdForUserAccount)
  });
}

function bindApiTokens(db: BehalfPostgresDb): typeof mongoApiTokens {
  return makePostgresAggregate("apiTokens", mongoApiTokens, {
    findByTokenHash: bindDb(db, pgApiTokens.findByTokenHash),
    createApiToken: bindDb(db, pgApiTokens.createApiToken),
    listByUserId: bindDb(db, pgApiTokens.listByUserId),
    countByUserId: bindDb(db, pgApiTokens.countByUserId),
    deleteByTokenId: bindDb(db, pgApiTokens.deleteByTokenId),
    deleteManyByUserId: bindDb(db, pgApiTokens.deleteManyByUserId),
    deleteManyByUserOrAccount: bindDb(db, pgApiTokens.deleteManyByUserOrAccount),
    touchLastUsed: bindDb(db, pgApiTokens.touchLastUsed)
  });
}

function bindOauthPending(db: BehalfPostgresDb): typeof mongoOauthPending {
  return makePostgresAggregate("oauthPending", mongoOauthPending, {
    createPendingSignup: bindDb(db, pgOauthPending.createPendingSignup),
    findByPendingId: bindDb(db, pgOauthPending.findByPendingId),
    findByTokenHash: bindDb(db, pgOauthPending.findByTokenHash),
    findByGoogleSub: bindDb(db, pgOauthPending.findByGoogleSub),
    deleteByPendingId: bindDb(db, pgOauthPending.deleteByPendingId),
    deleteExpired: bindDb(db, pgOauthPending.deleteExpired)
  });
}

function bindDeviceCodes(db: BehalfPostgresDb): typeof mongoDeviceCodes {
  return makePostgresAggregate("deviceCodes", mongoDeviceCodes, {
    createDeviceCode: bindDb(db, pgDeviceCodes.createDeviceCode),
    findByDeviceCode: bindDb(db, pgDeviceCodes.findByDeviceCode),
    findByUserCode: bindDb(db, pgDeviceCodes.findByUserCode),
    findOneAndDeleteAuthorized: bindDb(db, pgDeviceCodes.findOneAndDeleteAuthorized),
    updateStatus: bindDb(db, pgDeviceCodes.updateStatus),
    deleteExpired: bindDb(db, pgDeviceCodes.deleteExpired)
  });
}

function bindSites(db: BehalfPostgresDb): typeof mongoSites {
  return makePostgresAggregate("sites", mongoSites, {
    findSite: bindDb(db, pgSites.findSite),
    createSite: bindDb(db, pgSites.createSite),
    updateSite: bindDb(db, pgSites.updateSite),
    listSites: bindDb(db, pgSites.listSites),
    createRule: bindDb(db, pgSites.createRule),
    updateRule: bindDb(db, pgSites.updateRule),
    deleteRule: bindDb(db, pgSites.deleteRule),
    findRulesBySite: bindDb(db, pgSites.findRulesBySite),
    createAccessLog: bindDb(db, pgSites.createAccessLog),
    listAccessLogs: bindDb(db, pgSites.listAccessLogs),
    findKeyByHash: bindDb(db, pgSites.findKeyByHash),
    createKey: bindDb(db, pgSites.createKey),
    revokeKey: bindDb(db, pgSites.revokeKey),
    listKeys: bindDb(db, pgSites.listKeys),
    touchLastUsed: bindDb(db, pgSites.touchLastUsed),
    findSites: bindDb(db, pgSites.findSites),
    createSiteDocument: bindDb(db, pgSites.createSiteDocument),
    findOneSite: bindDb(db, pgSites.findOneSite),
    findOneAndUpdateSite: bindDb(db, pgSites.findOneAndUpdateSite),
    findRules: bindDb(db, pgSites.findRules),
    createRuleDocument: bindDb(db, pgSites.createRuleDocument),
    findOneRule: bindDb(db, pgSites.findOneRule),
    findOneAndUpdateRule: bindDb(db, pgSites.findOneAndUpdateRule),
    findAccessLogs: bindDb(db, pgSites.findAccessLogs),
    findKeys: bindDb(db, pgSites.findKeys),
    createKeyDocument: bindDb(db, pgSites.createKeyDocument),
    findOneAndUpdateKey: bindDb(db, pgSites.findOneAndUpdateKey)
  });
}

function bindCli(db: BehalfPostgresDb): typeof mongoCli {
  return makePostgresAggregate("cli", mongoCli, {
    findActiveLeases: bindDb(db, pgCli.findActiveLeases),
    createLease: bindDb(db, pgCli.createLease),
    createAuditLog: bindDb(db, pgCli.createAuditLog),
    findAuditLogs: bindDb(db, pgCli.findAuditLogs)
  });
}

function bindStatus(db: BehalfPostgresDb): typeof mongoStatus {
  return makePostgresAggregate("status", mongoStatus, {
    listComponents: bindDb(db, pgStatus.listComponents),
    createComponent: bindDb(db, pgStatus.createComponent),
    findComponent: bindDb(db, pgStatus.findComponent),
    updateComponent: bindDb(db, pgStatus.updateComponent),
    deleteComponent: bindDb(db, pgStatus.deleteComponent),
    listIncidents: bindDb(db, pgStatus.listIncidents),
    createIncident: bindDb(db, pgStatus.createIncident),
    findIncident: bindDb(db, pgStatus.findIncident),
    updateIncident: bindDb(db, pgStatus.updateIncident),
    deleteIncident: bindDb(db, pgStatus.deleteIncident),
    findStatusComponents: bindDb(db, pgStatus.findStatusComponents),
    findOneStatusComponent: bindDb(db, pgStatus.findOneStatusComponent),
    findOneAndDeleteStatusComponent: bindDb(db, pgStatus.findOneAndDeleteStatusComponent),
    findStatusIncidents: bindDb(db, pgStatus.findStatusIncidents),
    findOneStatusIncident: bindDb(db, pgStatus.findOneStatusIncident),
    findOneAndDeleteStatusIncident: bindDb(db, pgStatus.findOneAndDeleteStatusIncident)
  });
}

function bindEnterpriseInquiries(db: BehalfPostgresDb): typeof mongoEnterpriseInquiries {
  return makePostgresAggregate("enterpriseInquiries", mongoEnterpriseInquiries, {
    createEnterpriseInquiry: bindDb(db, pgEnterpriseInquiries.createEnterpriseInquiry),
    listEnterpriseInquiries: bindDb(db, pgEnterpriseInquiries.listEnterpriseInquiries),
    findEnterpriseInquiry: bindDb(db, pgEnterpriseInquiries.findEnterpriseInquiry),
    updateEnterpriseInquiry: bindDb(db, pgEnterpriseInquiries.updateEnterpriseInquiry),
    findEnterpriseInquiries: bindDb(db, pgEnterpriseInquiries.findEnterpriseInquiries),
    findOneAndUpdateEnterpriseInquiry: bindDb(
      db,
      pgEnterpriseInquiries.findOneAndUpdateEnterpriseInquiry
    )
  });
}

function bindPermissionProfiles(db: BehalfPostgresDb): typeof mongoPermissionProfiles {
  return makePostgresAggregate("permissionProfiles", mongoPermissionProfiles, {
    listPermissionProfiles: bindDb(db, pgPermissionProfiles.listPermissionProfiles),
    findPermissionProfile: bindDb(db, pgPermissionProfiles.findPermissionProfile),
    createPermissionProfile: bindDb(db, pgPermissionProfiles.createPermissionProfile),
    updatePermissionProfile: bindDb(db, pgPermissionProfiles.updatePermissionProfile)
  });
}

function bindPolicyDocuments(db: BehalfPostgresDb): typeof mongoPolicyDocuments {
  return makePostgresAggregate("policyDocuments", mongoPolicyDocuments, {
    validatePolicyRules: mongoPolicyDocuments.validatePolicyRules as AnyFn,
    toEnginePolicyDocument: mongoPolicyDocuments.toEnginePolicyDocument as AnyFn,
    toStoredPolicyDocument: mongoPolicyDocuments.toStoredPolicyDocument as AnyFn,
    findActivePolicyByAccountId: bindDb(db, pgPolicyDocuments.findActivePolicyByAccountId),
    findPolicyByAccountId: bindDb(db, pgPolicyDocuments.findPolicyByAccountId),
    upsertPolicyDocument: bindDb(db, pgPolicyDocuments.upsertPolicyDocument),
    updatePolicyDocument: bindDb(db, pgPolicyDocuments.updatePolicyDocument),
    deletePolicyDocument: bindDb(db, pgPolicyDocuments.deletePolicyDocument)
  });
}

function bindIntegrationBindings(db: BehalfPostgresDb): typeof mongoIntegrationBindings {
  return makePostgresAggregate("integrationBindings", mongoIntegrationBindings, {
    listIntegrationBindings: bindDb(db, pgIntegrationBindings.listIntegrationBindings),
    findIntegrationBinding: bindDb(db, pgIntegrationBindings.findIntegrationBinding),
    findSlackBindingsWithSecrets: bindDb(db, pgIntegrationBindings.findSlackBindingsWithSecrets),
    findSlackBindingByTeamWithSecrets: bindDb(
      db,
      pgIntegrationBindings.findSlackBindingByTeamWithSecrets
    ),
    createSlackBinding: bindDb(db, pgIntegrationBindings.createSlackBinding),
    upsertIdentityMapping: bindDb(db, pgIntegrationBindings.upsertIdentityMapping),
    disableIntegrationBinding: bindDb(db, pgIntegrationBindings.disableIntegrationBinding),
    findMessageRefByApproval: bindDb(db, pgIntegrationBindings.findMessageRefByApproval),
    upsertMessageRef: bindDb(db, pgIntegrationBindings.upsertMessageRef),
    resolveUserIdFromBinding: pgIntegrationBindings.resolveUserIdFromBinding as AnyFn
  });
}

function bindAccountDeletion(db: BehalfPostgresDb): typeof mongoAccountDeletion {
  return makePostgresAggregate("accountDeletion", mongoAccountDeletion, {
    findDeveloperUserForDeletion: bindDb(db, pgAccountDeletion.findDeveloperUserForDeletion),
    findMembershipsForDeletion: bindDb(db, pgAccountDeletion.findMembershipsForDeletion),
    countOtherMemberships: bindDb(db, pgAccountDeletion.countOtherMemberships),
    deleteMembershipForDeletion: bindDb(db, pgAccountDeletion.deleteMembershipForDeletion),
    deleteAccountCascade: bindDb(db, pgAccountDeletion.deleteAccountCascade),
    deleteDeveloperUserCredentials: bindDb(db, pgAccountDeletion.deleteDeveloperUserCredentials)
  });
}

/**
 * Returns a Repositories-compatible partial for aggregates that already have
 * Postgres adapters. Callers must supply a live Drizzle db.
 */
export function createPostgresRuntimeRepositories(db: BehalfPostgresDb) {
  return {
    accounts: bindAccounts(db),
    agents: bindAgents(db),
    memberships: bindMemberships(db),
    managedProfiles: bindManagedProfiles(db),
    permissions: bindPermissions(db),
    approvals: bindApprovals(db),
    verificationLogs: bindVerificationLogs(db),
    webhooks: bindWebhooks(db),
    stripeEvents: bindStripeEvents(db),
    users: bindUsers(db),
    sessions: bindSessions(db),
    apiTokens: bindApiTokens(db),
    oauthPending: bindOauthPending(db),
    deviceCodes: bindDeviceCodes(db),
    sites: bindSites(db),
    cli: bindCli(db),
    status: bindStatus(db),
    enterpriseInquiries: bindEnterpriseInquiries(db),
    permissionProfiles: bindPermissionProfiles(db),
    policyDocuments: bindPolicyDocuments(db),
    integrationBindings: bindIntegrationBindings(db),
    accountDeletion: bindAccountDeletion(db)
  };
}

export function isPostgresAdapterReady(aggregate: RepositoryAggregate): boolean {
  return (POSTGRES_READY_AGGREGATES as readonly string[]).includes(aggregate);
}
