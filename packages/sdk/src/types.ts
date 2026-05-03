export type BehalfIDConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type VerifyInput = {
  agentId: string;
  action: string;
  amount?: number;
  vendor?: string;
  metadata?: Record<string, unknown>;
};

export type RiskLevel = "low" | "medium" | "high";

export type VerifyResult = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: RiskLevel;
};

export type CreateAgentResult = {
  agentId: string;
  apiKey: string;
  agentType?: AgentType;
  provider?: AgentProvider;
};

export type AgentType = "native" | "connected";

export type AgentProvider =
  | "custom"
  | "ollie"
  | "chatgpt"
  | "claude"
  | "zapier"
  | "make"
  | "langchain"
  | "openai"
  | "other";

export type CreateAgentInput = {
  name: string;
  agentType?: AgentType;
  provider?: AgentProvider;
  externalAgentId?: string;
  externalAgentLabel?: string;
  description?: string;
  connectionStatus?: "manual" | "connected" | "disconnected";
};

export type PermissionConstraints = {
  maxAmount?: number;
  allowedVendors?: string[];
  expiresAt?: string;
};

export type CreatePermissionInput = {
  agentId: string;
  action: string;
  description?: string;
  constraints?: PermissionConstraints;
};

export type CreatePermissionResult = {
  permissionId: string;
  status: "active" | "revoked" | string;
};

export type RotateKeyResult = {
  agentId: string;
  apiKey: string;
};

export type VerificationLog = {
  requestId: string;
  agentId: string;
  permissionId: string | null;
  action: string;
  amount?: number;
  vendor?: string;
  allowed: boolean;
  reason: string;
  risk: RiskLevel;
  createdAt: string;
};

export type { VerifyWebhookSignatureInput } from "./webhooks.js";
