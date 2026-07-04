import crypto from "crypto";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import Account from "@/models/Account";
import CliAuditLog from "@/models/CliAuditLog";
import CliPauseLease from "@/models/CliPauseLease";
import type { CliAuthContext } from "@/lib/cliAuth";

export type CliSessionPolicyMode = "unmanaged" | "managed" | "required";

export type CliSessionPolicyInput = {
  tool: string;
  cwd?: string | null;
  gitRemote?: string | null;
  branch?: string | null;
  repoRoot?: string | null;
  deviceId?: string | null;
  cliVersion?: string | null;
  workspaceId?: string | null;
};

export type CliSessionPolicyResult = {
  mode: CliSessionPolicyMode;
  profileId: string | null;
  profileName: string | null;
  sessionId: string;
  workspaceId: string | null;
  reason: string;
  expiresAt: string | null;
  cacheTtlSeconds: number;
};

const VALID_TOOLS = new Set(["claude", "codex", "cursor"]);
const DEFAULT_CACHE_TTL = 300;

function devPolicyMode(): CliSessionPolicyMode | null {
  const mode = process.env["BEHALF" + "ID_CLI_POLICY_MODE"]?.trim().toLowerCase();
  if (mode === "unmanaged" || mode === "managed" || mode === "required") return mode;
  return null;
}

/** Exported for tests and diagnostics. */
export function readDevCliPolicyMode(): CliSessionPolicyMode | null {
  return devPolicyMode();
}

