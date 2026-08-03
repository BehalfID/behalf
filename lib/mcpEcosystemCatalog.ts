/**
 * Curated catalog of common MCP servers and how BehalfID should govern them.
 * Used by the dashboard control plane and CLI wrap guidance.
 */

export type McpCatalogRisk = "low" | "medium" | "high" | "critical";

export type McpCatalogEntry = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Typical MCP server key names found in host configs. */
  aliases: string[];
  /** Example stdio install command (display only). */
  installHint: string;
  risk: McpCatalogRisk;
  /** Recommended permission action when wrapping. */
  recommendedAction: string;
  /** Resource pattern used by mcp-runtime: mcp:{server}:{tool} */
  resourcePattern: string;
  requiresApprovalByDefault: boolean;
  wrapSupported: boolean;
  /** Common dangerous tools to call out in UI. */
  dangerousTools: string[];
};

export const MCP_SERVER_CATALOG: McpCatalogEntry[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    tagline: "Read and write local files",
    description:
      "Exposes filesystem tools. Wrap so path writes and deletes verify against BehalfID before execution.",
    aliases: ["filesystem", "fs", "mcp-filesystem", "server-filesystem"],
    installHint: "npx -y @modelcontextprotocol/server-filesystem <path>",
    risk: "high",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:filesystem:*",
    requiresApprovalByDefault: true,
    wrapSupported: true,
    dangerousTools: ["write_file", "edit_file", "create_directory", "move_file"],
  },
  {
    id: "github",
    name: "GitHub",
    tagline: "Repos, PRs, issues, and Actions",
    description:
      "GitHub MCP servers can merge PRs, push, and change settings. Gate write tools with approval.",
    aliases: ["github", "gh", "mcp-github", "github-mcp"],
    installHint: "npx -y @modelcontextprotocol/server-github",
    risk: "critical",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:github:*",
    requiresApprovalByDefault: true,
    wrapSupported: true,
    dangerousTools: ["create_or_update_file", "push_files", "merge_pull_request", "create_branch"],
  },
  {
    id: "postgres",
    name: "Postgres",
    tagline: "Query and mutate databases",
    description:
      "Database MCP tools can run arbitrary SQL. Require approval for writes and block destructive statements.",
    aliases: ["postgres", "postgresql", "mcp-postgres", "server-postgres"],
    installHint: "npx -y @modelcontextprotocol/server-postgres <connection-string>",
    risk: "critical",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:postgres:*",
    requiresApprovalByDefault: true,
    wrapSupported: true,
    dangerousTools: ["query", "execute", "write_query"],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    tagline: "Web search",
    description: "Read-only search is usually low risk. Still wrap for audit logging of outbound queries.",
    aliases: ["brave-search", "brave", "mcp-brave-search"],
    installHint: "npx -y @modelcontextprotocol/server-brave-search",
    risk: "low",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:brave-search:*",
    requiresApprovalByDefault: false,
    wrapSupported: true,
    dangerousTools: [],
  },
  {
    id: "puppeteer",
    name: "Puppeteer / browser",
    tagline: "Browse and interact with the web",
    description:
      "Browser automation can submit forms and access authenticated sessions. Gate navigation and clicks.",
    aliases: ["puppeteer", "browser", "playwright", "mcp-puppeteer"],
    installHint: "npx -y @modelcontextprotocol/server-puppeteer",
    risk: "high",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:puppeteer:*",
    requiresApprovalByDefault: true,
    wrapSupported: true,
    dangerousTools: ["puppeteer_navigate", "puppeteer_click", "puppeteer_fill", "puppeteer_evaluate"],
  },
  {
    id: "slack",
    name: "Slack",
    tagline: "Read and post to Slack",
    description: "Messaging MCP tools can exfiltrate data or spam channels. Approve outbound posts.",
    aliases: ["slack", "mcp-slack"],
    installHint: "npx -y @modelcontextprotocol/server-slack",
    risk: "high",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:slack:*",
    requiresApprovalByDefault: true,
    wrapSupported: true,
    dangerousTools: ["post_message", "reply_to_thread", "add_reaction"],
  },
  {
    id: "memory",
    name: "Memory",
    tagline: "Long-term agent memory",
    description: "Memory stores can retain secrets. Audit writes; prefer allow-list of memory keys.",
    aliases: ["memory", "mcp-memory", "server-memory"],
    installHint: "npx -y @modelcontextprotocol/server-memory",
    risk: "medium",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:memory:*",
    requiresApprovalByDefault: false,
    wrapSupported: true,
    dangerousTools: ["create_entities", "add_observations", "delete_entities"],
  },
  {
    id: "shell",
    name: "Shell / exec",
    tagline: "Run arbitrary commands",
    description:
      "Any shell MCP server is critical risk. Always wrap and require approval for every tools/call.",
    aliases: ["shell", "bash", "exec", "terminal", "mcp-shell"],
    installHint: "custom stdio MCP that exposes shell tools",
    risk: "critical",
    recommendedAction: "mcp_tool",
    resourcePattern: "mcp:shell:*",
    requiresApprovalByDefault: true,
    wrapSupported: true,
    dangerousTools: ["run_command", "execute", "bash", "shell"],
  },
];

export function findCatalogEntry(serverName: string): McpCatalogEntry | null {
  const key = serverName.trim().toLowerCase();
  return (
    MCP_SERVER_CATALOG.find(
      (entry) => entry.id === key || entry.aliases.some((alias) => alias === key)
    ) ?? null
  );
}

export function buildWrapCommand(opts: {
  clients?: string;
  servers?: string[];
  verifyEndpoint?: string;
}): string {
  const parts = ["npx", "-y", "@behalfid/install", "--wrap"];
  if (opts.clients) parts.push("--clients", opts.clients);
  if (opts.servers?.length) parts.push("--wrap-servers", opts.servers.join(","));
  if (opts.verifyEndpoint) parts.push("--verify-endpoint", opts.verifyEndpoint);
  return parts.join(" ");
}
