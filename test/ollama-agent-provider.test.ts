import { describe, expect, it } from "vitest";
import { AGENT_PROVIDERS, PROVIDER_LABELS, parseAgentMetadata } from "@/lib/agents";

describe("ollama agent provider", () => {
  it("includes ollama in the shared provider enum", () => {
    expect(AGENT_PROVIDERS).toContain("ollama");
    expect(PROVIDER_LABELS.ollama).toBe("Ollama");
  });

  it("accepts provider ollama when parsing agent metadata", () => {
    const result = parseAgentMetadata({
      agentType: "connected",
      provider: "ollama",
      connectionStatus: "manual",
      externalAgentLabel: "llama3.1:8b",
      description: "Local research agent"
    });

    expect(result.error).toBeNull();
    expect(result.metadata).toMatchObject({
      agentType: "connected",
      provider: "ollama",
      connectionStatus: "manual",
      externalAgentLabel: "llama3.1:8b",
      description: "Local research agent"
    });
  });

  it("rejects unknown providers", () => {
    const result = parseAgentMetadata({
      provider: "not-a-provider"
    });

    expect(result.metadata).toBeNull();
    expect(result.error).toContain("provider must be one of");
    expect(result.error).toContain("ollama");
  });
});