function isWithinWorkHours(now = new Date()): boolean {
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

async function findActivePauseLease(auth: CliAuthContext, input: CliSessionPolicyInput) {
  const query: Record<string, unknown> = {
    granted: true,
    expiresAt: { $gt: new Date() },
  };
  if (auth.userId) query.userId = auth.userId;
  else if (auth.accountId) query.accountId = auth.accountId;
  else if (input.deviceId) query.deviceId = input.deviceId;
  else return null;

  const leases = await CliPauseLease.find(query).sort({ expiresAt: -1 }).limit(5).lean();
  for (const lease of leases) {
    if (lease.scope === "all") return lease;
    if (lease.repo && input.repoRoot && lease.repo === input.repoRoot) return lease;
  }
  return leases[0] ?? null;
}

export function validateSessionPolicyInput(input: CliSessionPolicyInput): string | null {
  if (!VALID_TOOLS.has(input.tool)) return "tool must be one of: claude, codex, cursor.";
  if (input.deviceId && input.deviceId.length > 80) return "deviceId is too long.";
  if (input.branch && input.branch.length > 120) return "branch is too long.";
  if (input.cliVersion && input.cliVersion.length > 40) return "cliVersion is too long.";
  return null;
}

export async function resolveCliSessionPolicy(
  auth: CliAuthContext,
  input: CliSessionPolicyInput
): Promise<CliSessionPolicyResult> {
  await connectToDatabase();

  const sessionId = createPublicId("sess");
  const devMode = devPolicyMode();
  if (devMode) {
    return {
      mode: devMode,
      profileId: devMode === "unmanaged" ? null : "pprf_dev",
      profileName: devMode === "unmanaged" ? null : "Development policy",
      sessionId,
      workspaceId: auth.accountId,
      reason: `Development override CLI policy mode=${devMode}.`,
      expiresAt: null,
      cacheTtlSeconds: 30,
    };
  }

  const activePause = await findActivePauseLease(auth, input);
  if (activePause) {
    return {
      mode: "unmanaged",
      profileId: null,
      profileName: null,
      sessionId,
      workspaceId: auth.accountId,
      reason: `Active pause lease: ${activePause.reason}`,
      expiresAt: activePause.expiresAt?.toISOString() ?? null,
      cacheTtlSeconds: 60,
    };
  }

  if (!auth.accountId) {
    return {
      mode: "unmanaged",
      profileId: null,
      profileName: null,
      sessionId,
      workspaceId: null,
      reason: "No matching managed profile.",
      expiresAt: null,
      cacheTtlSeconds: DEFAULT_CACHE_TTL,
    };
  }

  const account = await Account.findOne({ accountId: auth.accountId }).lean();
  if (!account) {
    return {
      mode: "unmanaged",
      profileId: null,
      profileName: null,
      sessionId,
      workspaceId: auth.accountId,
      reason: "Workspace not found.",
      expiresAt: null,
      cacheTtlSeconds: DEFAULT_CACHE_TTL,
    };
  }

  const requiredAccounts = (process.env["BEHALF" + "ID_CLI_REQUIRED_ACCOUNT_IDS"] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (requiredAccounts.includes(account.accountId)) {
    return {
      mode: "required",
      profileId: "pprf_required",
      profileName: "Required enforcement",
      sessionId,
      workspaceId: account.accountId,
      reason: "Workspace policy requires managed enforcement for this account.",
      expiresAt: null,
      cacheTtlSeconds: DEFAULT_CACHE_TTL,
    };
  }

  const controlAreas = account.onboarding?.controlAreas ?? [];
  const primaryGoal = account.onboarding?.primaryGoal;
  const inWorkHours = controlAreas.includes("work_hours") && isWithinWorkHours();

  if (inWorkHours && primaryGoal === "block") {
    return {
      mode: "required",
      profileId: "pprf_work_hours",
      profileName: "Work hours — strict",
      sessionId,
      workspaceId: account.accountId,
      reason: "Workspace work-hours policy requires managed enforcement during business hours.",
      expiresAt: null,
      cacheTtlSeconds: DEFAULT_CACHE_TTL,
    };
  }

  if (
    account.accountType === "business" &&
    (controlAreas.length > 0 || (account.onboarding?.agentTools?.length ?? 0) > 0)
  ) {
    return {
      mode: "managed",
      profileId: "pprf_managed",
      profileName: "Workspace managed",
      sessionId,
      workspaceId: account.accountId,
      reason: "Workspace has managed agent controls configured.",
      expiresAt: null,
      cacheTtlSeconds: DEFAULT_CACHE_TTL,
    };
  }

  if (inWorkHours && controlAreas.length > 0) {
    return {
      mode: "managed",
      profileId: "pprf_work_hours",
      profileName: "Work hours — observe",
      sessionId,
      workspaceId: account.accountId,
      reason: "Workspace work-hours policy applies during business hours.",
      expiresAt: null,
      cacheTtlSeconds: DEFAULT_CACHE_TTL,
    };
  }

  return {
    mode: "unmanaged",
    profileId: null,
    profileName: null,
    sessionId,
    workspaceId: account.accountId,
    reason: "No matching managed profile.",
    expiresAt: null,
    cacheTtlSeconds: DEFAULT_CACHE_TTL,
  };
}

export async function recordCliAuditEvent(input: {
  auth: CliAuthContext;
  eventType: "cli_session_policy" | "cli_pause_grant" | "cli_pause_deny";
  tool?: string | null;
  repo?: string | null;
  branch?: string | null;
  mode?: CliSessionPolicyMode;
  granted?: boolean;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  await CliAuditLog.create({
    auditId: createPublicId("clia"),
    accountId: input.auth.accountId,
    userId: input.auth.userId,
    eventType: input.eventType,
    tool: input.tool ?? undefined,
    repo: input.repo ?? undefined,
    branch: input.branch ?? undefined,
    mode: input.mode,
    granted: input.granted,
    reason: input.reason,
    metadata: input.metadata,
  }).catch(() => {
    // audit should not block CLI operations
  });
}

export type CliPauseInput = {
  durationMinutes: number;
  reason: string;
  scope?: "current_repo" | "all";
  tool?: string | null;
  repo?: string | null;
  branch?: string | null;
  deviceId?: string | null;
};

export type CliPauseResult = {
  granted: boolean;
  leaseId?: string;
  mode: CliSessionPolicyMode;
  expiresAt?: string;
  reason: string;
};

export const MAX_PAUSE_MINUTES = 240;

export function validatePauseInput(input: CliPauseInput): string | null {
  if (!input.reason?.trim()) return "reason is required.";
  if (input.reason.trim().length > 500) return "reason is too long.";
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    return "durationMinutes must be a positive number.";
  }
  if (input.durationMinutes > MAX_PAUSE_MINUTES) {
    return `durationMinutes cannot exceed ${MAX_PAUSE_MINUTES} minutes (4 hours).`;
  }
  if (input.scope && input.scope !== "current_repo" && input.scope !== "all") {
    return "scope must be current_repo or all.";
  }
  if (input.tool && !VALID_TOOLS.has(input.tool)) {
    return "tool must be one of: claude, codex, cursor.";
  }
  return null;
}

export async function requestCliPauseLease(
  auth: CliAuthContext,
  input: CliPauseInput
): Promise<CliPauseResult> {
  await connectToDatabase();

  const validationError = validatePauseInput(input);
  if (validationError) {
    return { granted: false, mode: "unmanaged", reason: validationError };
  }

  const policy = await resolveCliSessionPolicy(auth, {
    tool: input.tool ?? "claude",
    repoRoot: input.repo ?? null,
    branch: input.branch ?? null,
    deviceId: input.deviceId ?? null,
  });

  if (policy.mode === "required") {
    const deniedReason =
      "Pause denied: workspace policy requires enforcement for the current context.";
    await recordCliAuditEvent({
      auth,
      eventType: "cli_pause_deny",
      tool: input.tool,
      repo: input.repo,
      branch: input.branch,
      mode: policy.mode,
      granted: false,
      reason: deniedReason,
      metadata: { requestedMinutes: input.durationMinutes, userReason: input.reason.trim() },
    });
    return { granted: false, mode: policy.mode, reason: deniedReason };
  }

  const expiresAt = new Date(Date.now() + input.durationMinutes * 60 * 1000);
  const leaseId = createPublicId("pause");

  await CliPauseLease.create({
    leaseId,
    accountId: auth.accountId,
    userId: auth.userId,
    deviceId: input.deviceId ?? undefined,
    tool: input.tool ?? undefined,
    repo: input.repo ?? undefined,
    branch: input.branch ?? undefined,
    scope: input.scope ?? "current_repo",
    reason: input.reason.trim(),
    granted: true,
    mode: "unmanaged",
    expiresAt,
  });

  const grantedReason =
    input.scope === "all"
      ? "Pause granted for all repos."
      : "Pause granted for current repo.";

  await recordCliAuditEvent({
    auth,
    eventType: "cli_pause_grant",
    tool: input.tool,
    repo: input.repo,
    branch: input.branch,
    mode: "unmanaged",
    granted: true,
    reason: grantedReason,
    metadata: { leaseId, expiresAt: expiresAt.toISOString(), userReason: input.reason.trim() },
  });

  return {
    granted: true,
    leaseId,
    mode: "unmanaged",
    expiresAt: expiresAt.toISOString(),
    reason: grantedReason,
  };
}

export function hashCliRepo(value: string | null | undefined): string | null {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
