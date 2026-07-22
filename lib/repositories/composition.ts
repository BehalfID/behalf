/**
 * Single composition point for runtime repository access.
 *
 * Default is the Mongo bundle. Postgres requires BEHALFID_ALLOW_POSTGRES_RUNTIME=true
 * plus either BEHALFID_REPOSITORY_BACKEND=postgres or a per-aggregate override.
 * Aggregates without a Postgres adapter throw if selected as postgres.
 */

import { getPostgresDb } from "@/lib/db/postgres";
import {
  resolveRepositoryBackend,
  resolveRepositoryBackendFor,
  repositoryBackendOverrideEnvKey,
  type RepositoryAggregate,
  REPOSITORY_AGGREGATES
} from "@/lib/repositories/backend";
import {
  createPostgresRuntimeRepositories,
  isPostgresAdapterReady
} from "@/lib/repositories/postgres/runtime";
import * as accounts from "@/lib/repositories/mongo/accounts";
import * as agents from "@/lib/repositories/mongo/agents";
import * as memberships from "@/lib/repositories/mongo/memberships";
import * as managedProfiles from "@/lib/repositories/mongo/managedProfiles";
import * as permissions from "@/lib/repositories/mongo/permissions";
import * as approvals from "@/lib/repositories/mongo/approvals";
import * as verificationLogs from "@/lib/repositories/mongo/verificationLogs";
import * as webhooks from "@/lib/repositories/mongo/webhooks";
import * as stripeEvents from "@/lib/repositories/mongo/stripeEvents";
import * as users from "@/lib/repositories/mongo/users";
import * as sessions from "@/lib/repositories/mongo/sessions";
import * as apiTokens from "@/lib/repositories/mongo/apiTokens";
import * as oauthPending from "@/lib/repositories/mongo/oauthPending";
import * as deviceCodes from "@/lib/repositories/mongo/deviceCodes";
import * as sites from "@/lib/repositories/mongo/sites";
import * as cli from "@/lib/repositories/mongo/cli";
import * as status from "@/lib/repositories/mongo/status";
import * as enterpriseInquiries from "@/lib/repositories/mongo/enterpriseInquiries";
import * as permissionProfiles from "@/lib/repositories/mongo/permissionProfiles";
import * as policyDocuments from "@/lib/repositories/mongo/policyDocuments";
import * as integrationBindings from "@/lib/repositories/mongo/integrationBindings";
import * as accountDeletion from "@/lib/repositories/mongo/accountDeletion";

export type Repositories = {
  accounts: typeof accounts;
  agents: typeof agents;
  memberships: typeof memberships;
  managedProfiles: typeof managedProfiles;
  permissions: typeof permissions;
  approvals: typeof approvals;
  verificationLogs: typeof verificationLogs;
  webhooks: typeof webhooks;
  stripeEvents: typeof stripeEvents;
  users: typeof users;
  sessions: typeof sessions;
  apiTokens: typeof apiTokens;
  oauthPending: typeof oauthPending;
  deviceCodes: typeof deviceCodes;
  sites: typeof sites;
  cli: typeof cli;
  status: typeof status;
  enterpriseInquiries: typeof enterpriseInquiries;
  permissionProfiles: typeof permissionProfiles;
  policyDocuments: typeof policyDocuments;
  integrationBindings: typeof integrationBindings;
  accountDeletion: typeof accountDeletion;
};

const mongoRepositories: Repositories = {
  accounts,
  agents,
  memberships,
  managedProfiles,
  permissions,
  approvals,
  verificationLogs,
  webhooks,
  stripeEvents,
  users,
  sessions,
  apiTokens,
  oauthPending,
  deviceCodes,
  sites,
  cli,
  status,
  enterpriseInquiries,
  permissionProfiles,
  policyDocuments,
  integrationBindings,
  accountDeletion
};

let cached: Repositories | null = null;
let cachedKey: string | null = null;

function selectionCacheKey(env: NodeJS.ProcessEnv): string {
  const global = env.BEHALFID_REPOSITORY_BACKEND ?? "";
  const latch = env.BEHALFID_ALLOW_POSTGRES_RUNTIME ?? "";
  const overrides = REPOSITORY_AGGREGATES.map(
    (aggregate) =>
      `${aggregate}=${env[repositoryBackendOverrideEnvKey(aggregate)] ?? ""}`
  ).join("|");
  return `${global}::${latch}::${overrides}`;
}

