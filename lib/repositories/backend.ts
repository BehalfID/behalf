/**
 * Explicit repository backend selection for the Mongo → Postgres migration.
 *
 * Default production backend is Mongo. DATABASE_URL alone must never switch
 * runtime traffic. Postgres requires both an explicit backend flag and the
 * BEHALFID_ALLOW_POSTGRES_RUNTIME=true safety latch (globally or per aggregate).
 */

export type RepositoryBackend = "mongo" | "postgres";

export const REPOSITORY_AGGREGATES = [
  "accounts",
  "agents",
  "memberships",
  "managedProfiles",
  "permissions",
  "approvals",
  "verificationLogs",
  "webhooks",
  "stripeEvents",
  "users",
  "sessions",
  "apiTokens",
  "oauthPending",
  "deviceCodes",
  "sites",
  "cli",
  "status",
  "enterpriseInquiries",
  "permissionProfiles",
  "policyDocuments",
  "integrationBindings",
  "accountDeletion"
] as const;

export type RepositoryAggregate = (typeof REPOSITORY_AGGREGATES)[number];

const SUPPORTED_BACKENDS: readonly RepositoryBackend[] = ["mongo", "postgres"];

function parseBackendValue(
  raw: string | undefined,
  source: string
): RepositoryBackend | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "mongo" || normalized === "postgres") {
    return normalized;
  }
  throw new Error(
    `Unsupported ${source}="${raw}". Supported: ${SUPPORTED_BACKENDS.join(", ")}.`
  );
}

function isPostgresRuntimeAllowed(env: NodeJS.ProcessEnv): boolean {
  const latch = env.BEHALFID_ALLOW_POSTGRES_RUNTIME?.trim().toLowerCase();
  return latch === "true" || latch === "1" || latch === "yes";
}

function assertPostgresAllowed(env: NodeJS.ProcessEnv, source: string): void {
  if (isPostgresRuntimeAllowed(env)) return;
  throw new Error(
    `${source}=postgres requires BEHALFID_ALLOW_POSTGRES_RUNTIME=true. ` +
      "Without this safety latch, Postgres runtime selection is rejected. " +
      "Unset the backend flag or set it to mongo. " +
      "DATABASE_URL alone does not switch runtime traffic."
  );
}

/** Env key for per-aggregate override (camelCase → UPPER_SNAKE). */
export function repositoryBackendOverrideEnvKey(aggregate: RepositoryAggregate): string {
  return `BEHALFID_REPO_BACKEND_${aggregate.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/**
 * Resolves the global runtime repository backend.
 * - Default / production: `"mongo"`
 * - `BEHALFID_REPOSITORY_BACKEND=postgres` requires `BEHALFID_ALLOW_POSTGRES_RUNTIME=true`
 * - Presence of DATABASE_URL / POSTGRES_URL alone does **not** select Postgres
 */
export function resolveRepositoryBackend(
  env: NodeJS.ProcessEnv = process.env
): RepositoryBackend {
  const backend = parseBackendValue(
    env.BEHALFID_REPOSITORY_BACKEND,
    "BEHALFID_REPOSITORY_BACKEND"
  );
  if (!backend || backend === "mongo") {
    return "mongo";
  }
  assertPostgresAllowed(env, "BEHALFID_REPOSITORY_BACKEND");
  return "postgres";
}

/**
 * Resolves the backend for one aggregate.
 * Per-aggregate `BEHALFID_REPO_BACKEND_<AGGREGATE>` overrides the global default.
 * CamelCase aggregates use UPPER_SNAKE (e.g. managedProfiles → MANAGED_PROFILES).
 * Values: mongo | postgres. Postgres still requires the safety latch.
 */
export function resolveRepositoryBackendFor(
  aggregate: RepositoryAggregate,
  env: NodeJS.ProcessEnv = process.env
): RepositoryBackend {
  if (!(REPOSITORY_AGGREGATES as readonly string[]).includes(aggregate)) {
    throw new Error(`Unknown repository aggregate: ${aggregate}`);
  }

  const key = repositoryBackendOverrideEnvKey(aggregate);
  const override = parseBackendValue(env[key], key);
  if (override === "postgres") {
    assertPostgresAllowed(env, key);
    return "postgres";
  }
  if (override === "mongo") {
    return "mongo";
  }
  return resolveRepositoryBackend(env);
}

/**
 * Lists aggregates whose per-table override env vars are explicitly set (diagnostics).
 */
export function listRepositoryBackendOverrides(
  env: NodeJS.ProcessEnv = process.env
): Partial<Record<RepositoryAggregate, RepositoryBackend>> {
  const overrides: Partial<Record<RepositoryAggregate, RepositoryBackend>> = {};
  for (const aggregate of REPOSITORY_AGGREGATES) {
    const key = repositoryBackendOverrideEnvKey(aggregate);
    const backend = parseBackendValue(env[key], key);
    if (backend) {
      overrides[aggregate] = backend;
    }
  }
  return overrides;
}
