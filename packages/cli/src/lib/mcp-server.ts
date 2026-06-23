import { createInterface } from "node:readline";
import { readCachedDetail, fetchAndCacheDetail } from "./passport-cache.js";
import { apiRequest } from "./client.js";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function respond(id: string | number | null, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function respondError(id: string | number | null, code: number, message: string): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

export const MCP_TOOLS = [
  {
    name: "verify_action",
    description:
      "Verify whether this agent is permitted to perform an action BEFORE executing it. " +
      "You MUST call verify_action before tool execution for risky, external, state-changing, permissioned, or sensitive actions. " +
      "If the response contains `\"allowed\": false`, do not execute the action. " +
      "If verification is unavailable, fails, or returns an error, fail closed and do not execute. " +
      "If the reason says approval is required, pause for user approval; do not execute automatically.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            'The action to verify. Common values: "purchase", "access_data", "browse_web", "schedule", "create_content", "send_message". Use the most specific value that describes what you are about to do.',
        },
        vendor: {
          type: "string",
          description:
            'The vendor, service, or domain being accessed (e.g. "amazon.com", "gmail.com", "google-calendar"). Omit for generic actions.',
        },
        amount: {
          type: "number",
          description: "Transaction amount in dollars. Only required for purchase-type actions.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_permissions",
    description:
      "Inspect the current active permissions for this agent: allowed actions, blocked actions, approval-required actions, resources, and constraints. " +
      "This is context only. It does not replace verify_action. Before executing a risky or permissioned action, call verify_action. " +
      "Denial means do not execute; unavailable verification means fail closed; approval-required means pause for user approval.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function callMcpTool(config: {
  agentId: string;
  apiKey: string;
  baseUrl: string;
}, toolName: string | undefined, args: Record<string, unknown>) {
  if (toolName === "verify_action") {
    const body: Record<string, unknown> = {
      agentId: config.agentId,
      action: args.action,
    };
    if (args.vendor) body.vendor = args.vendor;
    if (args.amount !== undefined) body.amount = args.amount;

    const result = await apiRequest<Record<string, unknown>>("/api/verify", {
      method: "POST",
      body,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      skipAuth: false,
    });

    // When approval is required, return a structured instructional block instead of
    // raw JSON so the agent understands exactly what to tell the user and what to do next.
    if (result.approvalRequired === true) {
      const dashboardBase = config.baseUrl.replace(/\/$/, "");
      const approvalUrl = `${dashboardBase}/dashboard/approvals`;
      const approvalId = typeof result.approvalId === "string" ? result.approvalId : null;
      const requestId = typeof result.requestId === "string" ? result.requestId : null;
      const action = typeof args.action === "string" ? args.action : "unknown";
      const vendor = typeof args.vendor === "string" ? args.vendor : null;

      const lines = [
        "APPROVAL REQUIRED — do not execute this action.",
        "",
        `Action:     ${action}${vendor ? ` on ${vendor}` : ""}`,
        `Request ID: ${requestId ?? "(unavailable)"}`,
        ...(approvalId ? [`Approval ID: ${approvalId}`] : []),
        "",
        "A human must approve this request before the action can proceed.",
        `Approve at: ${approvalUrl}`,
        "",
        "Instructions:",
        "1. Tell the user: \"I need approval to run this action. Please visit the BehalfID Approvals",
        `   dashboard at ${approvalUrl} and approve the pending request${approvalId ? ` (${approvalId})` : ""}.\"`,
        "2. Do not execute the action.",
        "3. After the user confirms they have approved, call verify_action again with the same arguments.",
        "4. If verify_action returns allowed: true, proceed. If it still returns approvalRequired, wait.",
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  if (toolName === "get_permissions") {
    let detail = readCachedDetail(config.agentId);
    if (!detail) {
      try {
        detail = await fetchAndCacheDetail(config.agentId, config.baseUrl, false, config.apiKey);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Permissions cache is empty. Run `behalf mcp init` to populate it.",
              }),
            },
          ],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
    };
  }

  return null;
}

export async function startMcpServer(config: {
  agentId: string;
  apiKey: string;
  baseUrl: string;
}) {
  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", async (line) => {
    const raw = line.trim();
    if (!raw) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(raw) as JsonRpcRequest;
    } catch {
      return;
    }

    // Notifications have no id — no response needed
    if (req.id === undefined || req.id === null) {
      return;
    }

    try {
      switch (req.method) {
        case "initialize":
          respond(req.id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "behalfid", version: "0.1.0" },
          });
          break;

        case "ping":
          respond(req.id, {});
          break;

        case "tools/list":
          respond(req.id, { tools: MCP_TOOLS });
          break;

        case "tools/call": {
          const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined;
          const toolName = params?.name;
          const args = params?.arguments ?? {};

          const result = await callMcpTool(config, toolName, args);
          if (result) {
            respond(req.id, result);
          } else {
            respondError(req.id, -32601, `Unknown tool: ${toolName ?? "(none)"}`);
          }
          break;
        }

        default:
          respondError(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err) {
      respondError(req.id, -32603, err instanceof Error ? err.message : "Internal error");
    }
  });

  // Keep alive until stdin closes
  process.stdin.resume();
}
