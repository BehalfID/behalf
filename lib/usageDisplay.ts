import { formatLimit, isUnlimitedLimit } from "@/lib/plans";

export type UsageLimitState = "normal" | "near" | "over" | "unlimited";

export type CountedUsageResourceKind = "seats" | "agents" | "protectedRepos" | "verifications";

const NEAR_LIMIT_RATIO = 0.8;

const RESOURCE_LABELS: Record<CountedUsageResourceKind, string> = {
  seats: "seats",
  agents: "agents",
  protectedRepos: "protected repos",
  verifications: "verifications"
};

const OVER_LIMIT_PRESERVATION: Record<CountedUsageResourceKind, string> = {
  seats: "Existing members remain active; adding new billable members is blocked.",
  agents: "Existing agents remain active; creating new agents is blocked.",
  protectedRepos: "Existing protected repos remain enrolled; new enrollments are blocked.",
  verifications: "New verifications are blocked until the monthly limit resets."
};

const CREATION_ONLY_HELPERS: Record<CountedUsageResourceKind, string> = {
  seats: "New billable members are blocked at this limit. Viewers are free.",
  agents: "New agents are blocked at this limit.",
  protectedRepos: "New protected repo enrollments are blocked at this limit.",
  verifications: "Usage resets at the start of each UTC calendar month."
};

const UNLIMITED_HELPERS: Record<CountedUsageResourceKind, string> = {
  seats: "No enforced seat limit.",
  agents: "No enforced agent limit.",
  protectedRepos: "No enforced protected repo limit.",
  verifications: "No enforced monthly verification limit."
};

export function getUsageLimitState(used: number, limit: number | null | undefined): UsageLimitState {
  if (isUnlimitedLimit(limit)) return "unlimited";
  const finiteLimit = limit as number;
  if (used > finiteLimit) return "over";
  if (finiteLimit > 0 && used / finiteLimit >= NEAR_LIMIT_RATIO) return "near";
  return "normal";
}

export function formatUsageCount(used: number, limit: number | null | undefined): string {
  return `${used.toLocaleString()} / ${formatLimit(limit)}`;
}

export function getUsageStatusLabel(state: UsageLimitState): string | null {
  switch (state) {
    case "over":
      return "Over limit";
    case "near":
      return "Nearing limit";
    case "unlimited":
      return "Unlimited";
    default:
      return null;
  }
}

export function usageLimitTileClassName(state: UsageLimitState): string {
  return `usage-limit-tile usage-limit-tile--${state}`;
}

export function getOverLimitNote(
  kind: CountedUsageResourceKind,
  used: number,
  limit: number | null | undefined
): string | null {
  if (getUsageLimitState(used, limit) !== "over") return null;
  const label = RESOURCE_LABELS[kind];
  return `${formatUsageCount(used, limit)} ${label} — over limit. ${OVER_LIMIT_PRESERVATION[kind]}`;
}

export function getCountedUsageHelper(
  kind: CountedUsageResourceKind,
  used: number,
  limit: number | null | undefined
): string {
  const overNote = getOverLimitNote(kind, used, limit);
  if (overNote) return overNote;
  if (isUnlimitedLimit(limit)) return UNLIMITED_HELPERS[kind];
  const state = getUsageLimitState(used, limit);
  if (state === "near") {
    return `${CREATION_ONLY_HELPERS[kind]} You are nearing this limit.`;
  }
  return CREATION_ONLY_HELPERS[kind];
}

export function getWebhookHelper(enabled: boolean): string {
  return enabled
    ? "Webhook endpoints can receive verification events."
    : "Upgrade to Pro to enable webhook delivery.";
}

export function getWebhookValue(enabled: boolean): string {
  return enabled ? "Enabled" : "Upgrade required";
}
