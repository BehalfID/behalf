/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/policyDocuments";
import { delegate } from "@/lib/repositories/delegate";

export type {
  PolicyDocumentLean,
  StoredPolicyDocument,
  UpsertPolicyInput,
} from "@/lib/repositories/mongo/policyDocuments";

export const validatePolicyRules = delegate("policyDocuments", "validatePolicyRules", mongo.validatePolicyRules);
export const toEnginePolicyDocument = delegate("policyDocuments", "toEnginePolicyDocument", mongo.toEnginePolicyDocument);
export const toStoredPolicyDocument = delegate("policyDocuments", "toStoredPolicyDocument", mongo.toStoredPolicyDocument);
export const findActivePolicyByAccountId = delegate("policyDocuments", "findActivePolicyByAccountId", mongo.findActivePolicyByAccountId);
export const findPolicyByAccountId = delegate("policyDocuments", "findPolicyByAccountId", mongo.findPolicyByAccountId);
export const upsertPolicyDocument = delegate("policyDocuments", "upsertPolicyDocument", mongo.upsertPolicyDocument);
export const updatePolicyDocument = delegate("policyDocuments", "updatePolicyDocument", mongo.updatePolicyDocument);
export const deletePolicyDocument = delegate("policyDocuments", "deletePolicyDocument", mongo.deletePolicyDocument);
