import {
  AuditEngine,
  normalizeMcpConfig,
  type McpAuditReport,
} from "@behalfid/mcp-audit";
import {
  classifyServerWrapStatus,
  type McpServerEntryLike,
  type ServerWrapStatus,
} from "@/lib/mcpWrapDetect";
import {
  MCP_SERVER_CATALOG,
  buildWrapCommand,
  findCatalogEntry,
  type McpCatalogEntry,
} from "@/lib/mcpEcosystemCatalog";

export type McpLayer = "advisory" | "interceptor" | "hooks";

export const MCP_LAYERS: Array<{
  id: McpLayer;
  title: string;
  summary: string;
  command: string;
}> = [
  {
    id: "advisory",
    title: "Advisory MCP",
    summary:
      "Registers BehalfID as an MCP server with verify_action and get_permissions. The model must call them; other tools are not intercepted.",
    command: "behalf mcp init",
  },
  {
    id: "interceptor",
    title: "Hard enforcement (wrap)",
    summary:
      "Fronts other stdio MCP servers with @behalfid/mcp-runtime so every tools/call is verified before execution.",
    command: "npx -y @behalfid/install --wrap",
  },
  {
    id: "hooks",
    title: "Action-time hooks",
    summary:
      "Claude PreToolUse, Codex hooks, and Cursor beforeShellExecution gate local shell/file actions MCP cannot see.",
    command: "behalf claude   # or: behalf codex / behalf run cursor",
  },
];

export type InventoryServer = {
  name: string;
  wrapStatus: ServerWrapStatus;
  command?: string;
  url?: string;
  catalog: McpCatalogEntry | null;
  downstreamCommand?: string | null;
};

export type McpInventory = {
  sourcePath: string;
  servers: InventoryServer[];
  wrappedCount: number;
  wrappableCount: number;
  urlOnlyCount: number;
  hasAdvisoryBehalfid: boolean;
};

export function parseMcpServersMap(raw: unknown): Record<string, McpServerEntryLike> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const root = raw as Record<string, unknown>;
  const map =
    (root.mcpServers as Record<string, unknown> | undefined) ??
    (root.servers as Record<string, unknown> | undefined) ??
    {};
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const out: Record<string, McpServerEntryLike> = {};
  for (const [name, entry] of Object.entries(map)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      out[name] = entry as McpServerEntryLike;
    }
  }
  return out;
}

export function buildInventory(raw: unknown, sourcePath = ".mcp.json"): McpInventory {
  const map = parseMcpServersMap(raw);
  const servers: InventoryServer[] = Object.entries(map).map(([name, entry]) => {
    const wrapStatus = classifyServerWrapStatus(name, entry);
    return {
      name,
      wrapStatus,
      command: typeof entry.command === "string" ? entry.command : undefined,
      url: typeof entry.url === "string" ? entry.url : undefined,
      catalog: findCatalogEntry(name),
      downstreamCommand:
        wrapStatus === "wrapped"
          ? typeof (entry.env as Record<string, unknown> | undefined)?.BEHALFID_DOWNSTREAM_COMMAND ===
            "string"
            ? String((entry.env as Record<string, unknown>).BEHALFID_DOWNSTREAM_COMMAND)
            : null
          : null,
    };
  });

  return {
    sourcePath,
    servers,
    wrappedCount: servers.filter((s) => s.wrapStatus === "wrapped").length,
    wrappableCount: servers.filter((s) => s.wrapStatus === "wrappable").length,
    urlOnlyCount: servers.filter((s) => s.wrapStatus === "url-only").length,
    hasAdvisoryBehalfid: servers.some((s) => s.wrapStatus === "advisory-behalfid"),
  };
}

export async function auditMcpConfig(
  raw: unknown,
  options?: { sourcePath?: string; trustedServers?: string[] }
): Promise<{ report: McpAuditReport; inventory: McpInventory }> {
  const sourcePath = options?.sourcePath ?? ".mcp.json";
  const trustedServers = options?.trustedServers ?? ["behalfid", "behalf"];
  const configuration = normalizeMcpConfig(raw, { sourcePath, trustedServers });
  const report = await new AuditEngine().audit(configuration);
  const inventory = buildInventory(raw, sourcePath);
  return { report, inventory };
}

export function wrapGuidanceForInventory(inventory: McpInventory, baseUrl?: string) {
  const toWrap = inventory.servers
    .filter((s) => s.wrapStatus === "wrappable")
    .map((s) => s.name);
  return {
    wrapAllCommand: buildWrapCommand({
      verifyEndpoint: baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/v1/verify` : undefined,
    }),
    wrapSelectedCommand: toWrap.length
      ? buildWrapCommand({
          servers: toWrap,
          verifyEndpoint: baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/v1/verify` : undefined,
        })
      : null,
    serversToWrap: toWrap,
    catalog: MCP_SERVER_CATALOG,
  };
}

export type McpEcosystemOverview = {
  layers: typeof MCP_LAYERS;
  catalog: McpCatalogEntry[];
  snapshot: {
    accountId: string;
    sourcePath: string | null;
    securityScore: number | null;
    inventory: McpInventory | null;
    reportSummary: McpAuditReport["summary"] | null;
    findings: McpAuditReport["findings"] | null;
    updatedAt: string | null;
    syncSource: "cli" | "dashboard" | null;
  } | null;
  wrapDefaults: {
    installCommand: string;
    auditCommand: string;
    statusCommand: string;
  };
};

export function emptyOverview(): Omit<McpEcosystemOverview, "snapshot"> {
  return {
    layers: MCP_LAYERS,
    catalog: MCP_SERVER_CATALOG,
    wrapDefaults: {
      installCommand: buildWrapCommand({}),
      auditCommand: "behalf mcp audit",
      statusCommand: "behalf mcp status --json",
    },
  };
}
