import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  detectMcpConfigFormat,
  parseMcpConfigContents,
  refineMcpConfigFormat,
  serializeMcpConfig,
  wrapServersInConfig,
} from "../src/mcp/index.js";
import { getServerMap } from "../src/mcp/servers.js";
import type { McpConfigFormat } from "../src/mcp/format.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "client-configs",
);

type FixtureCase = {
  client: string;
  fileName: string;
  pathHint: string;
  expectedFormat: McpConfigFormat;
  /** Keys that must survive a register / wrap cycle. */
  preservedServerNames: string[];
  /** Non-stdio / non-wrappable servers that must remain untouched. */
  nonWrappableServerNames?: string[];
  /** Top-level keys outside the server map that must survive. */
  preservedTopLevelKeys?: string[];
};

const FIXTURES: FixtureCase[] = [
  {
    client: "cursor",
    fileName: "cursor.mcp.json",
    pathHint: "/home/demo/.cursor/mcp.json",
    expectedFormat: "mcpServers-json",
    preservedServerNames: ["filesystem", "github", "remote-docs"],
    nonWrappableServerNames: ["remote-docs"],
    preservedTopLevelKeys: ["preferences"],
  },
  {
    client: "claude-desktop",
    fileName: "claude-desktop.mcp.json",
    pathHint: "/home/demo/.config/Claude/claude_desktop_config.json",
    expectedFormat: "mcpServers-json",
    preservedServerNames: ["filesystem", "memory"],
  },
  {
    client: "claude-code",
    fileName: "claude-code.mcp.json",
    pathHint: "/home/demo/.claude.json",
    expectedFormat: "mcpServers-json",
    preservedServerNames: ["project-tools", "http-bridge"],
    nonWrappableServerNames: ["http-bridge"],
  },
  {
    client: "vscode",
    fileName: "vscode.mcp.json",
    pathHint: "/home/demo/project/.vscode/mcp.json",
    expectedFormat: "vscode-json",
    preservedServerNames: ["github", "filesystem", "remote"],
    nonWrappableServerNames: ["remote"],
    preservedTopLevelKeys: ["inputs"],
  },
  {
    client: "windsurf",
    fileName: "windsurf.mcp.json",
    pathHint: "/home/demo/.codeium/windsurf/mcp_config.json",
    expectedFormat: "mcpServers-json",
    preservedServerNames: ["filesystem", "search"],
  },
  {
    client: "codex",
    fileName: "codex.config.toml",
    pathHint: "/home/demo/.codex/config.toml",
    expectedFormat: "codex-toml",
    preservedServerNames: ["filesystem", "shell"],
    preservedTopLevelKeys: ["model", "model_reasoning_effort"],
  },
];

describe("client configuration fixtures", () => {
  for (const fixture of FIXTURES) {
    describe(fixture.client, () => {
      it(`detects ${fixture.expectedFormat} from the real client path`, () => {
        expect(detectMcpConfigFormat(fixture.pathHint)).toBe(fixture.expectedFormat);
      });

      it("parses the fixture and preserves every documented server", async () => {
        const raw = await readFile(join(fixturesDir, fixture.fileName), "utf8");
        const parsed = parseMcpConfigContents(raw, fixture.expectedFormat);
        const format = refineMcpConfigFormat(fixture.expectedFormat, parsed);
        expect(format).toBe(fixture.expectedFormat);

        const servers = getServerMap(parsed, format);
        for (const name of fixture.preservedServerNames) {
          expect(servers[name], `missing server ${name}`).toBeDefined();
        }
        for (const key of fixture.preservedTopLevelKeys ?? []) {
          expect(parsed[key], `missing top-level key ${key}`).toBeDefined();
        }
      });

      it("round-trips serialize → parse without dropping servers", async () => {
        const raw = await readFile(join(fixturesDir, fixture.fileName), "utf8");
        const parsed = parseMcpConfigContents(raw, fixture.expectedFormat);
        const serialized = serializeMcpConfig(parsed, fixture.expectedFormat);
        const again = parseMcpConfigContents(serialized, fixture.expectedFormat);

        const before = getServerMap(parsed, fixture.expectedFormat);
        const after = getServerMap(again, fixture.expectedFormat);
        expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());

        for (const key of fixture.preservedTopLevelKeys ?? []) {
          expect(again[key]).toEqual(parsed[key]);
        }
      });

      it("wraps stdio servers without corrupting non-wrappable entries", async () => {
        const raw = await readFile(join(fixturesDir, fixture.fileName), "utf8");
        const parsed = parseMcpConfigContents(raw, fixture.expectedFormat);
        const before = structuredClone(parsed);

        const result = wrapServersInConfig(parsed, fixture.expectedFormat, {
          version: "0.1.0",
          agentId: "agent_fixture",
          apiKey: "bhf_sk_fixture",
        });

        const afterServers = getServerMap(result.config, fixture.expectedFormat);
        const beforeServers = getServerMap(before, fixture.expectedFormat);

        // Every original server key remains.
        expect(Object.keys(afterServers).sort()).toEqual(
          Object.keys(beforeServers).sort(),
        );

        for (const name of fixture.nonWrappableServerNames ?? []) {
          expect(afterServers[name]).toEqual(beforeServers[name]);
          expect(
            result.skipped.some((entry) => entry.serverName === name),
          ).toBe(true);
        }

        for (const change of result.wrapped) {
          const wrapped = afterServers[change.serverName];
          expect(wrapped?.env?.BEHALFID_DOWNSTREAM_COMMAND).toBe(
            change.original.command,
          );
          expect(wrapped?.env?.BEHALFID_AGENT_ID).toBe("agent_fixture");
          expect(wrapped?.env?.BEHALFID_API_KEY).toBe("bhf_sk_fixture");
          // Original args are preserved as JSON, not dropped.
          if (change.original.args) {
            expect(JSON.parse(wrapped?.env?.BEHALFID_DOWNSTREAM_ARGS ?? "[]")).toEqual(
              change.original.args,
            );
          }
        }

        for (const key of fixture.preservedTopLevelKeys ?? []) {
          expect(result.config[key]).toEqual(before[key]);
        }
      });
    });
  }
});
