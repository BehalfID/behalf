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

export async function deletePermissions(filter: Record<string, unknown>) {
  return Permission.deleteMany(filter);
}

export async function countPermissions(filter: Record<string, unknown>) {
  return Permission.countDocuments(filter);
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findPermissions(filter: Record<string, unknown> = {}) {
  return Permission.find(filter);
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
