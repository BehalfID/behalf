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

const TOOLS = [
  {
    name: "verify_action",
    description:
      "Verify whether this agent is permitted to perform an action BEFORE executing it. " +
      "You MUST call this before any action that touches an external service. " +
      "If the response contains `\"allowed\": false`, do NOT proceed — explain the reason to the user instead.",
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
      "Get the current active permissions for this agent — what actions are allowed, on which resources, and under what constraints.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

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
          respond(req.id, { tools: TOOLS });
          break;

        case "tools/call": {
          const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined;
          const toolName = params?.name;
          const args = params?.arguments ?? {};

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

            respond(req.id, {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            });
          } else if (toolName === "get_permissions") {
            let detail = readCachedDetail(config.agentId);
            if (!detail) {
              try {
                detail = await fetchAndCacheDetail(config.agentId, config.baseUrl);
              } catch {
                respond(req.id, {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        error: "Permissions cache is empty. Run `behalf mcp init` to populate it.",
                      }),
                    },
                  ],
                  isError: true,
                });
                break;
              }
            }

            respond(req.id, {
              content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
            });
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
