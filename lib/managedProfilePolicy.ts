import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import type { CliSessionPolicyMode } from "@/lib/cliSessionPolicy";
import ManagedProfilePolicy from "@/models/ManagedProfilePolicy";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";

export type ManagedProfilePolicyMode = CliSessionPolicyMode;

export type ManagedProfileWorkHours = {
  enabled: boolean;
  days: number[];
  start: string;
  end: string;
};

export type ManagedProfileProtectedRepo = {
  repoHash: string;
  label?: string;
  mode: ManagedProfilePolicyMode;
  enabled: boolean;
};

export type ManagedProfilePausePolicy = {
  enabled: boolean;
  reasonRequired: boolean;
  maxDurationMinutes: number;
  allowAllRepos: boolean;
  requireApprovalForRequiredMode: boolean;
};

export type ManagedProfileToolModes = {
  claude?: ManagedProfilePolicyMode;
  codex?: ManagedProfilePolicyMode;
  cursor?: ManagedProfilePolicyMode;
};

export type EffectiveManagedProfilePolicy = {
  policyId: string | null;
  accountId: string;
  timezone: string;
  enabled: boolean;
  workHours: ManagedProfileWorkHours;
  duringHoursMode: ManagedProfilePolicyMode;
  outsideHoursMode: ManagedProfilePolicyMode;
  defaultMode: ManagedProfilePolicyMode;
  toolModes: ManagedProfileToolModes;
  protectedRepos: ManagedProfileProtectedRepo[];
  pausePolicy: ManagedProfilePausePolicy;
  createdAt?: string;
  updatedAt?: string;
};

export const VALID_POLICY_MODES = ["unmanaged", "managed", "required"] as const;
export const VALID_MANAGED_TOOLS = ["claude", "codex", "cursor"] as const;
export const MAX_PAUSE_DURATION_MINUTES = 240;
export const PROTECTED_REPO_HASH_PATTERN = /^[a-f0-9]{16}$|^[a-f0-9]{64}$/;

export function isValidProtectedRepoHash(value: string): boolean {
  return PROTECTED_REPO_HASH_PATTERN.test(value);
}

export const PUT_ALLOWED_FIELDS = [
  "enabled",
  "timezone",
  "workHours",
  "duringHoursMode",
  "outsideHoursMode",
  "defaultMode",
  "toolModes",
  "protectedRepos",
  "pausePolicy",
] as const;

const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function defaultManagedProfilePolicy(accountId: string): EffectiveManagedProfilePolicy {
  return {
    policyId: null,
    accountId,
    timezone: "UTC",
    enabled: false,
    workHours: {
      enabled: false,
      days: [1, 2, 3, 4, 5],
      start: "09:00",
      end: "17:00",
    },
    duringHoursMode: "managed",
    outsideHoursMode: "unmanaged",
    defaultMode: "unmanaged",
    toolModes: {},
    protectedRepos: [],
    pausePolicy: {
      enabled: true,
      reasonRequired: true,
      maxDurationMinutes: MAX_PAUSE_DURATION_MINUTES,
      allowAllRepos: false,
      requireApprovalForRequiredMode: false,
    },
  };
}

function isValidPolicyMode(value: unknown): value is ManagedProfilePolicyMode {
  return typeof value === "string" && (VALID_POLICY_MODES as readonly string[]).includes(value);
}

function parseWorkHoursTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function parseWorkHoursDay(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized in WEEKDAY_ALIASES) return WEEKDAY_ALIASES[normalized];
  }
  return null;
}

export function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateWorkHoursInput(value: unknown): { workHours: ManagedProfileWorkHours | null; error: string | null } {
  if (!isRecord(value)) return { workHours: null, error: "workHours must be an object." };

  const unknownError = rejectUnknownFields(value, ["enabled", "days", "start", "end"]);
  if (unknownError) return { workHours: null, error: unknownError };

  if (typeof value.enabled !== "boolean") {
    return { workHours: null, error: "workHours.enabled must be a boolean." };
  }

  if (!Array.isArray(value.days) || value.days.length === 0) {
    return { workHours: null, error: "workHours.days must be a non-empty array." };
  }

  const days: number[] = [];
  for (const day of value.days) {
    const parsed = parseWorkHoursDay(day);
    if (parsed === null) {
      return { workHours: null, error: "workHours.days must contain weekday numbers (0-6) or names." };
    }
    if (!days.includes(parsed)) days.push(parsed);
  }

  const start = parseWorkHoursTime(value.start);
  const end = parseWorkHoursTime(value.end);
  if (!start) return { workHours: null, error: "workHours.start must use HH:MM format." };
  if (!end) return { workHours: null, error: "workHours.end must use HH:MM format." };
  if (start >= end) return { workHours: null, error: "workHours.end must be after workHours.start." };

  return {
    workHours: { enabled: value.enabled, days, start, end },
    error: null,
  };
}

