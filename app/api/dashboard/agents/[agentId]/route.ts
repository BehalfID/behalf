import { NextResponse, type NextRequest } from "next/server";
import { parseAgentMetadata } from "@/lib/agents";
import { backfillLegacyAgentsForActor } from "@/lib/accountAgents";
import { accountScopeFilter } from "@/lib/accountAccess";
import { getAccountAgentDetail } from "@/lib/accountDashboardData";
import { serializeAgent } from "@/lib/dashboardData";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId } = await context.params;
  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const detail = await getAccountAgentDetail(actor, agentId);
  if (!detail) return jsonError("Agent not found.", 404);
  return noCacheJson({
    ...detail,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const workspace = await requireWorkspaceMutationActor(auth.user);
  if (workspace.error) return workspace.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "name",
    "provider",
    "externalAgentId",
    "externalAgentLabel",
    "description",
    "connectionStatus",
    "guidelines"
  ]);
  if (unknownError) return jsonError(unknownError);

  const { agentId } = await context.params;
  const update: Record<string, string | undefined> = {};

  if (body.name !== undefined) {
    const name = readString(body.name);
    if (!name) return jsonError("name must be a non-empty string.");
    update.name = name;
  }

  const { metadata, error: metadataError } = parseAgentMetadata({ agentType: "connected", ...body });
  if (metadataError || !metadata) return jsonError(metadataError ?? "Invalid agent metadata.");

  if (body.provider !== undefined) update.provider = metadata.provider;
  if (body.externalAgentId !== undefined) update.externalAgentId = metadata.externalAgentId;
  if (body.externalAgentLabel !== undefined) update.externalAgentLabel = metadata.externalAgentLabel;
  if (body.description !== undefined) update.description = metadata.description;
  if (body.connectionStatus !== undefined) update.connectionStatus = metadata.connectionStatus;

  if (body.guidelines !== undefined) {
    if (!Array.isArray(body.guidelines)) return jsonError("guidelines must be an array of strings.");
    const items = body.guidelines as unknown[];
    if (items.length > 20) return jsonError("guidelines must have 20 items or fewer.");
    const parsed: string[] = [];
    for (const item of items) {
      if (typeof item !== "string") return jsonError("Each guideline must be a string.");
      const trimmed = item.trim();
      if (trimmed.length > 500) return jsonError("Each guideline must be 500 characters or fewer.");
      if (trimmed) parsed.push(trimmed);
    }
    (update as Record<string, unknown>).guidelines = parsed;
  }

  if (!Object.keys(update).length) {
    return jsonError("At least one editable agent field is required.");
  }

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  await backfillLegacyAgentsForActor(actor);

  const agent = await Agent.findOneAndUpdate(
    { ...accountScopeFilter(actor.accountId), agentId },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!agent) return jsonError("Agent not found.", 404);

  return NextResponse.json({ agent: serializeAgent(agent) });
}
