import crypto from "crypto";
import type { NextRequest } from "next/server";
import { timingSafeEqualString } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import Agent, { type AgentDocument } from "@/models/Agent";

export { timingSafeEqualString };

export function hashApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra || !token.startsWith("bhf_sk_")) {
    return null;
  }

  return token;
}

export function recordAgentKeyUse(agentId: string, apiKeyHash?: string | null) {
  const filter: Record<string, string> = { agentId };
  if (apiKeyHash) filter.apiKeyHash = apiKeyHash;

  Promise.resolve(Agent.updateOne(filter, { $set: { lastUsedAt: new Date() } })).catch((error: unknown) => {
    logger.warn("Failed to update agent key lastUsedAt.", {
      agentId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

export async function authenticateAgent(request: NextRequest, agentId: string) {
  const apiKey = getBearerToken(request);

  if (!apiKey) {
    return { agent: null, error: "Missing or invalid API key." };
  }

  const agent = await Agent.findOne({ agentId }).select("+apiKeyHash");

  if (!agent) {
    return { agent: null, error: "Unknown agent." };
  }

  const candidateHash = hashApiKey(apiKey);
  const isMatch = timingSafeEqualString(candidateHash, agent.apiKeyHash);

  if (!isMatch) {
    return { agent: null, error: "API key does not match this agent." };
  }

  recordAgentKeyUse(agent.agentId, candidateHash);

  return { agent: agent as AgentDocument, error: null };
}

export async function authenticateApiKey(request: NextRequest) {
  const apiKey = getBearerToken(request);

  if (!apiKey) {
    return { agent: null, error: "Missing or invalid API key." };
  }

  const apiKeyHash = hashApiKey(apiKey);
  const agent = await Agent.findOne({ apiKeyHash }).select("+apiKeyHash");

  if (!agent) {
    return { agent: null, error: "Missing or invalid API key." };
  }

  const isMatch = timingSafeEqualString(apiKeyHash, agent.apiKeyHash);
  if (!isMatch) {
    return { agent: null, error: "Missing or invalid API key." };
  }

  recordAgentKeyUse(agent.agentId, apiKeyHash);

  return { agent: agent as AgentDocument, error: null };
}
