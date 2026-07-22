import Agent, { type AgentDocument } from "@/models/Agent";
import { lazyModelMethod } from "@/lib/repositories/mongoModelAdapter";

export type AgentLean = AgentDocument;
export type AgentRepository = typeof agentRepository;

export type AgentCountScope =
  | { accountId: string }
  | { developerUserId: string };

export async function countAgentsByAccountId(accountId: string) {
  return Agent.countDocuments({ accountId });
}

export async function countAgentsByScope(scope: AgentCountScope) {
  return Agent.countDocuments(scope);
}

export async function createAgent(input: Partial<AgentDocument>) {
  return Agent.create(input);
}

export function findAgentByAgentId(
  agentId: string,
  scope: Record<string, unknown> = {},
  select?: string
) {
  const query = Agent.findOne({ ...scope, agentId });
  if (select) query.select(select);
  return query;
}

export function findAgentByApiKeyHash(apiKeyHash: string, select = "+apiKeyHash") {
  return Agent.findOne({ apiKeyHash }).select(select);
}

export function listAgents(
  filter: Record<string, unknown>,
  options: { select?: string; sort?: Record<string, 1 | -1> } = {}
) {
  const query = Agent.find(filter);
  if (options.select) query.select(options.select);
  if (options.sort) query.sort(options.sort);
  return query;
}

export async function updateAgent(
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return Agent.updateOne(filter, update);
}

export async function updateAgents(
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return Agent.updateMany(filter, update);
}

export async function deleteAgents(filter: Record<string, unknown>) {
  return Agent.deleteMany(filter);
}

export async function rotateAgentKey(
  filter: Record<string, unknown>,
  apiKeyHash: string,
  keyRotatedAt = new Date()
) {
  return Agent.updateOne(filter, { $set: { apiKeyHash, keyRotatedAt } });
}

export async function touchAgentLastUsedAt(filter: Record<string, unknown>, lastUsedAt = new Date()) {
  return Agent.updateOne(filter, { $set: { lastUsedAt } });
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findAgents(filter: Record<string, unknown> = {}) {
  return Agent.find(filter);
}

export function findOneAgent(filter: Record<string, unknown>) {
  return Agent.findOne(filter);
}

export function findOneAndUpdateAgent(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return Agent.findOneAndUpdate(filter, update, options);
}

export function deleteAgent(filter: Record<string, unknown>) {
  return Agent.deleteOne(filter);
}

export function countAgents(filter: Record<string, unknown> = {}) {
  return Agent.countDocuments(filter);
}

export const agentRepository = {
  create: createAgent,
  findByAgentId: findAgentByAgentId,
  findByApiKeyHash: findAgentByApiKeyHash,
  find: findAgents,
  findOne: findOneAgent,
  findOneAndUpdate: findOneAndUpdateAgent,
  updateOne: updateAgent,
  updateMany: updateAgents,
  deleteOne: deleteAgent,
  deleteMany: deleteAgents,
  countDocuments: countAgents,
  rotateKey: rotateAgentKey,
  touchLastUsedAt: touchAgentLastUsedAt,
  countByAccountId: countAgentsByAccountId,
  countByScope: countAgentsByScope
};

export const findOne = lazyModelMethod(() => Agent, "findOne");
export const find = lazyModelMethod(() => Agent, "find");
export const create = lazyModelMethod(() => Agent, "create");
export const updateOne = lazyModelMethod(() => Agent, "updateOne");
export const updateMany = lazyModelMethod(() => Agent, "updateMany");
export const countDocuments = lazyModelMethod(() => Agent, "countDocuments");
