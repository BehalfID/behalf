import { describe, expect, it } from "vitest";
import {
  buildInventory,
  MCP_LAYERS,
  parseMcpServersMap,
  wrapGuidanceForInventory,
} from "../lib/mcpEcosystem";
import { findCatalogEntry, MCP_SERVER_CATALOG } from "../lib/mcpEcosystemCatalog";
import {
  classifyServerWrapStatus,
  isAlreadyWrapped,
  isWrappableServerEntry,
} from "../lib/mcpWrapDetect";
import { getPolicyTemplate, POLICY_TEMPLATES } from "../lib/policyTemplates";

describe("MCP wrap detect", () => {
  it("detects wrappable stdio servers", () => {
    expect(isWrappableServerEntry({ command: "npx", args: ["-y", "pkg"] })).toBe(true);
    expect(isWrappableServerEntry({ url: "https://example.com/mcp" })).toBe(false);
  });

  it("detects already-wrapped interceptor entries", () => {
    expect(
      isAlreadyWrapped({
        command: "npx",
        args: ["-y", "@behalfid/mcp-runtime@0.1.0"],
        env: { BEHALFID_DOWNSTREAM_COMMAND: "npx" },
      })
    ).toBe(true);
  });

  it("classifies behalfid as advisory", () => {
    expect(
      classifyServerWrapStatus("behalfid", { command: "behalf", args: ["mcp", "start"] })
    ).toBe("advisory-behalfid");
  });
});

describe("MCP inventory", () => {
  it("parses mcpServers and builds wrap counts", () => {
    const raw = {
      mcpServers: {
        behalfid: { command: "behalf", args: ["mcp", "start"] },
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
        remote: { url: "https://mcp.example.com" },
        github: {
          command: "npx",
          args: ["-y", "@behalfid/mcp-runtime@0.1.0"],
          env: { BEHALFID_DOWNSTREAM_COMMAND: "npx" },
        },
      },
    };

    expect(Object.keys(parseMcpServersMap(raw))).toHaveLength(4);
    const inventory = buildInventory(raw, ".mcp.json");
    expect(inventory.hasAdvisoryBehalfid).toBe(true);
    expect(inventory.wrappableCount).toBe(1);
    expect(inventory.wrappedCount).toBe(1);
    expect(inventory.urlOnlyCount).toBe(1);
    expect(inventory.servers.find((s) => s.name === "filesystem")?.catalog?.id).toBe("filesystem");
  });

  it("builds wrap guidance commands", () => {
    const inventory = buildInventory({
      mcpServers: {
        filesystem: { command: "npx", args: ["-y", "pkg"] },
      },
    });
    const guidance = wrapGuidanceForInventory(inventory, "https://behalfid.com");
    expect(guidance.serversToWrap).toEqual(["filesystem"]);
    expect(guidance.wrapSelectedCommand).toContain("--wrap");
    expect(guidance.wrapSelectedCommand).toContain("filesystem");
  });
});

describe("MCP catalog and layers", () => {
  it("exposes curated catalog entries", () => {
    expect(MCP_SERVER_CATALOG.length).toBeGreaterThanOrEqual(5);
    expect(findCatalogEntry("github")?.risk).toBe("critical");
    expect(MCP_LAYERS.map((l) => l.id)).toEqual(["advisory", "interceptor", "hooks"]);
  });
});

describe("MCP policy templates", () => {
  it("includes mcp_tool templates", () => {
    const gated = getPolicyTemplate("mcp_tools_gated");
    expect(gated?.category).toBe("mcp");
    expect(gated?.permissions[0]?.action).toBe("mcp_tool");
    expect(POLICY_TEMPLATES.some((t) => t.id === "mcp_github_safe")).toBe(true);
  });
});
