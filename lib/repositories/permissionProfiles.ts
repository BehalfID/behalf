/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/permissionProfiles";
import { delegate } from "@/lib/repositories/delegate";

export type {
  PermissionProfileLean,
  ProfilePermissionEntry,
  CreatePermissionProfileInput,
} from "@/lib/repositories/mongo/permissionProfiles";

export const listPermissionProfiles = delegate("permissionProfiles", "listPermissionProfiles", mongo.listPermissionProfiles);
export const findPermissionProfile = delegate("permissionProfiles", "findPermissionProfile", mongo.findPermissionProfile);
export const createPermissionProfile = delegate("permissionProfiles", "createPermissionProfile", mongo.createPermissionProfile);
export const updatePermissionProfile = delegate("permissionProfiles", "updatePermissionProfile", mongo.updatePermissionProfile);
