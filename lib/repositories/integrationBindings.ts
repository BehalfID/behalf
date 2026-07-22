/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/integrationBindings";
import { delegate } from "@/lib/repositories/delegate";

export type {
  IntegrationBindingLean,
  CollaborationMessageRefLean,
  CreateSlackBindingInput,
} from "@/lib/repositories/mongo/integrationBindings";

export const listIntegrationBindings = delegate("integrationBindings", "listIntegrationBindings", mongo.listIntegrationBindings);
export const findIntegrationBinding = delegate("integrationBindings", "findIntegrationBinding", mongo.findIntegrationBinding);
export const findSlackBindingsWithSecrets = delegate("integrationBindings", "findSlackBindingsWithSecrets", mongo.findSlackBindingsWithSecrets);
export const findSlackBindingByTeamWithSecrets = delegate("integrationBindings", "findSlackBindingByTeamWithSecrets", mongo.findSlackBindingByTeamWithSecrets);
export const createSlackBinding = delegate("integrationBindings", "createSlackBinding", mongo.createSlackBinding);
export const upsertIdentityMapping = delegate("integrationBindings", "upsertIdentityMapping", mongo.upsertIdentityMapping);
export const disableIntegrationBinding = delegate("integrationBindings", "disableIntegrationBinding", mongo.disableIntegrationBinding);
export const findMessageRefByApproval = delegate("integrationBindings", "findMessageRefByApproval", mongo.findMessageRefByApproval);
export const upsertMessageRef = delegate("integrationBindings", "upsertMessageRef", mongo.upsertMessageRef);
export const resolveUserIdFromBinding = delegate("integrationBindings", "resolveUserIdFromBinding", mongo.resolveUserIdFromBinding);
