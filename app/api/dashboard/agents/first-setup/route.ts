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
import { serverErrorResponse } from "@/lib/apiErrors";
import { logger } from "@/lib/logger";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import { deleteAgent } from "@/lib/repositories/agents";
import { deletePermissions } from "@/lib/repositories/permissions";

async function rollbackIncompleteFirstAgentSetup(input: {
  accountId: string;
  agentId: string;
  permissionIds: string[];
}) {
  if (input.permissionIds.length) {
    await deletePermissions({
      ...accountScopeFilter(input.accountId),
      agentId: input.agentId,
      permissionId: { $in: input.permissionIds }
    });
  }

  await deleteAgent({
    ...accountScopeFilter(input.accountId),
    agentId: input.agentId
  });
}

/**
 * Roll back a partial setup without ever masking the failure that caused it.
 *
 * Both deletes are scoped by `accountScopeFilter`, so a rollback can only ever
 * touch the actor's own workspace. If the rollback itself fails the caller
 * still reports the original error; the leftover rows are logged with a stable
 * scope so they can be reconciled rather than disappearing silently.
 */
async function rollbackQuietly(input: {
  accountId: string;
  agentId: string;
  permissionIds: string[];
}) {
  try {
    await rollbackIncompleteFirstAgentSetup(input);
  } catch (error) {
    logger.error("dashboard.agents.first_setup.rollback_failed", {
      accountId: input.accountId,
      agentId: input.agentId,
      permissionIds: input.permissionIds.length,
      error: (error as { message?: string })?.message
    });
  }
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
    "protectionPolicy",
    // Accepted for browser sessions opened before the protection step shipped.
    "controlProfile",
    "approvalGates"
  ]);
  if (unknownError) return jsonError(unknownError);

  const validated = validateFirstAgentSetupBody(body);
  if (validated.error || !validated.input) return jsonError(validated.error ?? "Invalid setup payload.");

  const agentQuota = await checkAgentLimit(accountId);
  if (!agentQuota.allowed) {
    return jsonError(agentQuota.reason ?? "Agent limit reached.", 402, quotaErrorDetails(agentQuota));
  }

  const input = validated.input;
  const provider = mapAgentSurfaceToProvider(input.surface);

  // Stage 1 — the agent and its one-time key. Nothing is committed yet, so a
  // failure here is safe to report as a plain 500 with no cleanup owed.
  let result: Awaited<ReturnType<typeof createDeveloperAgent>>;
  try {
    result = await createDeveloperAgent(auth.user.userId, accountId, {
      name: input.name,
      agentType: "native",
      provider,
      description:
        input.description ??
        `${AGENT_SURFACE_DESCRIPTION[input.surface]} agent created via first-agent setup.`,
      connectionStatus: "manual"
    });
  } catch (error) {
    return serverErrorResponse("dashboard.agents.first_setup", error, {
      userId: auth.user.userId,
      accountId,
      stage: "create_agent"
    });
  }

  // Stage 2 — permissions. A partial setup must never be presented as
  // successful, so any failure rolls back the permissions created so far *and*
  // the agent, discarding the unusable key with them.
  const permissions = buildPermissionsFromSetup(input);
  const permissionIds: string[] = [];

  for (const permission of permissions) {
    let created: Awaited<ReturnType<typeof createPermissionForAgent>>;
    try {
      created = await createPermissionForAgent({
        actor: workspace.actor,
        userId: auth.user.userId,
        agentId: result.agent.agentId,
        body: permissionBodyFromSetupPermission(permission)
      });
    } catch (error) {
      // A throw is as fatal as a returned error — roll back either way, and
      // never let a rollback failure mask the original cause.
      await rollbackQuietly({ accountId, agentId: result.agent.agentId, permissionIds });
      return serverErrorResponse("dashboard.agents.first_setup", error, {
        userId: auth.user.userId,
        accountId,
        agentId: result.agent.agentId,
        stage: "create_permission"
      });
    }

    if ("error" in created && created.error) {
      await rollbackQuietly({ accountId, agentId: result.agent.agentId, permissionIds });
      return jsonError("First agent setup failed while applying permissions.", 500, {
        code: "SETUP_FAILED"
      });
    }

    if ("permissionId" in created && created.permissionId) {
      permissionIds.push(created.permissionId);
    }
  }

  // Stage 3 — notification only. The agent, its key hash and every permission
  // are committed; `emitWebhookEvent` never throws, so the one-time key is
  // returned even if the enqueue fails.
  await emitWebhookEvent(
    createWebhookEvent(accountId, "agent.created", {
      agentId: result.agent.agentId,
      name: input.name,
      agentType: "native",
      provider,
      source: "first_agent_setup",
      surface: input.surface,
      protectionPreset: input.protectionPolicy.preset
    }, auth.user.userId)
  );

  const testDecision = buildTestDecision({
    protectionPolicy: input.protectionPolicy,
    agentName: input.name,
    defaultEnvironment: input.environment
  });

  return NextResponse.json(
    {
      agent: serializeAgent(result.agent),
      apiKey: result.apiKey,
      permissionIds,
      testDecision: {
        controlId: testDecision.controlId,
        controlLabel: testDecision.controlLabel,
        action: testDecision.action,
        resource: testDecision.resource,
        vendor: testDecision.vendor,
        ...(typeof testDecision.amount === "number" ? { amount: testDecision.amount } : {}),
        environment: testDecision.environment,
        metadata: sanitizeVerifyMetadata(testDecision.metadata),
        expectsApproval: testDecision.expectsApproval,
        expectsDenied: testDecision.expectsDenied,
        expectsAllowed: testDecision.expectsAllowed
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
