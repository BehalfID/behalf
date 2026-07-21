import { describe, expect, it } from "vitest";
import {
  isAlreadyWrapped,
  isWrappableServerEntry,
  restoreWrappedServers,
  wrapServerEntry,
  wrapServersInConfig,
} from "../../src/mcp/wrap.js";
import type { McpConfiguration } from "../../src/types/index.js";

describe("wrapServersInConfig", () => {
  it("rewrites stdio servers in place with downstream env and credentials", () => {
    const config: McpConfiguration = {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          env: { HOME: "/tmp" },
        },
        remote: { url: "https://example.com/mcp" },
      },
    };

    const result = wrapServersInConfig(config, "mcpServers-json", {
      version: "0.1.0",
      agentId: "agent_1",
      apiKey: "bhf_sk_test",
    });

    expect(result.wrapped).toHaveLength(1);
    expect(result.wrapped[0]?.serverName).toBe("filesystem");
    expect(result.skipped.some((s) => s.serverName === "remote")).toBe(true);

    const wrapped = result.config.mcpServers?.filesystem;
    expect(wrapped?.command).toBe("npx");
    expect(wrapped?.args).toEqual(["-y", "@behalfid/mcp-runtime@0.1.0"]);
    expect(wrapped?.env?.BEHALFID_AGENT_ID).toBe("agent_1");
    expect(wrapped?.env?.BEHALFID_API_KEY).toBe("bhf_sk_test");
    expect(wrapped?.env?.BEHALFID_DOWNSTREAM_COMMAND).toBe("npx");
    expect(wrapped?.env?.BEHALFID_DOWNSTREAM_ARGS).toBe(
      JSON.stringify(["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]),
    );
    expect(wrapped?.env?.BEHALFID_DOWNSTREAM_SERVER).toBe("filesystem");
    expect(JSON.parse(wrapped?.env?.BEHALFID_DOWNSTREAM_ENV ?? "{}")).toEqual({
      HOME: "/tmp",
    });
    expect(isAlreadyWrapped(wrapped!)).toBe(true);
  });

  it("restores originals on uninstall path", () => {
    const original = {
      command: "node",
      args: ["server.js"],
    };
    const config: McpConfiguration = {
      mcpServers: {
        custom: wrapServerEntry(original, {
          version: "1.0.0",
          agentId: "a",
          apiKey: "k",
          serverName: "custom",
        }),
      },
    };

    const restored = restoreWrappedServers(config, "mcpServers-json", [
      { serverName: "custom", original },
    ]);
    expect(restored.mcpServers?.custom).toEqual(original);
  });

  it("skips already wrapped and non-command entries", () => {
    expect(isWrappableServerEntry({ url: "https://x" })).toBe(false);
    expect(
      isAlreadyWrapped({
        command: "npx",
        env: { BEHALFID_DOWNSTREAM_COMMAND: "node" },
      }),
    ).toBe(true);
  });
});
