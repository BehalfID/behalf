import { type NextRequest } from "next/server";
import { jsonAppError } from "@/lib/appErrors";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";
import { getAgentSetupReadiness } from "@/lib/setupReadiness";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

/**
 * Server-computed setup readiness for one agent.
 *
 * The browser never tells us whether setup is finished — it asks. Everything in
 * the response is derived from rows BehalfID owns, scoped to the caller's
 * workspace, so a request for another workspace's agent returns 404 rather than
 * leaking its existence.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonAppError("Workspace account required.", 403, "WORKSPACE_ACCOUNT_REQUIRED");

  const { agentId } = await context.params;
  const readiness = await getAgentSetupReadiness(actor.accountId, agentId);
  if (!readiness) return jsonAppError("Agent not found.", 404, "NOT_FOUND");

  return noCacheJson({ readiness });
}
