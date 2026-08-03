import { NextResponse, type NextRequest } from "next/server";
import { backfillLegacyAgentsForActor } from "@/lib/accountAgents";
import { accountScopeFilter } from "@/lib/accountAccess";
import { jsonAppError } from "@/lib/appErrors";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { OllamaClientError, testOllamaConnection } from "@/lib/ollamaClient";
import { findOneAgent } from "@/lib/repositories/agents";
import { noCacheJson } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

/**
 * Developer convenience: probe tags + model for this agent's Ollama endpoint.
 * Not an enforcement path.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonAppError("Workspace account required.", 403, "WORKSPACE_ACCOUNT_REQUIRED");

  const { agentId } = await context.params;
  await backfillLegacyAgentsForActor(actor);

  const agent = await findOneAgent({ ...accountScopeFilter(actor.accountId), agentId });
  if (!agent) return jsonAppError("Agent not found.", 404, "NOT_FOUND");

  try {
    const result = await testOllamaConnection({
      ollamaBaseUrl: agent.ollamaBaseUrl,
      ollamaModel: agent.ollamaModel
    });
    return noCacheJson({
      ok: true,
      baseUrl: result.baseUrl,
      model: result.model,
      fromAgent: result.fromAgent,
      availableModels: result.availableModels,
      disclaimer:
        "Ollama connectivity is a developer convenience. Tool actions still require verify()/SDK/MCP gating."
    });
  } catch (err) {
    if (err instanceof OllamaClientError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          details: err.details,
          code: err.code,
          ...err.extra
        },
        { status: err.httpStatus }
      );
    }
    return jsonAppError("Ollama connection check failed.", 503, "OLLAMA_ERROR");
  }
}
