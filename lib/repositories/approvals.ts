/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/approvals";
import { delegate } from "@/lib/repositories/delegate";

export type {
  ApprovalLean,
  ApprovalRepository,
  ApprovalScope,
  ApprovedGrantTuple,
} from "@/lib/repositories/mongo/approvals";

export {
  APPROVAL_GRANT_TTL_MS,
  approvalRepository,
} from "@/lib/repositories/mongo/approvals";

export const consumeApprovedGrant = delegate("approvals", "consumeApprovedGrant", mongo.consumeApprovedGrant);
export const upsertPendingAgentAction = delegate("approvals", "upsertPendingAgentAction", mongo.upsertPendingAgentAction);
export const upsertPendingManagedProfilePause = delegate("approvals", "upsertPendingManagedProfilePause", mongo.upsertPendingManagedProfilePause);
export const findApproval = delegate("approvals", "findApproval", mongo.findApproval);
export const findApprovalLean = delegate("approvals", "findApprovalLean", mongo.findApprovalLean);
export const listApprovals = delegate("approvals", "listApprovals", mongo.listApprovals);
export const approveApproval = delegate("approvals", "approveApproval", mongo.approveApproval);
export const denyApproval = delegate("approvals", "denyApproval", mongo.denyApproval);
export const consumeApprovedPauseApproval = delegate("approvals", "consumeApprovedPauseApproval", mongo.consumeApprovedPauseApproval);
export const deleteApprovals = delegate("approvals", "deleteApprovals", mongo.deleteApprovals);
export const countApprovals = delegate("approvals", "countApprovals", mongo.countApprovals);
export const findOneApproval = delegate("approvals", "findOneApproval", mongo.findOneApproval);
export const findApprovals = delegate("approvals", "findApprovals", mongo.findApprovals);
export const updateApproval = delegate("approvals", "updateApproval", mongo.updateApproval);
