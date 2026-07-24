import { NextResponse, type NextRequest } from "next/server";
import { accountScopeFilter } from "@/lib/accountAccess";
import { createDeveloperAgent, serializeAgent } from "@/lib/dashboardData";
import { requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import {
  buildPermissionsFromSetup,
  buildTestDecision,
  mapAgentSurfaceToProvider,
  permissionBodyFromSetupPermission,
  sanitizeVerifyMetadata,
  validateFirstAgentSetupBody
} from "@/lib/firstAgentSetup";
import { createPermissionForAgent } from "@/lib/permissionMutations";
import { checkAgentLimit, quotaErrorDetails } from "@/lib/quota";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";

async function rollbackIncompleteFirstAgentSetup(input: {
  accountId: string;
  agentId: string;
  permissionIds: string[];
}) {
  if (input.permissionIds.length) {
    await Permission.deleteMany({
      ...accountScopeFilter(input.accountId),
      agentId: input.agentId,
      permissionId: { $in: input.permissionIds }
    });
  }

  await Agent.deleteOne({
    ...accountScopeFilter(input.accountId),
    agentId: input.agentId
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (workspace.error || !workspace.actor) return workspace.error;

  const accountId = workspace.actor.accountId;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "surface",
    "name",
    "description",
    "environment",
    "controlProfile",
    "approvalGates"
  ]);
  if (unknownError) return jsonError(unknownError);

  const validated = validateFirstAgentSetupBody(body);
  if (validated.error || !validated.input) return jsonError(validated.error ?? "Invalid setup payload.");

  const agentQuota = await checkAgentLimit(auth.activeAccountId);
  if (!agentQuota.allowed) {
    return jsonError(agentQuota.reason ?? "Agent limit reached.", 402, quotaErrorDetails(agentQuota));
  }

  const input = validated.input;
  const provider = mapAgentSurfaceToProvider(input.surface);
  const result = await createDeveloperAgent(auth.user.userId, auth.activeAccountId ?? undefined, {
    name: input.name,
    agentType: "native",
    provider,
    description: input.description ?? `${AGENT_SURFACE_DESCRIPTION[input.surface]} agent created via first-agent setup.`,
    connectionStatus: "manual"
  });

  const permissions = buildPermissionsFromSetup(input);
  const permissionIds: string[] = [];

  for (const permission of permissions) {
    const created = await createPermissionForAgent({
      actor: workspace.actor,
      userId: auth.user.userId,
      agentId: result.agent.agentId,
      body: permissionBodyFromSetupPermission(permission)
    });

    if ("error" in created && created.error) {
      await rollbackIncompleteFirstAgentSetup({
        accountId,
        agentId: result.agent.agentId,
        permissionIds
      });
      return jsonError("First agent setup failed while applying permissions.", 500, {
        code: "SETUP_FAILED"
      });
    }

    if ("permissionId" in created && created.permissionId) {
      permissionIds.push(created.permissionId);
    }
  }

  await emitWebhookEvent(
    createWebhookEvent(auth.activeAccountId ?? null, "agent.created", {
      agentId: result.agent.agentId,
      name: input.name,
      agentType: "native",
      provider,
      source: "first_agent_setup",
      surface: input.surface,
      controlProfile: input.controlProfile
    }, auth.user.userId)
  );

  const testDecision = buildTestDecision({
    approvalGates: input.approvalGates,
    agentName: input.name,
    defaultEnvironment: input.environment
  });

  return NextResponse.json(
    {
      agent: serializeAgent(result.agent),
      apiKey: result.apiKey,
      permissionIds,
      testDecision: {
        action: testDecision.action,
        resource: testDecision.resource,
        vendor: testDecision.vendor,
        environment: testDecision.environment,
        metadata: sanitizeVerifyMetadata(testDecision.metadata),
        expectsApproval: testDecision.expectsApproval,
        expectsDenied: testDecision.expectsDenied
      }
    },
    { status: 201 }
  );
}

const AGENT_SURFACE_DESCRIPTION: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  github_actions: "GitHub Actions",
  internal: "Internal",
  other: "Custom"
};
