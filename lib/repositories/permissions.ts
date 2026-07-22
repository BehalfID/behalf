/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/permissions";
import { delegate } from "@/lib/repositories/delegate";

export type {
  PermissionLean,
  PermissionRepository,
  PermissionScope,
  CreatePermissionInput,
} from "@/lib/repositories/mongo/permissions";

export {
  permissionRepository,
  find,
  create,
  updateOne,
  updateMany,
  deleteMany,
  countDocuments,
} from "@/lib/repositories/mongo/permissions";

export const findMatchingForVerify = delegate("permissions", "findMatchingForVerify", mongo.findMatchingForVerify);
export const createPermission = delegate("permissions", "createPermission", mongo.createPermission);
export const findByPermissionId = delegate("permissions", "findByPermissionId", mongo.findByPermissionId);
export const revokePermission = delegate("permissions", "revokePermission", mongo.revokePermission);
export const findPermissionsByAgentId = delegate("permissions", "findPermissionsByAgentId", mongo.findPermissionsByAgentId);
export const findActivePermissionsByAgentId = delegate("permissions", "findActivePermissionsByAgentId", mongo.findActivePermissionsByAgentId);
export const updatePermission = delegate("permissions", "updatePermission", mongo.updatePermission);
export const deletePermissions = delegate("permissions", "deletePermissions", mongo.deletePermissions);
export const countPermissions = delegate("permissions", "countPermissions", mongo.countPermissions);
export const findPermissions = delegate("permissions", "findPermissions", mongo.findPermissions);
export const findOnePermission = delegate("permissions", "findOnePermission", mongo.findOnePermission);
export const findOneAndUpdatePermission = delegate("permissions", "findOneAndUpdatePermission", mongo.findOneAndUpdatePermission);
export const deletePermission = delegate("permissions", "deletePermission", mongo.deletePermission);
