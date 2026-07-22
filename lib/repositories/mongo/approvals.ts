import ApprovalRequest, {
  APPROVAL_GRANT_TTL_MS,
  type ApprovalRequestDocument
} from "@/models/ApprovalRequest";
import { isMongoDuplicateKeyError } from "@/lib/repositories/errors";

export type ApprovalLean = ApprovalRequestDocument;
export type ApprovalRepository = typeof approvalRepository;
export type ApprovalScope = { accountId?: string; developerUserId?: string };
export { APPROVAL_GRANT_TTL_MS };

export type ApprovedGrantTuple = {
  agentId: string;
  permissionId: string;
  action: string;
  vendor: string | null;
  amount: number | null;
  argumentFingerprint: string | null;
};

export async function consumeApprovedGrant(tuple: ApprovedGrantTuple, now = new Date()) {
  return ApprovalRequest.findOneAndUpdate(
    { ...tuple, status: "approved", grantExpiresAt: { $gt: now } },
    { $set: { status: "used", usedAt: now } },
    { returnDocument: "before" }
  );
}

export async function upsertPendingAgentAction(
  pendingFilter: Record<string, unknown>,
  setOnInsert: Record<string, unknown>
) {
  try {
    return await ApprovalRequest.findOneAndUpdate(
      pendingFilter,
      { $setOnInsert: setOnInsert },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    if (!isMongoDuplicateKeyError(error)) throw error;
    return ApprovalRequest.findOne(pendingFilter);
  }
}

export async function upsertPendingManagedProfilePause(
  pendingFilter: Record<string, unknown>,
  setOnInsert: Record<string, unknown>
) {
  try {
    return await ApprovalRequest.findOneAndUpdate(
      pendingFilter,
      { $setOnInsert: setOnInsert },
      { upsert: true, returnDocument: "after" }
    ).lean();
  } catch (error) {
    if (!isMongoDuplicateKeyError(error)) throw error;
    return ApprovalRequest.findOne(pendingFilter).lean();
  }
}

export function findApproval(filter: Record<string, unknown>, select?: string) {
  const query = ApprovalRequest.findOne(filter);
  if (select) query.select(select);
  return query;
}

export async function findApprovalLean(filter: Record<string, unknown>, select?: string) {
  const query = ApprovalRequest.findOne(filter);
  if (select) query.select(select);
  return query.lean();
}

export function listApprovals(
  filter: Record<string, unknown>,
  options: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number; select?: string } = {}
) {
  const query = ApprovalRequest.find(filter).sort(options.sort ?? { createdAt: -1 });
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query;
}

export async function approveApproval(
  approvalId: string,
  scope: ApprovalScope,
  resolvedBy: string,
  grantExpiresAt: Date,
  now = new Date()
) {
  return ApprovalRequest.updateOne(
    { ...scope, approvalId, status: "pending" },
    { $set: { status: "approved", resolvedBy, resolvedAt: now, grantExpiresAt } }
  );
}

export async function denyApproval(
  approvalId: string,
  scope: ApprovalScope,
  resolvedBy: string,
  now = new Date()
) {
  return ApprovalRequest.updateOne(
    { ...scope, approvalId, status: "pending" },
    { $set: { status: "denied", resolvedBy, resolvedAt: now } }
  );
}

export async function consumeApprovedPauseApproval(
  filter: Record<string, unknown>,
  now = new Date()
) {
  return ApprovalRequest.updateOne(
    { ...filter, status: "approved", grantExpiresAt: { $gt: now } },
    { $set: { status: "used", resolvedAt: now } }
  );
}

export async function deleteApprovals(filter: Record<string, unknown>) {
  return ApprovalRequest.deleteMany(filter);
}

export async function countApprovals(filter: Record<string, unknown>) {
  return ApprovalRequest.countDocuments(filter);
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findOneApproval(filter: Record<string, unknown>) {
  return ApprovalRequest.findOne(filter);
}

export function findApprovals(filter: Record<string, unknown> = {}) {
  return ApprovalRequest.find(filter);
}

export function updateApproval(filter: Record<string, unknown>, update: Record<string, unknown>) {
  return ApprovalRequest.updateOne(filter, update);
}

export const approvalRepository = {
  consumeApprovedGrant,
  upsertPendingAgentAction,
  upsertPendingManagedProfilePause,
  findOne: findOneApproval,
  findOneLean: findApprovalLean,
  find: findApprovals,
  approve: approveApproval,
  deny: denyApproval,
  consumeApprovedPauseApproval,
  updateOne: updateApproval,
  deleteMany: deleteApprovals,
  countDocuments: countApprovals
};
