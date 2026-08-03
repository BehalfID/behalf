import { NextResponse, type NextRequest } from "next/server";
import { backfillLegacyAgentsForActor } from "@/lib/accountAgents";
import { accountScopeFilter } from "@/lib/accountAccess";
import { jsonAppError } from "@/lib/appErrors";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { OllamaClientError, proxyOllamaChat } from "@/lib/ollamaClient";
import { findOneAgent } from "@/lib/repositories/agents";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

/**
 * Developer convenience chat proxy to the agent's (or env) Ollama endpoint.
 * Does NOT enforce tool permissions — callers must still verify before acting.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (workspace.error) return workspace.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["messages", "model", "tools", "stream"]);
  if (unknownError) return jsonError(unknownError);

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonAppError("Workspace account required.", 403, "WORKSPACE_ACCOUNT_REQUIRED");

  const { agentId } = await context.params;
  await backfillLegacyAgentsForActor(actor);

  const agent = await findOneAgent({ ...accountScopeFilter(actor.accountId), agentId });
  if (!agent) return jsonAppError("Agent not found.", 404, "NOT_FOUND");

  if (!Array.isArray(body.messages)) {
    return jsonError("messages must be an array.");
  }

  const messages = body.messages.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.role !== "string" || typeof record.content !== "string") return null;
    return { role: record.role, content: record.content };
  });

  if (messages.some((m) => m === null)) {
    return jsonError("Each message must include string role and content.");
  }

  try {
    const result = await proxyOllamaChat(
      { ollamaBaseUrl: agent.ollamaBaseUrl, ollamaModel: agent.ollamaModel },
      {
        messages: messages as Array<{ role: string; content: string }>,
        model: typeof body.model === "string" ? body.model : undefined,
        tools: body.tools,
        stream: body.stream === true
      }
    );

    return noCacheJson({
      message: result.message,
      model: result.model,
      disclaimer:
        "This chat proxy does not enforce permissions. Gate tool calls with verify() or @behalfid/sdk/adapters/ollama before execution.",
      workspaceAuthority: serializeWorkspaceAuthority(actor)
    });
  } catch (err) {
    if (err instanceof OllamaClientError) {
      return NextResponse.json(
        {
          error: err.message,
          details: err.details,
          code: err.code,
          ...err.extra
        },
        { status: err.httpStatus }
      );
    }
    return jsonError("Ollama chat proxy failed.", 503);
  }
}