export function validateProtectedRepoInput(
  value: unknown,
  index: number
): { repo: ManagedProfileProtectedRepo | null; error: string | null } {
  if (!isRecord(value)) return { repo: null, error: `protectedRepos[${index}] must be an object.` };

  const unknownError = rejectUnknownFields(value, ["repoHash", "repoId", "label", "mode", "enabled"]);
  if (unknownError) {
    return {
      repo: null,
      error: unknownError.replace("Unknown field", `protectedRepos[${index}] unknown field`),
    };
  }

  const repoHash = readString(value.repoHash) || readString(value.repoId);
  if (!repoHash) {
    return { repo: null, error: `protectedRepos[${index}].repoHash is required.` };
  }
  if (!isValidProtectedRepoHash(repoHash)) {
    return {
      repo: null,
      error: `protectedRepos[${index}].repoHash must be a 16- or 64-character lowercase hex hash.`,
    };
  }

  const mode = value.mode === undefined ? "required" : value.mode;
  if (!isValidPolicyMode(mode)) {
    return { repo: null, error: `protectedRepos[${index}].mode must be unmanaged, managed, or required.` };
  }

  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return { repo: null, error: `protectedRepos[${index}].enabled must be a boolean.` };
  }

  const label = value.label === undefined ? undefined : readString(value.label);
  if (label && label.length > 120) {
    return { repo: null, error: `protectedRepos[${index}].label is too long.` };
  }

  return {
    repo: {
      repoHash,
      label: label || undefined,
      mode,
      enabled: value.enabled !== false,
    },
    error: null,
  };
}

export function validatePausePolicyInput(
  value: unknown
): { pausePolicy: ManagedProfilePausePolicy | null; error: string | null } {
  if (!isRecord(value)) return { pausePolicy: null, error: "pausePolicy must be an object." };

  const unknownError = rejectUnknownFields(value, [
    "enabled",
    "reasonRequired",
    "maxDurationMinutes",
    "allowAllRepos",
    "requireApprovalForRequiredMode",
  ]);
  if (unknownError) return { pausePolicy: null, error: unknownError };

  if (typeof value.enabled !== "boolean") {
    return { pausePolicy: null, error: "pausePolicy.enabled must be a boolean." };
  }
  if (typeof value.reasonRequired !== "boolean") {
    return { pausePolicy: null, error: "pausePolicy.reasonRequired must be a boolean." };
  }
  if (typeof value.allowAllRepos !== "boolean") {
    return { pausePolicy: null, error: "pausePolicy.allowAllRepos must be a boolean." };
  }
  if (
    value.requireApprovalForRequiredMode !== undefined &&
    typeof value.requireApprovalForRequiredMode !== "boolean"
  ) {
    return {
      pausePolicy: null,
      error: "pausePolicy.requireApprovalForRequiredMode must be a boolean.",
    };
  }

  if (
    typeof value.maxDurationMinutes !== "number" ||
    !Number.isFinite(value.maxDurationMinutes) ||
    value.maxDurationMinutes <= 0
  ) {
    return { pausePolicy: null, error: "pausePolicy.maxDurationMinutes must be a positive number." };
  }
  if (value.maxDurationMinutes > MAX_PAUSE_DURATION_MINUTES) {
    return {
      pausePolicy: null,
      error: `pausePolicy.maxDurationMinutes cannot exceed ${MAX_PAUSE_DURATION_MINUTES} minutes.`,
    };
  }

  return {
    pausePolicy: {
      enabled: value.enabled,
      reasonRequired: value.reasonRequired,
      maxDurationMinutes: Math.floor(value.maxDurationMinutes),
      allowAllRepos: value.allowAllRepos,
      requireApprovalForRequiredMode: value.requireApprovalForRequiredMode === true,
    },
    error: null,
  };
}

