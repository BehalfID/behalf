/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/users";
import { delegate } from "@/lib/repositories/delegate";

export type {
  DeveloperUserLean,
  CreateUserInput,
  UserSet,
  UserLookupOptions,
  UsersRepository,
} from "@/lib/repositories/mongo/users";

export {
  userRepository,
  findOne,
  find,
  create,
  updateOne,
  updateMany,
  deleteOne,
} from "@/lib/repositories/mongo/users";

export const findByEmail = delegate("users", "findByEmail", mongo.findByEmail);
export const findByEmailWithPassword = delegate("users", "findByEmailWithPassword", mongo.findByEmailWithPassword);
export const findByUserId = delegate("users", "findByUserId", mongo.findByUserId);
export const findByGoogleSub = delegate("users", "findByGoogleSub", mongo.findByGoogleSub);
export const findByPasswordResetTokenHash = delegate("users", "findByPasswordResetTokenHash", mongo.findByPasswordResetTokenHash);
export const findByVerificationTokenHash = delegate("users", "findByVerificationTokenHash", mongo.findByVerificationTokenHash);
export const findByVerificationCodeHash = delegate("users", "findByVerificationCodeHash", mongo.findByVerificationCodeHash);
export const findByUserIds = delegate("users", "findByUserIds", mongo.findByUserIds);
export const existsByEmail = delegate("users", "existsByEmail", mongo.existsByEmail);
export const existsByEmailOrGoogleSub = delegate("users", "existsByEmailOrGoogleSub", mongo.existsByEmailOrGoogleSub);
export const createUser = delegate("users", "createUser", mongo.createUser);
export const updateUser = delegate("users", "updateUser", mongo.updateUser);
export const updateUserAtomic = delegate("users", "updateUserAtomic", mongo.updateUserAtomic);
export const findUnverifiedExpired = delegate("users", "findUnverifiedExpired", mongo.findUnverifiedExpired);
export const createUserDocument = delegate("users", "createUserDocument", mongo.createUserDocument);
export const findUsers = delegate("users", "findUsers", mongo.findUsers);
export const findOneUser = delegate("users", "findOneUser", mongo.findOneUser);
export const updateUserByFilter = delegate("users", "updateUserByFilter", mongo.updateUserByFilter);
export const countUserDocuments = delegate("users", "countUserDocuments", mongo.countUserDocuments);
export const userExists = delegate("users", "userExists", mongo.userExists);
export const deleteUser = delegate("users", "deleteUser", mongo.deleteUser);
