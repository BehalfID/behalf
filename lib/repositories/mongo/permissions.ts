import Permission, { type PermissionDocument } from "@/models/Permission";
import { lazyModelMethod } from "@/lib/repositories/mongoModelAdapter";

export type PermissionLean = PermissionDocument;
export type PermissionRepository = typeof permissionRepository;
export type PermissionScope = { accountId?: string; developerUserId?: string };

export async function findMatchingForVerify(agentId: string, action: string) {
  return Permission.find({
    agentId,
    $or: [
      { action },
      { allowedActions: action },
      { blockedActions: action }
    ]
  }).sort({ createdAt: -1 });
}

export type CreatePermissionInput = Partial<Omit<PermissionDocument, "constraints">> & {
  constraints?: {
    maxAmount?: number | null;
    allowedVendors?: string[];
    expiresAt?: Date | null;
    allowedPaths?: string[];
    deniedPaths?: string[];
    deniedCommands?: string[];
  };
};

export async function createPermission(input: CreatePermissionInput) {
  return Permission.create(input);
}

export async function findByPermissionId(permissionId: string, scope: PermissionScope = {}) {
  return Permission.findOne({ ...scope, permissionId });
}

export async function findReplacementByIdempotencyKey(
  accountId: string,
  idempotencyKey: string
) {
  return Permission.findOne({ accountId, replacementIdempotencyKey: idempotencyKey });
}

export type StageReplacementPermissionInput = CreatePermissionInput & {
  permissionId: string;
  accountId: string;
  agentId: string;
  action: string;
  replacesPermissionId: string;
  replacementIdempotencyKey: string;
  status: "inactive";
};

export async function stageReplacementPermission(input: StageReplacementPermissionInput) {
  return Permission.create(input);
}

export async function revokeActivePermissionForReplacement(options: {
  permissionId: string;
  accountId: string;
  agentId: string;
  replacementPermissionId: string;
  updatedBy: string;
  expectedUpdatedAt?: Date;
}) {
  const filter: Record<string, unknown> = {
    accountId: options.accountId,
    agentId: options.agentId,
    permissionId: options.permissionId,
    status: "active"
  };
  if (options.expectedUpdatedAt) {
    filter.updatedAt = options.expectedUpdatedAt;
  }
  return Permission.findOneAndUpdate(
    filter,
    {
      $set: {
        status: "revoked",
        updatedBy: options.updatedBy,
        replacedByPermissionId: options.replacementPermissionId
      }
    },
    { returnDocument: "after" }
  );
}

export async function activateStagedReplacementPermission(options: {
  permissionId: string;
  accountId: string;
  agentId: string;
  updatedBy: string;
  replacesPermissionId: string;
}) {
  return Permission.findOneAndUpdate(
    {
      accountId: options.accountId,
      agentId: options.agentId,
      permissionId: options.permissionId,
      status: "inactive",
      replacesPermissionId: options.replacesPermissionId
    },
    {
      $set: {
        status: "active",
        updatedBy: options.updatedBy
      }
    },
    { returnDocument: "after" }
  );
}

export async function abandonStagedReplacementPermission(options: {
  permissionId: string;
  accountId: string;
  agentId: string;
  updatedBy: string;
}) {
  return Permission.findOneAndUpdate(
    {
      accountId: options.accountId,
      agentId: options.agentId,
      permissionId: options.permissionId,
      status: "inactive"
    },
    {
      $set: {
        status: "revoked",
        updatedBy: options.updatedBy
      }
    },
    { returnDocument: "after" }
  );
}

export async function revokePermission(
  permissionId: string,
  scope: PermissionScope = {},
  updatedBy?: string
) {
  return Permission.updateOne(
    { ...scope, permissionId },
    { $set: { status: "revoked", ...(updatedBy ? { updatedBy } : {}) } }
  );
}

export async function findPermissionsByAgentId(agentId: string, scope: PermissionScope = {}) {
  return Permission.find({ ...scope, agentId });
}

export async function findActivePermissionsByAgentId(agentId: string, scope: PermissionScope = {}) {
  return Permission.find({ ...scope, agentId, status: "active" });
}

export async function updatePermission(
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return Permission.updateOne(filter, update);
}

export async function updatePermissions(
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return Permission.updateMany(filter, update);
}

export async function deletePermissions(filter: Record<string, unknown>) {
  return Permission.deleteMany(filter);
}

export async function countPermissions(filter: Record<string, unknown>) {
  return Permission.countDocuments(filter);
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findPermissions(
  filter: Record<string, unknown> = {},
  options: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number; select?: string } = {}
) {
  const query = Permission.find(filter);
  if (options.sort) query.sort(options.sort);
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query.lean();
}

export function findOnePermission(filter: Record<string, unknown>) {
  return Permission.findOne(filter);
}

export function findOneAndUpdatePermission(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return Permission.findOneAndUpdate(filter, update, options);
}

export function deletePermission(filter: Record<string, unknown>) {
  return Permission.deleteOne(filter);
}

export const permissionRepository = {
  findMatchingForVerify,
  create: createPermission,
  find: findPermissions,
  findOne: findOnePermission,
  findOneAndUpdate: findOneAndUpdatePermission,
  findByPermissionId,
  findReplacementByIdempotencyKey,
  stageReplacement: stageReplacementPermission,
  revokeActiveForReplacement: revokeActivePermissionForReplacement,
  activateStagedReplacement: activateStagedReplacementPermission,
  abandonStagedReplacement: abandonStagedReplacementPermission,
  revoke: revokePermission,
  findByAgentId: findPermissionsByAgentId,
  findActiveByAgentId: findActivePermissionsByAgentId,
  updateOne: updatePermission,
  deleteOne: deletePermission,
  deleteMany: deletePermissions,
  countDocuments: countPermissions
};

export const find = lazyModelMethod(() => Permission, "find");
export const create = lazyModelMethod(() => Permission, "create");
export const updateOne = lazyModelMethod(() => Permission, "updateOne");
export const updateMany = lazyModelMethod(() => Permission, "updateMany");
export const deleteMany = lazyModelMethod(() => Permission, "deleteMany");
export const countDocuments = lazyModelMethod(() => Permission, "countDocuments");
