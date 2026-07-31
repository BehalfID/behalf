import crypto from "crypto";
import type { NextRequest } from "next/server";
import { timingSafeEqualString } from "@/lib/crypto";
import { recordAuthFailure } from "@/lib/authEvents";
import { logger } from "@/lib/logger";
import {
  findAgentByAgentId,
  findAgentByApiKeyHash,
  touchAgentLastUsedAt,
  type AgentLean
} from "@/lib/repositories/agents";

export { timingSafeEqualString };

export function hashApiKey(apiKey: string) {
  // Agent API keys are high-entropy random tokens (bhf_sk_…), not user-chosen
  // passwords. SHA-256 is the intentional storage transform for lookup/compare;
  // a slow password KDF would not add meaningful resistance here and would break
  // existing stored apiKeyHash values.
  // codeql[js/insufficient-password-hash]
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

  Promise.resolve(touchAgentLastUsedAt(filter)).catch((error: unknown) => {
    logger.warn("Failed to update agent key lastUsedAt.", {
      agentId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

function apiKeyHint(apiKey: string | null): string {
  if (!apiKey || apiKey.length < 12) return "key:unknown";
  return `key:${apiKey.slice(0, 10)}…`;
}

export async function authenticateAgent(request: NextRequest, agentId: string) {
  const apiKey = getBearerToken(request);

  if (!apiKey) {
    await recordAuthFailure({
      request,
      surface: "api_key",
      reason: "invalid_api_key",
      identityHint: `agent:${agentId}`
    });
    return { agent: null, error: "Missing or invalid API key." };
  }

  const agent = await findAgentByAgentId(agentId, {}, "+apiKeyHash");

  if (!agent) {
    await recordAuthFailure({
      request,
      surface: "api_key",
      reason: "invalid_api_key",
      identityHint: apiKeyHint(apiKey)
    });
    return { agent: null, error: "Unknown agent." };
  }

  const candidateHash = hashApiKey(apiKey);
  const isMatch = timingSafeEqualString(candidateHash, agent.apiKeyHash);

  if (!isMatch) {
    await recordAuthFailure({
      request,
      surface: "api_key",
      reason: "invalid_api_key",
      identityHint: apiKeyHint(apiKey)
    });
    return { agent: null, error: "API key does not match this agent." };
  }

  recordAgentKeyUse(agent.agentId, candidateHash);

  return { agent: agent as AgentLean, error: null };
}

export async function authenticateApiKey(request: NextRequest) {
  const apiKey = getBearerToken(request);

  if (!apiKey) {
    await recordAuthFailure({
      request,
      surface: "api_key",
      reason: "invalid_api_key",
      identityHint: "key:missing"
    });
    return { agent: null, error: "Missing or invalid API key." };
  }

  const apiKeyHash = hashApiKey(apiKey);
  const agent = await findAgentByApiKeyHash(apiKeyHash);

  if (!agent) {
    await recordAuthFailure({
      request,
      surface: "api_key",
      reason: "invalid_api_key",
      identityHint: apiKeyHint(apiKey)
    });
    return { agent: null, error: "Missing or invalid API key." };
  }

  const isMatch = timingSafeEqualString(apiKeyHash, agent.apiKeyHash);
  if (!isMatch) {
    await recordAuthFailure({
      request,
      surface: "api_key",
      reason: "invalid_api_key",
      identityHint: apiKeyHint(apiKey)
    });
    return { agent: null, error: "API key does not match this agent." };
  }

  recordAgentKeyUse(agent.agentId, apiKeyHash);

  return { agent: agent as AgentLean, error: null };
}
