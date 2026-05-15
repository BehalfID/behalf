import { isRecord, readString } from "@/lib/validation";

export const AGENT_TYPES = ["native", "connected"] as const;
export const AGENT_PROVIDERS = [
  "custom",
  "ollie",
  "chatgpt",
  "claude",
  "gemini",
  "zapier",
  "make",
  "langchain",
  "openai",
  "other"
] as const;
export const CONNECTION_STATUSES = ["manual", "connected", "disconnected"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const PROVIDER_LABELS: Record<AgentProvider, string> = {
  custom: "Custom",
  ollie: "Ollie",
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  zapier: "Zapier",
  make: "Make",
  langchain: "LangChain",
  openai: "OpenAI",
  other: "Other"
};

function readEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  const stringValue = readString(value);
  return allowed.includes(stringValue as T[number]) ? stringValue as T[number] : fallback;
}

function validateEnum<T extends readonly string[]>(value: unknown, allowed: T, field: string) {
  if (value === undefined) return null;
  const stringValue = readString(value);
  return allowed.includes(stringValue as T[number]) ? null : `${field} must be one of: ${allowed.join(", ")}.`;
}

function readOptionalString(value: unknown, field: string, maxLength = 500) {
  if (value === undefined) {
    return { value: undefined as string | undefined, error: null as string | null };
  }

  const stringValue = readString(value);
  if (!stringValue) {
    return { value: undefined, error: null };
  }

  if (stringValue.length > maxLength) {
    return { value: undefined, error: `${field} must be ${maxLength} characters or fewer.` };
  }

  return { value: stringValue, error: null };
}

export function normalizeAgentMetadata(agent: {
  agentType?: string | null;
  provider?: string | null;
  connectionStatus?: string | null;
  externalAgentId?: string | null;
  externalAgentLabel?: string | null;
  description?: string | null;
  guidelines?: string[] | null;
}) {
  return {
    agentType: readEnum(agent.agentType, AGENT_TYPES, "native"),
    provider: readEnum(agent.provider, AGENT_PROVIDERS, "custom"),
    connectionStatus: readEnum(agent.connectionStatus, CONNECTION_STATUSES, "manual"),
    externalAgentId: agent.externalAgentId ?? null,
    externalAgentLabel: agent.externalAgentLabel ?? null,
    description: agent.description ?? null,
    guidelines: agent.guidelines?.length ? [...agent.guidelines] : []
  };
}

export function parseAgentMetadata(body: unknown) {
  if (!isRecord(body)) {
    return { metadata: null, error: "Request body must be a JSON object." };
  }

  const agentTypeError = validateEnum(body.agentType, AGENT_TYPES, "agentType");
  if (agentTypeError) return { metadata: null, error: agentTypeError };
  const providerError = validateEnum(body.provider, AGENT_PROVIDERS, "provider");
  if (providerError) return { metadata: null, error: providerError };
  const connectionStatusError = validateEnum(body.connectionStatus, CONNECTION_STATUSES, "connectionStatus");
  if (connectionStatusError) return { metadata: null, error: connectionStatusError };

  const agentType = readEnum(body.agentType, AGENT_TYPES, "native");
  const provider = readEnum(body.provider, AGENT_PROVIDERS, agentType === "connected" ? "other" : "custom");
  const connectionStatus = readEnum(body.connectionStatus, CONNECTION_STATUSES, agentType === "connected" ? "manual" : "manual");
  const externalAgentId = readOptionalString(body.externalAgentId, "externalAgentId", 180);
  if (externalAgentId.error) return { metadata: null, error: externalAgentId.error };
  const externalAgentLabel = readOptionalString(body.externalAgentLabel, "externalAgentLabel", 180);
  if (externalAgentLabel.error) return { metadata: null, error: externalAgentLabel.error };
  const description = readOptionalString(body.description, "description", 800);
  if (description.error) return { metadata: null, error: description.error };

  return {
    metadata: {
      agentType,
      provider,
      connectionStatus,
      externalAgentId: externalAgentId.value,
      externalAgentLabel: externalAgentLabel.value,
      description: description.value
    },
    error: null
  };
}
