/**
 * Shared Mongo → NDJSON / Postgres migration transforms (PR C).
 *
 * NDJSON files use Postgres snake_case column names (see lib/db/postgres/schema.ts).
 */

/** FK-safe export/import order. Logs last. Extra Mongo-only collections at the end. */
export const EXPORT_TABLE_ORDER = [
  // Tenancy + identity
  "accounts",
  "developer_users",
  "oauth_pending_signups",
  "developer_sessions",
  "developer_api_tokens",
  "account_memberships",
  "account_invites",
  "device_codes",
  // Core
  "agents",
  "permissions",
  "permission_profiles",
  "approval_requests",
  // Webhooks (endpoints/events before deliveries)
  "webhook_endpoints",
  "webhook_events",
  // Managed profiles
  "managed_profile_policies",
  "managed_profile_protected_repos",
  "cli_pause_leases",
  // Site Guard
  "sites",
  "site_access_rules",
  "site_guard_keys",
  // Billing / status (no tenant FK deps beyond accounts for stripe/enterprise)
  "stripe_webhook_events",
  "enterprise_inquiries",
  "status_components",
  "status_incidents",
  // Logs last (logical refs only; no enforced FKs)
  "verification_logs",
  "webhook_deliveries",
  "cli_audit_activities",
  "site_access_logs",
  // Exported even if Postgres tables land separately
  "policy_documents",
  "integration_bindings",
  "collaboration_message_refs"
] as const;

export type ExportTableName = (typeof EXPORT_TABLE_ORDER)[number];

/** Tables that exist in lib/db/postgres/schema.ts today. */
export const POSTGRES_IMPORT_TABLES = new Set<ExportTableName>([
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
  "managed_profile_policies",
  "managed_profile_protected_repos",
  "cli_pause_leases",
  "sites",
  "site_access_rules",
  "site_guard_keys",
  "stripe_webhook_events",
  "enterprise_inquiries",
  "status_components",
  "status_incidents",
  "verification_logs",
  "webhook_deliveries",
  "cli_audit_activities",
  "site_access_logs",
  "policy_documents",
  "integration_bindings",
  "collaboration_message_refs"
]);

const DROP_KEYS = new Set(["_id", "__v"]);

export function camelToSnake(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isObjectIdLike(value: unknown): boolean {
  if (value == null || typeof value !== "object") return false;
  const record = value as { _bsontype?: string; toHexString?: () => string; constructor?: { name?: string } };
  if (record._bsontype === "ObjectId" || record._bsontype === "ObjectID") return true;
  if (typeof record.toHexString === "function" && record.constructor?.name === "ObjectId") {
    return true;
  }
  return false;
}

export function transformValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isObjectIdLike(value)) {
    const oid = value as { toHexString?: () => string; toString: () => string };
    return typeof oid.toHexString === "function" ? oid.toHexString() : oid.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformValue(item));
  }
  if (isPlainObject(value)) {
    return transformDocument(value);
  }
  // Decimal128 / Long etc. — stringify when they expose toString and aren't plain JSON types
  if (typeof value === "object") {
    const record = value as { _bsontype?: string; toString?: () => string };
    if (record._bsontype && typeof record.toString === "function") {
      return record.toString();
    }
  }
  return value;
}

/**
 * Drop Mongo `_id` / `__v`, convert Dates → ISO strings, ObjectIds → hex strings,
 * and rename keys to snake_case (recursively).
 */
export function transformDocument(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(doc)) {
    if (DROP_KEYS.has(key)) continue;
    const snake = camelToSnake(key);
    out[snake] = transformValue(raw);
  }
  return out;
}

export type ProtectedRepoInput = {
  repoHash?: unknown;
  label?: unknown;
  mode?: unknown;
  enabled?: unknown;
};

/**
 * Split ManagedProfilePolicy.protectedRepos[] into child-table rows.
 * Parent row excludes `protected_repos`; children carry policy_id + account_id.
 */
export function splitManagedProfileProtectedRepos(doc: Record<string, unknown>): {
  policy: Record<string, unknown>;
  protectedRepos: Record<string, unknown>[];
} {
  const camelRepos = doc.protectedRepos;
  const snakeRepos = doc.protected_repos;
  const reposRaw = Array.isArray(camelRepos)
    ? camelRepos
    : Array.isArray(snakeRepos)
      ? snakeRepos
      : [];

  const transformed = transformDocument(doc);
  delete transformed.protected_repos;

  const policyId = transformed.policy_id;
  const accountId = transformed.account_id;

  const protectedRepos: Record<string, unknown>[] = [];
  for (const repo of reposRaw) {
    if (!repo || typeof repo !== "object") continue;
    const r = repo as ProtectedRepoInput & Record<string, unknown>;
    const repoHash =
      typeof r.repoHash === "string"
        ? r.repoHash
        : typeof r.repo_hash === "string"
          ? r.repo_hash
          : null;
    if (!repoHash || typeof policyId !== "string" || typeof accountId !== "string") {
      continue;
    }
    const mode =
      typeof r.mode === "string" && r.mode.length > 0 ? r.mode : "required";
    const enabled = typeof r.enabled === "boolean" ? r.enabled : true;
    const label = typeof r.label === "string" ? r.label : null;

    protectedRepos.push({
      policy_id: policyId,
      account_id: accountId,
      repo_hash: repoHash,
      label,
      mode,
      enabled
    });
  }

  return { policy: transformed, protectedRepos };
}

/** Stable checksum over selected snake_case columns (sorted keys, JSON stringify). */
export function checksumRow(
  row: Record<string, unknown>,
  columns: readonly string[]
): string {
  const picked: Record<string, unknown> = {};
  for (const col of columns) {
    if (col in row) {
      picked[col] = row[col] ?? null;
    }
  }
  return JSON.stringify(picked);
}

export function ndjsonPath(dir: string, table: string): string {
  return `${dir.replace(/[/\\]+$/, "")}/${table}.ndjson`;
}
