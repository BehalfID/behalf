/**
 * Static Postgres vs Mongo repository parity audit.
 *
 * Ground truth is the actual runtime binding produced by
 * `createPostgresRuntimeRepositories` (see `./runtime`), not a source-text
 * parse — this reflects exactly what a caller gets when
 * `BEHALFID_REPOSITORY_BACKEND=postgres` is selected.
 *
 * For every function exported from a Mongo aggregate module we require one of:
 *  - the aggregate.method pair is an allowlisted intentional gap
 *    (see `./intentionalGaps`), or
 *  - the runtime-bound method is a real implementation (not the
 *    `notImplemented` stub `makePostgresAggregate` installs for unbound keys).
 */
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import * as mongoAccounts from "@/lib/repositories/mongo/accounts";
import * as mongoAgents from "@/lib/repositories/mongo/agents";
import * as mongoMemberships from "@/lib/repositories/mongo/memberships";
import * as mongoManagedProfiles from "@/lib/repositories/mongo/managedProfiles";
import * as mongoPermissions from "@/lib/repositories/mongo/permissions";
import * as mongoApprovals from "@/lib/repositories/mongo/approvals";
import * as mongoVerificationLogs from "@/lib/repositories/mongo/verificationLogs";
import * as mongoWebhooks from "@/lib/repositories/mongo/webhooks";
import * as mongoStripeEvents from "@/lib/repositories/mongo/stripeEvents";
import * as mongoUsers from "@/lib/repositories/mongo/users";
import * as mongoSessions from "@/lib/repositories/mongo/sessions";
import * as mongoApiTokens from "@/lib/repositories/mongo/apiTokens";
import * as mongoOauthPending from "@/lib/repositories/mongo/oauthPending";
import * as mongoDeviceCodes from "@/lib/repositories/mongo/deviceCodes";
import * as mongoSites from "@/lib/repositories/mongo/sites";
import * as mongoCli from "@/lib/repositories/mongo/cli";
import * as mongoStatus from "@/lib/repositories/mongo/status";
import * as mongoEnterpriseInquiries from "@/lib/repositories/mongo/enterpriseInquiries";
import * as mongoPermissionProfiles from "@/lib/repositories/mongo/permissionProfiles";
import * as mongoPolicyDocuments from "@/lib/repositories/mongo/policyDocuments";
import * as mongoIntegrationBindings from "@/lib/repositories/mongo/integrationBindings";
import * as mongoAccountDeletion from "@/lib/repositories/mongo/accountDeletion";
import {
  createPostgresRuntimeRepositories,
  POSTGRES_READY_AGGREGATES,
  type PostgresReadyAggregate
} from "@/lib/repositories/postgres/runtime";
import { isIntentionalPostgresGap } from "@/lib/repositories/postgres/intentionalGaps";

const MONGO_MODULES: Record<PostgresReadyAggregate, Record<string, unknown>> = {
  accounts: mongoAccounts,
  agents: mongoAgents,
  memberships: mongoMemberships,
  managedProfiles: mongoManagedProfiles,
  permissions: mongoPermissions,
  approvals: mongoApprovals,
  verificationLogs: mongoVerificationLogs,
  webhooks: mongoWebhooks,
  stripeEvents: mongoStripeEvents,
  users: mongoUsers,
  sessions: mongoSessions,
  apiTokens: mongoApiTokens,
  oauthPending: mongoOauthPending,
  deviceCodes: mongoDeviceCodes,
  sites: mongoSites,
  cli: mongoCli,
  status: mongoStatus,
  enterpriseInquiries: mongoEnterpriseInquiries,
  permissionProfiles: mongoPermissionProfiles,
  policyDocuments: mongoPolicyDocuments,
  integrationBindings: mongoIntegrationBindings,
  accountDeletion: mongoAccountDeletion
};

/** Marker embedded in `runtime.ts`'s `notImplemented()` stub source text. */
const STUB_MARKER = "is not implemented on postgres";

/**
 * Runtime binding never touches the db at bind time (every implementation is
 * wrapped in a closure or is a pure helper), so a placeholder is safe here —
 * this audit performs no I/O.
 */
const PLACEHOLDER_DB = {} as BehalfPostgresDb;

export type PostgresRepositoryParityResult = {
  /** `aggregate.method` pairs missing a real Postgres implementation. */
  missing: string[];
  /** `aggregate.method` pairs allowlisted as intentional Postgres gaps. */
  intentional: string[];
  /** Count of Mongo function exports with a real Postgres implementation. */
  bound: number;
  /** Total count of Mongo function exports across ready aggregates. */
  mongoFunctions: number;
};

export function auditPostgresRepositoryParity(): PostgresRepositoryParityResult {
  const runtime = createPostgresRuntimeRepositories(PLACEHOLDER_DB) as Record<
    string,
    Record<string, unknown>
  >;

  const missing: string[] = [];
  const intentional: string[] = [];
  let bound = 0;
  let mongoFunctions = 0;

  for (const aggregate of POSTGRES_READY_AGGREGATES) {
    const mongoModule = MONGO_MODULES[aggregate];
    const runtimeModule = runtime[aggregate] ?? {};

    for (const key of Object.keys(mongoModule)) {
      const value = mongoModule[key];
      if (typeof value !== "function") continue;
      mongoFunctions++;

      if (isIntentionalPostgresGap(aggregate, key)) {
        intentional.push(`${aggregate}.${key}`);
        continue;
      }

      const boundFn = runtimeModule[key];
      const isStub =
        typeof boundFn === "function" && boundFn.toString().includes(STUB_MARKER);

      if (typeof boundFn === "function" && !isStub) {
        bound++;
      } else {
        missing.push(`${aggregate}.${key}`);
      }
    }
  }

  missing.sort();
  intentional.sort();

  return { missing, intentional, bound, mongoFunctions };
}
