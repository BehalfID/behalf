import { describe, expect, it } from "vitest";
import { ConfigError, loadInterceptorConfig } from "../src/config.js";

describe("loadInterceptorConfig", () => {
  it("requires an API key and agent id", () => {
    expect(() => loadInterceptorConfig({})).toThrow(ConfigError);
    expect(() =>
      loadInterceptorConfig({ BEHALFID_API_KEY: "k" }),
    ).toThrow(/BEHALFID_AGENT_ID/);
    expect(() =>
      loadInterceptorConfig({ BEHALFID_AGENT_ID: "a" }),
    ).toThrow(/BEHALFID_API_KEY/);
  });

  it("loads defaults and downstream wiring", () => {
    const config = loadInterceptorConfig({
      BEHALFID_API_KEY: "bhf_sk_test",
      BEHALFID_AGENT_ID: "agent_1",
      BEHALFID_DOWNSTREAM_COMMAND: "npx",
      BEHALFID_DOWNSTREAM_ARGS: '["-y","pkg"]',
      BEHALFID_DOWNSTREAM_SERVER: "filesystem",
      BEHALFID_DOWNSTREAM_ENV: '{"HOME":"/tmp"}',
    });

    expect(config.baseUrl).toBe("https://behalfid.com");
    expect(config.verifyUrl).toBe("https://behalfid.com/api/verify");
    expect(config.verifyTimeoutMs).toBe(5_000);
    expect(config.downstream).toEqual({
      serverName: "filesystem",
      command: "npx",
      args: ["-y", "pkg"],
      env: { HOME: "/tmp" },
    });
  });

  it("rejects invalid downstream args JSON", () => {
    expect(() =>
      loadInterceptorConfig({
        BEHALFID_API_KEY: "k",
        BEHALFID_AGENT_ID: "a",
        BEHALFID_DOWNSTREAM_COMMAND: "npx",
        BEHALFID_DOWNSTREAM_ARGS: "{not-an-array}",
      }),
    ).toThrow(/BEHALFID_DOWNSTREAM_ARGS/);
  });

  it("accepts legacy BEHALF_* credential aliases", () => {
    const config = loadInterceptorConfig({
      BEHALF_API_KEY: "legacy_key",
      BEHALF_AGENT_ID: "legacy_agent",
    });
    expect(config.apiKey).toBe("legacy_key");
    expect(config.agentId).toBe("legacy_agent");
    expect(config.downstream).toBeUndefined();
  });
});