function assertPostgresUrlConfigured(env: NodeJS.ProcessEnv): void {
  // Only inspect the env object passed in (tests pass a stub without mutating process.env).
  if (env.DATABASE_URL || env.POSTGRES_URL) return;
  throw new Error(
    "Postgres repository backend selected but DATABASE_URL / POSTGRES_URL is not set. " +
      "Configure a Postgres URL before enabling BEHALFID_REPOSITORY_BACKEND=postgres " +
      "or BEHALFID_REPO_BACKEND_* overrides."
  );
}

function pickAggregate<K extends RepositoryAggregate>(
  aggregate: K,
  env: NodeJS.ProcessEnv,
  postgresBundle: Partial<Repositories> | null
): Repositories[K] {
  const backend = resolveRepositoryBackendFor(aggregate, env);
  if (backend === "mongo") {
    return mongoRepositories[aggregate];
  }
  const impl = postgresBundle?.[aggregate];
  if (!impl) {
    throw new Error(
      `Postgres adapter not ready for aggregate "${aggregate}". ` +
        `Unset ${repositoryBackendOverrideEnvKey(aggregate)} or keep it on mongo ` +
        "until a lib/repositories/postgres adapter exists."
    );
  }
  return impl as Repositories[K];
}

function buildRepositories(env: NodeJS.ProcessEnv): Repositories {
  // Resolve global first so a misconfigured latch fails fast even when every
  // aggregate is overridden to mongo.
  resolveRepositoryBackend(env);

  const selections = Object.fromEntries(
    REPOSITORY_AGGREGATES.map((aggregate) => [
      aggregate,
      resolveRepositoryBackendFor(aggregate, env)
    ])
  ) as Record<RepositoryAggregate, "mongo" | "postgres">;

  const postgresSelected = REPOSITORY_AGGREGATES.filter(
    (aggregate) => selections[aggregate] === "postgres"
  );

  for (const aggregate of postgresSelected) {
    if (!isPostgresAdapterReady(aggregate)) {
      throw new Error(
        `Postgres adapter not ready for aggregate "${aggregate}". ` +
          `Unset ${repositoryBackendOverrideEnvKey(aggregate)} or keep it on mongo ` +
          "until a lib/repositories/postgres adapter exists."
      );
    }
  }

  let postgresBundle: Partial<Repositories> | null = null;
  if (postgresSelected.length > 0) {
    assertPostgresUrlConfigured(env);
    postgresBundle = createPostgresRuntimeRepositories(getPostgresDb());
  }

  return {
    accounts: pickAggregate("accounts", env, postgresBundle),
    agents: pickAggregate("agents", env, postgresBundle),
    memberships: pickAggregate("memberships", env, postgresBundle),
    managedProfiles: pickAggregate("managedProfiles", env, postgresBundle),
    permissions: pickAggregate("permissions", env, postgresBundle),
    approvals: pickAggregate("approvals", env, postgresBundle),
    verificationLogs: pickAggregate("verificationLogs", env, postgresBundle),
    webhooks: pickAggregate("webhooks", env, postgresBundle),
    stripeEvents: pickAggregate("stripeEvents", env, postgresBundle),
    users: pickAggregate("users", env, postgresBundle),
    sessions: pickAggregate("sessions", env, postgresBundle),
    apiTokens: pickAggregate("apiTokens", env, postgresBundle),
    oauthPending: pickAggregate("oauthPending", env, postgresBundle),
    deviceCodes: pickAggregate("deviceCodes", env, postgresBundle),
    sites: pickAggregate("sites", env, postgresBundle),
    cli: pickAggregate("cli", env, postgresBundle),
    status: pickAggregate("status", env, postgresBundle),
    enterpriseInquiries: pickAggregate("enterpriseInquiries", env, postgresBundle),
    permissionProfiles: pickAggregate("permissionProfiles", env, postgresBundle),
    policyDocuments: pickAggregate("policyDocuments", env, postgresBundle),
    integrationBindings: pickAggregate("integrationBindings", env, postgresBundle),
    accountDeletion: pickAggregate("accountDeletion", env, postgresBundle)
  };
}

/**
 * Returns the active repository bundle for this process.
 * Throws if Postgres is requested without the safety latch, without a URL,
 * or for an aggregate whose adapter is not ready.
 */
export function getRepositories(env: NodeJS.ProcessEnv = process.env): Repositories {
  const key = selectionCacheKey(env);
  if (!cached || cachedKey !== key) {
    cached = buildRepositories(env);
    cachedKey = key;
  }
  return cached;
}

/** Test helper: reset cached singleton between examples. */
export function resetRepositoryCacheForTests() {
  cached = null;
  cachedKey = null;
}

export {
  listRepositoryBackendOverrides,
  resolveRepositoryBackend,
  resolveRepositoryBackendFor
} from "@/lib/repositories/backend";
