/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/accountDeletion";
import { delegate } from "@/lib/repositories/delegate";

export const findDeveloperUserForDeletion = delegate("accountDeletion", "findDeveloperUserForDeletion", mongo.findDeveloperUserForDeletion);
export const findMembershipsForDeletion = delegate("accountDeletion", "findMembershipsForDeletion", mongo.findMembershipsForDeletion);
export const countOtherMemberships = delegate("accountDeletion", "countOtherMemberships", mongo.countOtherMemberships);
export const deleteMembershipForDeletion = delegate("accountDeletion", "deleteMembershipForDeletion", mongo.deleteMembershipForDeletion);
export const deleteAccountCascade = delegate("accountDeletion", "deleteAccountCascade", mongo.deleteAccountCascade);
export const deleteDeveloperUserCredentials = delegate("accountDeletion", "deleteDeveloperUserCredentials", mongo.deleteDeveloperUserCredentials);