export function validateToolModesInput(
  value: unknown
): { toolModes: ManagedProfileToolModes | null; error: string | null } {
  if (value === undefined) return { toolModes: {}, error: null };
  if (!isRecord(value)) return { toolModes: null, error: "toolModes must be an object." };

  const unknownError = rejectUnknownFields(value, [...VALID_MANAGED_TOOLS]);
  if (unknownError) return { toolModes: null, error: unknownError };

  const toolModes: ManagedProfileToolModes = {};
  for (const tool of VALID_MANAGED_TOOLS) {
    if (value[tool] === undefined) continue;
    if (!isValidPolicyMode(value[tool])) {
      return { toolModes: null, error: `toolModes.${tool} must be unmanaged, managed, or required.` };
    }
    toolModes[tool] = value[tool];
  }

  return { toolModes, error: null };
}

export function validateManagedProfilePolicyInput(
  body: Record<string, unknown>
): { policy: Omit<EffectiveManagedProfilePolicy, "policyId" | "accountId" | "createdAt" | "updatedAt"> | null; error: string | null } {
  const unknownError = rejectUnknownFields(body, [...PUT_ALLOWED_FIELDS]);
  if (unknownError) return { policy: null, error: unknownError };

  if (typeof body.enabled !== "boolean") {
    return { policy: null, error: "enabled must be a boolean." };
  }

  const timezone = body.timezone === undefined ? "UTC" : readString(body.timezone);
  if (!timezone) return { policy: null, error: "timezone is required." };
  if (!isValidTimezone(timezone)) return { policy: null, error: "timezone must be a valid IANA timezone." };

  for (const field of ["duringHoursMode", "outsideHoursMode", "defaultMode"] as const) {
    if (body[field] === undefined) continue;
    if (!isValidPolicyMode(body[field])) {
      return { policy: null, error: `${field} must be unmanaged, managed, or required.` };
    }
  }

  const workHoursResult = validateWorkHoursInput(
    body.workHours ?? {
      enabled: false,
      days: [1, 2, 3, 4, 5],
      start: "09:00",
      end: "17:00",
    }
  );
  if (workHoursResult.error || !workHoursResult.workHours) {
    return { policy: null, error: workHoursResult.error ?? "Invalid workHours." };
  }

  const pausePolicyResult = validatePausePolicyInput(
    body.pausePolicy ?? {
      enabled: true,
      reasonRequired: true,
      maxDurationMinutes: MAX_PAUSE_DURATION_MINUTES,
      allowAllRepos: false,
      requireApprovalForRequiredMode: false,
    }
  );
  if (pausePolicyResult.error || !pausePolicyResult.pausePolicy) {
    return { policy: null, error: pausePolicyResult.error ?? "Invalid pausePolicy." };
  }

  const toolModesResult = validateToolModesInput(body.toolModes);
  if (toolModesResult.error || toolModesResult.toolModes === null) {
    return { policy: null, error: toolModesResult.error ?? "Invalid toolModes." };
  }

  const protectedRepos: ManagedProfileProtectedRepo[] = [];
  if (body.protectedRepos !== undefined) {
    if (!Array.isArray(body.protectedRepos)) {
      return { policy: null, error: "protectedRepos must be an array." };
    }
    for (let index = 0; index < body.protectedRepos.length; index++) {
      const repoResult = validateProtectedRepoInput(body.protectedRepos[index], index);
      if (repoResult.error || !repoResult.repo) {
        return { policy: null, error: repoResult.error ?? "Invalid protected repo." };
      }
      protectedRepos.push(repoResult.repo);
    }
  }

  return {
    policy: {
      enabled: body.enabled,
      timezone,
      workHours: workHoursResult.workHours,
      duringHoursMode: (body.duringHoursMode as ManagedProfilePolicyMode | undefined) ?? "managed",
      outsideHoursMode: (body.outsideHoursMode as ManagedProfilePolicyMode | undefined) ?? "unmanaged",
      defaultMode: (body.defaultMode as ManagedProfilePolicyMode | undefined) ?? "unmanaged",
      toolModes: toolModesResult.toolModes,
      protectedRepos,
      pausePolicy: pausePolicyResult.pausePolicy,
    },
    error: null,
  };
}

