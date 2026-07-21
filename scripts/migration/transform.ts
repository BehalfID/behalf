/**
 * Mongo → Postgres migration transforms (PR C).
 * Pure helpers: drop Mongo `_id`, convert dates to ISO, split embedded arrays.
 */

export type JsonObject = Record<string, unknown>;

export function dropMongoId<T extends JsonObject>(doc: T): Omit<T, "_id"> {
  const { _id: _ignored, ...rest } = doc;
  return rest;
}

export function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

export function transformTimestamps(doc: JsonObject): JsonObject {
  const next: JsonObject = { ...doc };
  for (const key of [
    "createdAt",
    "updatedAt",
    "expiresAt",
    "processedAt",
    "grantExpiresAt",
    "usedAt",
    "resolvedAt",
    "lastUsedAt",
    "verificationPeriodStart",
    "stripeTrialEnd",
    "stripeCurrentPeriodEnd"
  ] as const) {
    if (key in next) {
      const iso = toIsoDate(next[key]);
      if (iso) next[key] = iso;
    }
  }
  return next;
}

/** Convert camelCase Mongo fields to snake_case Postgres column names for a flat row. */
export function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toSnakeCaseRow(doc: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(doc)) {
    out[camelToSnakeKey(key)] = value;
  }
  return out;
}

export type ManagedProfileExport = {
  policy: JsonObject;
  protectedRepos: JsonObject[];
};

/** Split ManagedProfilePolicy.protectedRepos[] into child-table rows. */
export function splitManagedProfilePolicy(doc: JsonObject): ManagedProfileExport {
  const clean = transformTimestamps(dropMongoId(doc));
  const repos = Array.isArray(clean.protectedRepos) ? clean.protectedRepos : [];
  const { protectedRepos: _ignored, ...policy } = clean;
  return {
    policy: toSnakeCaseRow(policy),
    protectedRepos: repos
      .filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object")
      .map((repo) =>
        toSnakeCaseRow({
          policyId: policy.policyId,
          accountId: policy.accountId,
          repoHash: repo.repoHash,
          label: repo.label ?? null,
          mode: repo.mode ?? "required",
          enabled: repo.enabled !== false
        })
      )
  };
}

export function transformAccount(doc: JsonObject): JsonObject {
  return toSnakeCaseRow(transformTimestamps(dropMongoId(doc)));
}

export function transformAgent(doc: JsonObject): JsonObject {
  return toSnakeCaseRow(transformTimestamps(dropMongoId(doc)));
}

export function transformPermission(doc: JsonObject): JsonObject {
  return toSnakeCaseRow(transformTimestamps(dropMongoId(doc)));
}

export function transformApprovalRequest(doc: JsonObject): JsonObject {
  return toSnakeCaseRow(transformTimestamps(dropMongoId(doc)));
}

export function transformVerificationLog(doc: JsonObject): JsonObject {
  return toSnakeCaseRow(transformTimestamps(dropMongoId(doc)));
}

/** FK-ordered collection export list for import scripts. */
export const EXPORT_COLLECTION_ORDER = [
  "accounts",
  "developer_users",
  "oauth_pending_signups",
  "developer_sessions",
  "developer_api_tokens",
  "account_memberships",
  "account_invites",
  "device_codes",
  "agents",
  "permissions",
  "permission_profiles",
  "approval_requests",
  "webhook_endpoints",
  "webhook_events",
  "webhook_deliveries",
  "stripe_webhook_events",
  "enterprise_inquiries",
  "managed_profile_policies",
  "managed_profile_protected_repos",
  "cli_pause_leases",
  "cli_audit_activities",
  "sites",
  "site_access_rules",
  "site_guard_keys",
  "status_components",
  "status_incidents",
  "verification_logs",
  "site_access_logs"
] as const;

export type ExportCollectionName = (typeof EXPORT_COLLECTION_ORDER)[number];
