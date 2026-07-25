/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/managedProfiles";
import { delegate } from "@/lib/repositories/delegate";

export {
  managedProfilePolicyRepository,
} from "@/lib/repositories/mongo/managedProfiles";

export const findManagedProfilePolicyByAccountId = delegate("managedProfiles", "findManagedProfilePolicyByAccountId", mongo.findManagedProfilePolicyByAccountId);
export const findManagedProfilePolicyProtectedReposByAccountId = delegate("managedProfiles", "findManagedProfilePolicyProtectedReposByAccountId", mongo.findManagedProfilePolicyProtectedReposByAccountId);
export const countProtectedReposByAccountId = delegate("managedProfiles", "countProtectedReposByAccountId", mongo.countProtectedReposByAccountId);
export const upsertManagedProfilePolicy = delegate("managedProfiles", "upsertManagedProfilePolicy", mongo.upsertManagedProfilePolicy);
