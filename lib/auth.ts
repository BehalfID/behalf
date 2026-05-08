import crypto from "crypto";
import type { NextRequest } from "next/server";
import Agent, { type AgentDocument } from "@/models/Agent";

export function hashApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function timingSafeEqualString(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra || !token.startsWith("bhf_sk_")) {
    return null;
  }

  return token;
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

  return { agent: agent as AgentDocument, error: null };
}
