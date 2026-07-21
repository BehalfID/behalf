/**
 * Test-only Postgres repository adapters — not exported from lib/repositories/index.ts.
 * Production runtime continues to use Mongo/Mongoose repositories.
 */

export {
  findAccountById,
  incrementVerificationCount,
  resetVerificationPeriod
} from "@/lib/repositories/postgres/accounts";
export { countAgentsByAccountId, countAgentsByScope } from "@/lib/repositories/postgres/agents";
export {
  countBillableSeatsByAccountId,
  createMembership,
  deleteMembership,
  findMembershipByAccountAndUser,
  findMembershipsByAccountId,
  findPendingInvitesByAccountId,
  updateMembershipRole,
  upsertPendingInvite
} from "@/lib/repositories/postgres/memberships";
export {
  countProtectedReposByAccountId,
  findManagedProfilePolicyByAccountId,
  findManagedProfilePolicyProtectedReposByAccountId,
  upsertManagedProfilePolicy
} from "@/lib/repositories/postgres/managedProfiles";
export {
  backfillPermissionAccountId,
  createPermission,
  findPermissionsByAccountAndAgent,
  findPermissionsMatchingAction,
  touchPermissionLastUsed
} from "@/lib/repositories/postgres/permissions";
export {
  approveAgentGrant,
  consumeApprovedAgentGrant,
  findApprovalById,
  upsertPendingAgentApproval
} from "@/lib/repositories/postgres/approvals";
export {
  createVerificationLog,
  findVerificationLogsByAccount
} from "@/lib/repositories/postgres/verificationLogs";
export {
  claimNextWebhookEvent,
  countDeadLetterWebhookEvents,
  countPendingWebhookEvents,
  createWebhookEndpoint,
  enqueueWebhookEventRecord,
  findActiveWebhookEndpointsForEvent,
  findWebhookDeliveriesByWebhook,
  findWebhookEndpointById,
  insertWebhookDeliveries,
  markWebhookEventCompleted,
  markWebhookEventDeadLetter,
  markWebhookEventForRetry,
  touchWebhookEndpointsLastTriggered,
  updateWebhookEndpointStatus
} from "@/lib/repositories/postgres/webhooks";