function serializePolicy(doc: {
  policyId: string;
  accountId: string;
  timezone?: string | null;
  enabled?: boolean | null;
  workHours?: Partial<ManagedProfileWorkHours> | null;
  duringHoursMode?: ManagedProfilePolicyMode | null;
  outsideHoursMode?: ManagedProfilePolicyMode | null;
  defaultMode?: ManagedProfilePolicyMode | null;
  toolModes?: {
    claude?: ManagedProfilePolicyMode | null;
    codex?: ManagedProfilePolicyMode | null;
    cursor?: ManagedProfilePolicyMode | null;
  } | null;
  protectedRepos?: Array<{
    repoHash: string;
    label?: string | null;
    mode?: ManagedProfilePolicyMode | null;
    enabled?: boolean | null;
  }> | null;
  pausePolicy?: Partial<ManagedProfilePausePolicy> | null;
  createdAt?: Date;
  updatedAt?: Date;
}): EffectiveManagedProfilePolicy {
  const defaults = defaultManagedProfilePolicy(doc.accountId);
  return {
    policyId: doc.policyId,
    accountId: doc.accountId,
    timezone: doc.timezone ?? defaults.timezone,
    enabled: doc.enabled ?? defaults.enabled,
    workHours: {
      enabled: doc.workHours?.enabled ?? defaults.workHours.enabled,
      days: doc.workHours?.days?.length ? [...doc.workHours.days] : defaults.workHours.days,
      start: doc.workHours?.start ?? defaults.workHours.start,
      end: doc.workHours?.end ?? defaults.workHours.end,
    },
    duringHoursMode: doc.duringHoursMode ?? defaults.duringHoursMode,
    outsideHoursMode: doc.outsideHoursMode ?? defaults.outsideHoursMode,
    defaultMode: doc.defaultMode ?? defaults.defaultMode,
    toolModes: {
      claude: doc.toolModes?.claude ?? undefined,
      codex: doc.toolModes?.codex ?? undefined,
      cursor: doc.toolModes?.cursor ?? undefined,
    },
    protectedRepos: (doc.protectedRepos ?? []).map((repo) => ({
      repoHash: repo.repoHash,
      label: repo.label ?? undefined,
      mode: repo.mode ?? "required",
      enabled: repo.enabled !== false,
    })),
    pausePolicy: {
      enabled: doc.pausePolicy?.enabled ?? defaults.pausePolicy.enabled,
      reasonRequired: doc.pausePolicy?.reasonRequired ?? defaults.pausePolicy.reasonRequired,
      maxDurationMinutes:
        doc.pausePolicy?.maxDurationMinutes ?? defaults.pausePolicy.maxDurationMinutes,
      allowAllRepos: doc.pausePolicy?.allowAllRepos ?? defaults.pausePolicy.allowAllRepos,
      requireApprovalForRequiredMode:
        doc.pausePolicy?.requireApprovalForRequiredMode ??
        defaults.pausePolicy.requireApprovalForRequiredMode,
    },
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export async function loadEffectiveManagedProfilePolicy(
  accountId: string
): Promise<EffectiveManagedProfilePolicy> {
  await connectToDatabase();
  const doc = await ManagedProfilePolicy.findOne({ accountId }).lean();
  if (!doc) return defaultManagedProfilePolicy(accountId);
  return serializePolicy(doc);
}

export const PROTECTED_REPO_ENROLLMENT_ALLOWED_FIELDS = ["repoHash", "label", "mode", "enabled"] as const;

export function validateProtectedRepoEnrollmentInput(
  body: Record<string, unknown>
): { repo: ManagedProfileProtectedRepo | null; error: string | null } {
  const unknownError = rejectUnknownFields(body, [...PROTECTED_REPO_ENROLLMENT_ALLOWED_FIELDS]);
  if (unknownError) return { repo: null, error: unknownError };
  return validateProtectedRepoInput(body, 0);
}

function effectivePolicyToSaveBody(
  policy: EffectiveManagedProfilePolicy
): Record<string, unknown> {
  return {
    enabled: policy.enabled,
    timezone: policy.timezone,
    workHours: policy.workHours,
    duringHoursMode: policy.duringHoursMode,
    outsideHoursMode: policy.outsideHoursMode,
    defaultMode: policy.defaultMode,
    toolModes: policy.toolModes,
    protectedRepos: policy.protectedRepos.map((repo) => ({
      repoHash: repo.repoHash,
      label: repo.label,
      mode: repo.mode,
      enabled: repo.enabled,
    })),
    pausePolicy: policy.pausePolicy,
  };
}

export async function enrollProtectedRepo(
  accountId: string,
  body: Record<string, unknown>
): Promise<{ policy: EffectiveManagedProfilePolicy | null; error: string | null; status?: number }> {
  const validated = validateProtectedRepoEnrollmentInput(body);
  if (validated.error || !validated.repo) {
    return { policy: null, error: validated.error ?? "Invalid protected repo.", status: 400 };
  }

  const existing = await loadEffectiveManagedProfilePolicy(accountId);
  const duplicate = existing.protectedRepos.some((repo) => repo.repoHash === validated.repo!.repoHash);
  if (duplicate) {
    return { policy: null, error: "Protected repo already exists.", status: 409 };
  }

  const saveBody = effectivePolicyToSaveBody(existing);
  const protectedRepos = saveBody.protectedRepos as ManagedProfileProtectedRepo[];
  protectedRepos.push(validated.repo);

  const result = await saveManagedProfilePolicy(accountId, saveBody);
  if (result.error) {
    return { policy: null, error: result.error, status: 400 };
  }
  return { policy: result.policy, error: null };
}

export async function saveManagedProfilePolicy(
  accountId: string,
  body: Record<string, unknown>
): Promise<{ policy: EffectiveManagedProfilePolicy | null; error: string | null }> {
  const validated = validateManagedProfilePolicyInput(body);
  if (validated.error || !validated.policy) {
    return { policy: null, error: validated.error ?? "Invalid policy." };
  }

  await connectToDatabase();
  const existing = await ManagedProfilePolicy.findOne({ accountId }).lean();
  const policyId = existing?.policyId ?? createPublicId("pprf");

  const doc = await ManagedProfilePolicy.findOneAndUpdate(
    { accountId },
    {
      policyId,
      accountId,
      ...validated.policy,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  if (!doc) return { policy: null, error: "Failed to save managed profile policy." };
  return { policy: serializePolicy(doc), error: null };
}

function getZonedParts(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value?.toLowerCase() ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const weekdayNumber = WEEKDAY_ALIASES[weekday.slice(0, 3)] ?? WEEKDAY_ALIASES[weekday] ?? null;
  return { weekdayNumber, hour, minute };
}

export function isWithinPolicyWorkHours(
  workHours: ManagedProfileWorkHours,
  timezone: string,
  now = new Date()
): boolean {
  if (!workHours.enabled) return false;
  const { weekdayNumber, hour, minute } = getZonedParts(now, timezone);
  if (weekdayNumber === null || !workHours.days.includes(weekdayNumber)) return false;

  const [startHour, startMinute] = workHours.start.split(":").map(Number);
  const [endHour, endMinute] = workHours.end.split(":").map(Number);
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export type PersistedPolicyResolutionInput = {
  tool: string;
  repoRoot?: string | null;
};

export type PersistedPolicyResolution = {
  mode: ManagedProfilePolicyMode;
  profileId: string;
  profileName: string;
  reason: string;
} | null;

export type ManagedProfileMatchedRuleType =
  | "protected_repo"
  | "tool_override"
  | "work_hours"
  | "outside_hours"
  | "default"
  | "legacy"
  | "policy_disabled";

export type ManagedProfileMatchedRule = {
  type: ManagedProfileMatchedRuleType;
  repoHash?: string;
  tool?: string;
  mode: ManagedProfilePolicyMode;
};

export type PersistedPolicyDecision = {
  mode: ManagedProfilePolicyMode;
  profileId: string;
  profileName: string;
  reason: string;
  matchedRule: ManagedProfileMatchedRule;
};

export function simulateReasonForMatchedRule(rule: ManagedProfileMatchedRule): string {
  switch (rule.type) {
    case "protected_repo":
      return rule.mode === "required"
        ? "Protected repo requires enforcement."
        : `Protected repo policy applies (${rule.mode}).`;
    case "tool_override":
      return `Tool-specific policy applies (${rule.mode}).`;
    case "work_hours":
      return "Managed profile work-hours policy applies during configured hours.";
    case "outside_hours":
      return "Managed profile outside-hours policy applies.";
    case "default":
      return "Workspace managed profile default policy applies.";
    case "legacy":
      return "Legacy onboarding policy applies.";
    case "policy_disabled":
      return "Managed profile policy is disabled.";
    default:
      return "No matching managed profile.";
  }
}

export function resolvePersistedManagedProfileDecision(
  policy: EffectiveManagedProfilePolicy,
  input: PersistedPolicyResolutionInput,
  now = new Date()
): PersistedPolicyDecision | null {
  if (!policy.enabled) return null;

  const repoHash = input.repoRoot?.trim() || null;
  if (repoHash) {
    const protectedRepo = policy.protectedRepos.find(
      (repo) => repo.enabled && repo.repoHash === repoHash
    );
    if (protectedRepo) {
      const matchedRule: ManagedProfileMatchedRule = {
        type: "protected_repo",
        repoHash: protectedRepo.repoHash,
        mode: protectedRepo.mode,
      };
      return {
        mode: protectedRepo.mode,
        profileId: policy.policyId ?? "pprf_managed",
        profileName: protectedRepo.label?.trim() || "Default managed profile",
        reason: simulateReasonForMatchedRule(matchedRule),
        matchedRule,
      };
    }
  }

  const tool = input.tool.trim().toLowerCase();
  if (
    (tool === "claude" || tool === "codex" || tool === "cursor") &&
    policy.toolModes[tool]
  ) {
    const mode = policy.toolModes[tool]!;
    const matchedRule: ManagedProfileMatchedRule = {
      type: "tool_override",
      tool,
      mode,
    };
    return {
      mode,
      profileId: policy.policyId ?? "pprf_managed",
      profileName: `${tool} tool policy`,
      reason: simulateReasonForMatchedRule(matchedRule),
      matchedRule,
    };
  }

  if (policy.workHours.enabled) {
    const inWorkHours = isWithinPolicyWorkHours(policy.workHours, policy.timezone, now);
    const mode = inWorkHours ? policy.duringHoursMode : policy.outsideHoursMode;
    const matchedRule: ManagedProfileMatchedRule = {
      type: inWorkHours ? "work_hours" : "outside_hours",
      mode,
    };
    return {
      mode,
      profileId: policy.policyId ?? "pprf_work_hours",
      profileName: inWorkHours ? "Work hours policy" : "Outside work hours policy",
      reason: simulateReasonForMatchedRule(matchedRule),
      matchedRule,
    };
  }

  const matchedRule: ManagedProfileMatchedRule = {
    type: "default",
    mode: policy.defaultMode,
  };
  return {
    mode: policy.defaultMode,
    profileId: policy.policyId ?? "pprf_managed",
    profileName: "Default managed profile",
    reason: simulateReasonForMatchedRule(matchedRule),
    matchedRule,
  };
}

export function resolvePersistedManagedProfileMode(
  policy: EffectiveManagedProfilePolicy,
  input: PersistedPolicyResolutionInput,
  now = new Date()
): PersistedPolicyResolution {
  const decision = resolvePersistedManagedProfileDecision(policy, input, now);
  if (!decision) return null;

  if (decision.matchedRule.type === "protected_repo") {
    return {
      mode: decision.mode,
      profileId: decision.profileId,
      profileName:
        decision.profileName === "Default managed profile"
          ? "Protected repository"
          : decision.profileName,
      reason: `Protected repository policy applies (${decision.mode}).`,
    };
  }
  if (decision.matchedRule.type === "tool_override") {
    return {
      mode: decision.mode,
      profileId: decision.profileId,
      profileName: decision.profileName,
      reason: `Tool-specific managed profile policy applies (${decision.mode}).`,
    };
  }
  if (decision.matchedRule.type === "work_hours") {
    return {
      mode: decision.mode,
      profileId: decision.profileId,
      profileName: decision.profileName,
      reason: "Managed profile work-hours policy applies during configured hours.",
    };
  }
  if (decision.matchedRule.type === "outside_hours") {
    return {
      mode: decision.mode,
      profileId: decision.profileId,
      profileName: decision.profileName,
      reason: "Managed profile outside-hours policy applies.",
    };
  }
  return {
    mode: decision.mode,
    profileId: decision.profileId,
    profileName:
      decision.matchedRule.type === "default" ? "Workspace managed profile" : decision.profileName,
    reason: "Workspace managed profile default policy applies.",
  };
}

export function validatePauseRequestAgainstPolicy(input: {
  reason: string;
  durationMinutes: number;
  scope?: "current_repo" | "all";
  pausePolicy: ManagedProfilePausePolicy;
}): string | null {
  if (!input.pausePolicy.enabled) {
    return "Pause is disabled by workspace managed profile policy.";
  }
  if (input.pausePolicy.reasonRequired && !input.reason?.trim()) {
    return "reason is required.";
  }
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    return "durationMinutes must be a positive number.";
  }
  if (input.durationMinutes > input.pausePolicy.maxDurationMinutes) {
    return `durationMinutes cannot exceed ${input.pausePolicy.maxDurationMinutes} minutes.`;
  }
  if (input.scope === "all" && !input.pausePolicy.allowAllRepos) {
    return "All-repo pause is disabled by workspace managed profile policy.";
  }
  return null;
}
