import { NextResponse, type NextRequest } from "next/server";
import { parseAgentMetadata } from "@/lib/agents";
import { listAccountAgents } from "@/lib/accountAgents";
import { createDeveloperAgent, serializeAgent } from "@/lib/dashboardData";
import { requireDeveloperApi, requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { checkAgentLimit, quotaErrorDetails } from "@/lib/quota";
import { readJsonObject } from "@/lib/request";
import { serverErrorResponse } from "@/lib/apiErrors";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  // Repository faults (connection, pooler, schema drift, an unimplemented
  // backend adapter method) must not escape as an unhandled, bodiless 500 —
  // the client can only render "Request failed with 500" and the cause is lost.
  try {
    const agents = await listAccountAgents(actor);
    return noCacheJson({ agents: agents.map(serializeAgent) });
  } catch (error) {
    return serverErrorResponse("dashboard.agents.list", error, {
      userId: auth.user.userId,
      accountId: actor.accountId
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (workspace.error || !workspace.actor) return workspace.error;

  // The authorization result is the source of truth for the rest of the
  // request. `requireWorkspaceMutationActor` resolves
  // `activeAccountId ?? user.primaryAccountId`, so `auth.activeAccountId` may
  // legitimately be null for a caller who still has a valid workspace. Reading
  // it again after this point would evaluate quota without an account, create
  // an unscoped legacy-style row, and scope the event to nothing.
  const accountId = workspace.actor.accountId;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, [
    "name",
    "agentType",
    "provider",
    "externalAgentId",
    "externalAgentLabel",
    "connectionStatus",
    "description"
  ]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  if (!name) return jsonError("name is required.");

  const agentQuota = await checkAgentLimit(accountId);
  if (!agentQuota.allowed) {
    return jsonError(agentQuota.reason ?? "Agent limit reached.", 402, quotaErrorDetails(agentQuota));
  }

  const { metadata, error: metadataError } = parseAgentMetadata(body);
  if (metadataError || !metadata) return jsonError(metadataError ?? "Invalid agent metadata.");

  // The agent insert and the one-time key are the request's whole purpose, so
  // only that work may fail the request. Everything after the commit is a
  // notification and must not be able to withhold the credential.
  let result: Awaited<ReturnType<typeof createDeveloperAgent>>;
  try {
    result = await createDeveloperAgent(auth.user.userId, accountId, {
      name,
      ...metadata
    });
  } catch (error) {
    return serverErrorResponse("dashboard.agents.create", error, {
      userId: auth.user.userId,
      accountId
    });
  }

  // Past this point the agent and its API-key hash are committed and the
  // plaintext key exists exactly once, in `result`. `emitWebhookEvent` never
  // throws; a failed enqueue is logged and the credential is still returned.
  //
  // The account id comes from the authorized workspace actor. It used to be
  // `null`, which made `createWebhookEvent` fall back to the developer's user
  // id and violate the `webhook_events.account_id` foreign key on Postgres —
  // a 500 raised *after* the commit, which is exactly how a created agent
  // could exist with a key nobody would ever see.
  await emitWebhookEvent(
    createWebhookEvent(
      accountId,
      "agent.created",
      {
        agentId: result.agent.agentId,
        name,
        agentType: metadata.agentType,
        provider: metadata.provider
      },
      auth.user.userId
    )
  );
  return NextResponse.json(result, { status: 201 });
}
