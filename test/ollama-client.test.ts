import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLocalhostOllamaUrl,
  modelIsAvailable,
  parseOllamaRuntimeFields,
  resolveOllamaEndpoint,
  OllamaClientError,
  proxyOllamaChat,
  testOllamaConnection
} from "@/lib/ollamaClient";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ollamaClient resolve + helpers", () => {
  it("prefers agent fields over env", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://env-ollama:11434");
    vi.stubEnv("OLLAMA_MODEL", "env-model");
    const endpoint = resolveOllamaEndpoint({
      ollamaBaseUrl: "http://agent-ollama:11434",
      ollamaModel: "agent-model"
    });
    expect(endpoint.baseUrl).toBe("http://agent-ollama:11434");
    expect(endpoint.model).toBe("agent-model");
    expect(endpoint.fromAgent).toBe(true);
  });

  it("falls back to env when agent fields are blank", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://env-ollama:11434");
    vi.stubEnv("OLLAMA_MODEL", "env-model");
    const endpoint = resolveOllamaEndpoint({ ollamaBaseUrl: "", ollamaModel: null });
    expect(endpoint.baseUrl).toBe("http://env-ollama:11434");
    expect(endpoint.model).toBe("env-model");
    expect(endpoint.fromAgent).toBe(false);
  });

  it("detects localhost URLs", () => {
    expect(isLocalhostOllamaUrl("http://localhost:11434")).toBe(true);
    expect(isLocalhostOllamaUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLocalhostOllamaUrl("https://ollama.example.com")).toBe(false);
  });

  it("matches model names with optional tag prefix", () => {
    expect(modelIsAvailable("llama3.1", ["llama3.1:8b", "qwen2.5:1.5b"])).toBe(true);
    expect(modelIsAvailable("llama3.1:8b", ["llama3.1:8b"])).toBe(true);
    expect(modelIsAvailable("missing", ["llama3.1:8b"])).toBe(false);
  });
});

describe("parseOllamaRuntimeFields", () => {
  it("accepts and normalizes URL/model", async () => {
    const result = await parseOllamaRuntimeFields({
      ollamaBaseUrl: "http://localhost:11434/",
      ollamaModel: " llama3.1:8b "
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.update.ollamaBaseUrl).toBe("http://localhost:11434");
      expect(result.update.ollamaModel).toBe("llama3.1:8b");
    }
  });

  it("clears fields with empty string", async () => {
    const result = await parseOllamaRuntimeFields({ ollamaBaseUrl: "", ollamaModel: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.update.ollamaBaseUrl).toBeNull();
      expect(result.update.ollamaModel).toBeNull();
    }
  });

  it("rejects invalid URLs", async () => {
    const result = await parseOllamaRuntimeFields({ ollamaBaseUrl: "not-a-url" });
    expect(result.ok).toBe(false);
  });
});

describe("testOllamaConnection", () => {
  it("reports model availability from /api/tags", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "llama3.1:8b");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: "llama3.1:8b" }, { name: "qwen2.5:1.5b" }] })
      })
    );

    const result = await testOllamaConnection();
    expect(result.ok).toBe(true);
    expect(result.model).toBe("llama3.1:8b");
    expect(result.availableModels).toContain("qwen2.5:1.5b");
  });

  it("throws MODEL_NOT_FOUND when model is missing", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "missing-model");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: "llama3.1:8b" }] })
      })
    );

    await expect(testOllamaConnection()).rejects.toMatchObject({
      code: "MODEL_NOT_FOUND"
    } satisfies Partial<OllamaClientError>);
  });
});

describe("proxyOllamaChat", () => {
  it("forwards non-streaming chat and returns message", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "llama3.1:8b");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: "llama3.1:8b",
        message: { role: "assistant", content: "hi" }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxyOllamaChat(undefined, {
      messages: [{ role: "user", content: "hello" }]
    });

    expect(result.message.content).toBe("hi");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: false, model: "llama3.1:8b" });
  });

  it("rejects streaming requests", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "llama3.1:8b");
    await expect(
      proxyOllamaChat(undefined, {
        messages: [{ role: "user", content: "hello" }],
        stream: true
      })
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
