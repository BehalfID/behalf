import type { McpInvocation, VerifyRequest } from "./types.js";

/**
 * Single adapter: McpInvocation → BehalfID VerifyRequest.
 * Performs mapping only — no authorization decisions.
 */
export function mapInvocationToVerifyRequest(
  invocation: McpInvocation,
  defaultAgentId?: string
): VerifyRequest {
  const agentId = invocation.agentId ?? defaultAgentId;
  if (!agentId) {
    throw new Error("McpInvocation is missing agentId and no default agentId is configured");
  }

  const action = `mcp_tool`;
  const resource = `mcp:${invocation.server}:${invocation.tool}`;
  const args = asRecord(invocation.arguments);

  return {
    agentId,
    action,
    resource,
    vendor: invocation.server,
    metadata: {
      provider: invocation.provider,
      sessionId: invocation.sessionId,
      userId: invocation.userId,
      workspaceId: invocation.workspaceId,
      server: invocation.server,
      tool: invocation.tool,
      requestId: invocation.requestId,
      ...(invocation.metadata?.model
        ? { model: invocation.metadata.model }
        : {}),
      ...(invocation.metadata?.clientVersion
        ? { clientVersion: invocation.metadata.clientVersion }
        : {}),
    },
    policyContext: {
      source: `mcp-runtime:${invocation.provider}`,
      toolName: `${invocation.server}/${invocation.tool}`,
      cwd: invocation.metadata?.cwd,
      home: invocation.metadata?.home,
      toolInput: {
        filePath: stringField(args, "path", "filePath", "file_path"),
        command: stringField(args, "command", "cmd"),
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringField(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}
