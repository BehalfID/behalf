import { AUTHORITY_LEVELS } from "@/lib/authority";
import { createPublicId } from "@/lib/ids";
import type { CliAuthContext } from "@/lib/cliAuth";
import type { CliPauseInput } from "@/lib/cliSessionPolicy";
import ApprovalRequest, { APPROVAL_GRANT_TTL_MS } from "@/models/ApprovalRequest";

export const MANAGED_PROFILE_PAUSE_KIND = "managed_profile_pause" as const;
export const MANAGED_PROFILE_PAUSE_ACTION = "managed_profile_pause";
export const BEHALF_CLI_VENDOR = "behalf_cli";
/** Sentinel agent id for pause approvals — not a real agent. */
export const BEHALF_CLI_PAUSE_AGENT_ID = "behalf_cli_pause";
export const MANAGED_PROFILE_PAUSE_PERMISSION_ID = "managed_profile_pause";

export type PauseApprovalGrant = {
  approvalId: string;
  requestedDurationMinutes: number;
};

function normalizePauseScope(scope: CliPauseInput["scope"]): "current_repo" | "all" {
  return scope === "all" ? "all" : "current_repo";
}

function normalizePauseTool(tool: CliPauseInput["tool"]): string {
  return tool?.trim() || "claude";
}

function pauseRepoForScope(scope: "current_repo" | "all", repo: CliPauseInput["repo"]) {
  if (scope === "all") return null;
  return repo?.trim() || null;
}

function pauseApprovalTupleFilter(
  auth: CliAuthContext,
  input: CliPauseInput
): Record<string, unknown> {
  const scope = normalizePauseScope(input.scope);
  const tool = normalizePauseTool(input.tool);
  return {
    accountId: auth.accountId,
    developerUserId: auth.userId,
    kind: MANAGED_PROFILE_PAUSE_KIND,
    pauseTool: tool,
    pauseScope: scope,
    pauseRepo: pauseRepoForScope(scope, input.repo),
    pauseDeviceId: input.deviceId?.trim() || null,
  };
}

export function pauseApprovalMatchesRequest(
  approval: {
    developerUserId?: string | null;
    pauseTool?: string | null;
    pauseScope?: string | null;
    pauseRepo?: string | null;
    pauseDeviceId?: string | null;
    requestedDurationMinutes?: number | null;
    grantExpiresAt?: Date | null;
  },
  auth: CliAuthContext,
  input: CliPauseInput
): boolean {
  if (!auth.userId || approval.developerUserId !== auth.userId) return false;

  const scope = normalizePauseScope(input.scope);
  const tool = normalizePauseTool(input.tool);
  const repo = pauseRepoForScope(scope, input.repo);
  const deviceId = input.deviceId?.trim() || null;

  if (approval.pauseTool !== tool) return false;
  if (approval.pauseScope !== scope) return false;
  if ((approval.pauseRepo ?? null) !== repo) return false;
  if ((approval.pauseDeviceId ?? null) !== deviceId) return false;

  if (
    typeof approval.requestedDurationMinutes === "number" &&
    input.durationMinutes > approval.requestedDurationMinutes
  ) {
    return false;
  }

  if (approval.grantExpiresAt && approval.grantExpiresAt <= new Date()) {
    return false;
  }

  return true;
}

export async function findApprovedPauseApprovalGrant(
  auth: CliAuthContext,
  input: CliPauseInput
) {
  const now = new Date();
  const grant = await ApprovalRequest.findOne({
    ...pauseApprovalTupleFilter(auth, input),
    status: "approved",
    grantExpiresAt: { $gt: now },
  }).lean();

  if (!grant || !pauseApprovalMatchesRequest(grant, auth, input)) {
    return null;
  }

  return grant;
}

export async function consumeApprovedPauseApproval(
  auth: CliAuthContext,
  input: CliPauseInput
): Promise<PauseApprovalGrant | null> {
  const grant = await findApprovedPauseApprovalGrant(auth, input);
  if (!grant?.approvalId) return null;

  const now = new Date();
  const result = await ApprovalRequest.updateOne(
    { approvalId: grant.approvalId, status: "approved", grantExpiresAt: { $gt: now } },
    { $set: { status: "used", resolvedAt: now } }
  );

  if (result.matchedCount !== 1) return null;

  return {
    approvalId: grant.approvalId,
    requestedDurationMinutes: grant.requestedDurationMinutes as number,
  };
}

export async function createOrReusePendingPauseApproval(
  auth: CliAuthContext,
  input: CliPauseInput,
  contextReason: string
): Promise<string> {
  const tuple = pauseApprovalTupleFilter(auth, input);
  const scope = normalizePauseScope(input.scope);

  const pending = await ApprovalRequest.findOneAndUpdate(
    {
      ...tuple,
      status: "pending",
    },
    {
      $setOnInsert: {
        approvalId: createPublicId("apr"),
        requestId: createPublicId("req"),
        kind: MANAGED_PROFILE_PAUSE_KIND,
        action: MANAGED_PROFILE_PAUSE_ACTION,
        vendor: BEHALF_CLI_VENDOR,
        agentId: BEHALF_CLI_PAUSE_AGENT_ID,
        permissionId: MANAGED_PROFILE_PAUSE_PERMISSION_ID,
        requiredAuthorityLevel: AUTHORITY_LEVELS.ENGINEERING_LEAD,
        requestedDurationMinutes: input.durationMinutes,
        pauseReason: input.reason.trim(),
        contextReason,
        pauseBranch: input.branch?.trim() || null,
      },
    },
    { upsert: true, new: true }
  ).lean();

  return pending?.approvalId as string;
}

export function isManagedProfilePauseApproval(
  approval: Pick<ApprovalRequestDocumentLike, "kind" | "action">
): boolean {
  return (
    approval.kind === MANAGED_PROFILE_PAUSE_KIND ||
    approval.action === MANAGED_PROFILE_PAUSE_ACTION
  );
}

type ApprovalRequestDocumentLike = {
  kind?: string | null;
  action?: string | null;
};

export { APPROVAL_GRANT_TTL_MS };
