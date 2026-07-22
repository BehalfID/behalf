/**
 * Test-only Postgres repository adapters — not exported from lib/repositories/index.ts.
 * Production runtime continues to use Mongo/Mongoose repositories.
 */

export {
  countAccounts,
  createAccount,
  findAccount,
  findAccountAndUpdate,
  findAccountById,
  findAccountByIdLean,
  findAccountBySlug,
  findAccountBySlugLean,
  incrementVerificationCount,
  listAccounts,
  resetVerificationPeriod,
  updateAccount
} from "@/lib/repositories/postgres/accounts";
export {
  countAgentsByAccountId,
  countAgentsByScope,
  createAgent,
  deleteAgents,
  findAgentByAgentId,
  findAgentByApiKeyHash,
  listAgents,
  rotateAgentKey,
  touchAgentLastUsedAt,
  updateAgent,
  updateAgents
} from "@/lib/repositories/postgres/agents";
export {
  countByUserId as countApiTokensByUserId,
  createApiToken,
  deleteByTokenId as deleteApiTokenByTokenId,
  deleteManyByUserId as deleteApiTokensByUserId,
  deleteManyByUserOrAccount as deleteApiTokensByUserOrAccount,
  findByTokenHash as findApiTokenByTokenHash,
  listByUserId as listApiTokensByUserId,
  touchLastUsed as touchApiTokenLastUsed
} from "@/lib/repositories/postgres/apiTokens";
export {
  createDeviceCode,
  deleteExpired as deleteExpiredDeviceCodes,
  findByDeviceCode,
  findByUserCode as findDeviceCodeByUserCode,
  findOneAndDeleteAuthorized,
  updateStatus as updateDeviceCodeStatus
} from "@/lib/repositories/postgres/deviceCodes";
export {
  createSlackBinding,
  disableIntegrationBinding,
  findIntegrationBinding,
  findMessageRefByApproval,
  findSlackBindingByTeamWithSecrets,
  findSlackBindingsWithSecrets,
  listIntegrationBindings,
  resolveUserIdFromBinding,
  upsertIdentityMapping,
  upsertMessageRef
} from "@/lib/repositories/postgres/integrationBindings";
export {
  acceptInvite,
  countBillableSeatsByAccountId,
  countMembershipsByAccountExcludingUser,
  createMembership,
  createMembershipOrFindExisting,
  deleteInvitesByAccountId,
  deleteMembership,
  deleteMembershipById,
  deleteMembershipsByAccountId,
  ensureOwnerMembership,
  findInviteByTokenHash,
  findMembershipByAccountAndUser,
  findMembershipByUserAndAccount,
  findMembershipsByAccountId,
  findMembershipsByUserId,
  findPendingInvitesByAccountId,
  markInviteAccepted,
  revokeInvite,
  updateMembershipRole,
  upsertPendingInvite
} from "@/lib/repositories/postgres/memberships";
export {
  createPendingSignup,
  deleteByPendingId as deleteOAuthPendingByPendingId,
  deleteExpired as deleteExpiredOAuthPending,
  findByGoogleSub as findOAuthPendingByGoogleSub,
  findByPendingId,
  findByTokenHash as findOAuthPendingByTokenHash
} from "@/lib/repositories/postgres/oauthPending";
export {
  deletePolicyDocument,
  findActivePolicyByAccountId,
  findPolicyByAccountId,
  updatePolicyDocument,
  upsertPolicyDocument
} from "@/lib/repositories/postgres/policyDocuments";
export {
  countPermissions,
  createPermission,
  createPostgresPermissionRepository,
  deletePermission,
  deletePermissions,
  findActivePermissionsByAgentId,
  findByPermissionId,
  findMatchingForVerify,
  findOneAndUpdatePermission,
  findOnePermission,
  findPermissions,
  findPermissionsByAgentId,
  revokePermission,
  updatePermission,
  updatePermissions
} from "@/lib/repositories/postgres/permissions";
export {
  approveApproval,
  consumeApprovedGrant,
  consumeApprovedPauseApproval,
  countApprovals,
  createPostgresApprovalRepository,
  deleteApprovals,
  denyApproval,
  findApproval,
  findApprovalLean,
  findApprovals,
  findOneApproval,
  listApprovals,
  normalizeApproval,
  updateApproval,
  upsertPendingAgentAction,
  upsertPendingManagedProfilePause
} from "@/lib/repositories/postgres/approvals";
export {
  clearActiveAccountIdForUserAccount,
  createSession,
  deleteBySessionId,
  deleteByTokenHash as deleteSessionByTokenHash,
  deleteByUserId as deleteSessionByUserId,
  deleteManyByUserId as deleteSessionsByUserId,
  findBySessionId,
  findByTokenHash as findSessionByTokenHash,
  updateActiveAccountId,
  updateActivity
} from "@/lib/repositories/postgres/sessions";
export {
  createUser,
  deleteUser,
  existsByEmail,
  existsByEmailOrGoogleSub,
  findByEmail,
  findByEmailWithPassword,
  findByGoogleSub,
  findByPasswordResetTokenHash,
  findByUserId,
  findByUserIds,
  findByVerificationCodeHash,
  findByVerificationTokenHash,
  findUnverifiedExpired,
  updateUser,
  updateUserAtomic
} from "@/lib/repositories/postgres/users";
export {
  aggregateStats,
  aggregateVerificationLogs,
  countLogs,
  createLog,
  createPostgresVerificationLogRepository,
  deleteLogs,
  findAgentNames,
  findLogs,
  findOneLog,
  findOneVerificationLog,
  findVerificationLogs,
  normalizeVerificationLog,
  updateLogs
} from "@/lib/repositories/postgres/verificationLogs";
export {
  claimNextEvent,
  countWebhookEvents,
  createEndpoint,
  createEvent,
  createPostgresWebhookDeliveryRepository,
  createPostgresWebhookEndpointRepository,
  createPostgresWebhookEventRepository,
  createPostgresWebhookRepository,
  deleteDeliveries,
  deleteEndpoints,
  deleteEvents,
  findActiveEndpointsForEvent,
  findEndpoint,
  findEvent,
  findOneAndUpdateEndpoint,
  findOneAndUpdateEvent,
  insertDeliveries,
  listDeliveries,
  listEndpoints,
  listEvents,
  markEventCompleted,
  markEventFailed,
  normalizeWebhookDelivery,
  normalizeWebhookEndpoint,
  normalizeWebhookEvent,
  recoverStuckEvents,
  retryEvent,
  updateEndpoint,
  updateEndpoints,
  webhookEventExists
} from "@/lib/repositories/postgres/webhooks";
export {
  countProtectedReposByAccountId,
  createPostgresManagedProfilePolicyRepository,
  findManagedProfilePolicyByAccountId,
  findManagedProfilePolicyProtectedReposByAccountId,
  upsertManagedProfilePolicy
} from "@/lib/repositories/postgres/managedProfiles";
export {
  createAccessLog,
  createKey,
  createKeyDocument,
  createPostgresSiteAccessLogRepository,
  createPostgresSiteAccessRuleRepository,
  createPostgresSiteGuardKeyRepository,
  createPostgresSiteRepository,
  createRule,
  createRuleDocument,
  createSite,
  createSiteDocument,
  deleteRule,
  findAccessLogs,
  findKeyByHash,
  findKeys,
  findOneAndUpdateKey,
  findOneAndUpdateRule,
  findOneAndUpdateSite,
  findOneRule,
  findOneSite,
  findRules,
  findRulesBySite,
  findSite,
  findSites,
  listAccessLogs,
  listKeys,
  listSites,
  revokeKey,
  touchLastUsed,
  updateRule,
  updateSite
} from "@/lib/repositories/postgres/sites";
export {
  createAuditLog,
  createLease,
  createPostgresCliAuditLogRepository,
  findActiveLeases,
  findAuditLogs,
  findCliAuditActivities
} from "@/lib/repositories/postgres/cli";
export {
  createComponent,
  createIncident,
  createPostgresStatusComponentRepository,
  createPostgresStatusIncidentRepository,
  deleteComponent,
  deleteIncident,
  findComponent,
  findIncident,
  findOneAndDeleteStatusComponent,
  findOneAndDeleteStatusIncident,
  findOneStatusComponent,
  findOneStatusIncident,
  findStatusComponents,
  findStatusIncidents,
  listComponents,
  listIncidents,
  updateComponent,
  updateIncident
} from "@/lib/repositories/postgres/status";
export {
  createEnterpriseInquiry,
  createPostgresEnterpriseInquiryRepository,
  findEnterpriseInquiries,
  findEnterpriseInquiry,
  findOneAndUpdateEnterpriseInquiry,
  listEnterpriseInquiries,
  updateEnterpriseInquiry
} from "@/lib/repositories/postgres/enterpriseInquiries";
export {
  createPostgresStripeEventRepository,
  createStripeEventIfAbsent,
  deleteStripeEvents,
  findStripeEvent
} from "@/lib/repositories/postgres/stripeEvents";
export {
  createPermissionProfile,
  findPermissionProfile,
  listPermissionProfiles,
  updatePermissionProfile
} from "@/lib/repositories/postgres/permissionProfiles";
export {
  countOtherMemberships,
  deleteAccountCascade,
  deleteDeveloperUserCredentials,
  deleteMembershipForDeletion,
  findDeveloperUserForDeletion,
  findMembershipsForDeletion
} from "@/lib/repositories/postgres/accountDeletion";
