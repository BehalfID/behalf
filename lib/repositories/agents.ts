/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/agents";
import { delegate } from "@/lib/repositories/delegate";

export type {
  AgentLean,
  AgentRepository,
  AgentCountScope,
} from "@/lib/repositories/mongo/agents";

export {
  agentRepository,
  findOne,
  find,
  create,
  updateOne,
  updateMany,
  countDocuments,
} from "@/lib/repositories/mongo/agents";

export const countAgentsByAccountId = delegate("agents", "countAgentsByAccountId", mongo.countAgentsByAccountId);
export const countAgentsByScope = delegate("agents", "countAgentsByScope", mongo.countAgentsByScope);
export const createAgent = delegate("agents", "createAgent", mongo.createAgent);
export const findAgentByAgentId = delegate("agents", "findAgentByAgentId", mongo.findAgentByAgentId);
export const findAgentByApiKeyHash = delegate("agents", "findAgentByApiKeyHash", mongo.findAgentByApiKeyHash);
export const listAgents = delegate("agents", "listAgents", mongo.listAgents);
export const updateAgent = delegate("agents", "updateAgent", mongo.updateAgent);
export const updateAgents = delegate("agents", "updateAgents", mongo.updateAgents);
export const deleteAgents = delegate("agents", "deleteAgents", mongo.deleteAgents);
export const rotateAgentKey = delegate("agents", "rotateAgentKey", mongo.rotateAgentKey);
export const touchAgentLastUsedAt = delegate("agents", "touchAgentLastUsedAt", mongo.touchAgentLastUsedAt);
export const findAgents = delegate("agents", "findAgents", mongo.findAgents);
export const findOneAgent = delegate("agents", "findOneAgent", mongo.findOneAgent);
export const findOneAndUpdateAgent = delegate("agents", "findOneAndUpdateAgent", mongo.findOneAndUpdateAgent);
export const deleteAgent = delegate("agents", "deleteAgent", mongo.deleteAgent);
export const countAgents = delegate("agents", "countAgents", mongo.countAgents);
