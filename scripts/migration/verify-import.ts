/**
 * Post-import verification: Mongo counts vs Postgres counts + sample checksums (PR C).
 *
 * Usage:
 *   MONGODB_URI=... DATABASE_URL=... npm run migration:verify
 *
 * Also verifies developer_sessions.last_activity_at is populated from Mongo
 * lastActivityAt when present.
 *
 * Exit code 1 on mismatch.
 */

import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import mongoose from "mongoose";
import postgres from "postgres";
import { connectToDatabase } from "@/lib/db";
import Account from "@/models/Account";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership from "@/models/AccountMembership";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import CliAuditLog from "@/models/CliAuditLog";
import CliPauseLease from "@/models/CliPauseLease";
import DeveloperApiToken from "@/models/DeveloperApiToken";
import DeveloperSession from "@/models/DeveloperSession";
import DeveloperUser from "@/models/DeveloperUser";
import DeviceCode from "@/models/DeviceCode";
import EnterpriseInquiry from "@/models/EnterpriseInquiry";
import ManagedProfilePolicy from "@/models/ManagedProfilePolicy";
import OAuthPendingSignup from "@/models/OAuthPendingSignup";
import Permission from "@/models/Permission";
import PermissionProfile from "@/models/PermissionProfile";
import Site from "@/models/Site";
import SiteAccessLog from "@/models/SiteAccessLog";
import SiteAccessRule from "@/models/SiteAccessRule";
import SiteGuardKey from "@/models/SiteGuardKey";
import StatusComponent from "@/models/StatusComponent";
import StatusIncident from "@/models/StatusIncident";
import StripeWebhookEvent from "@/models/StripeWebhookEvent";
import VerificationLog from "@/models/VerificationLog";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import WebhookEvent from "@/models/WebhookEvent";
import { checksumRow, POSTGRES_IMPORT_TABLES, type ExportTableName } from "./lib/transform";

config({ path: ".env.local" });
config();

const SAMPLE_LIMIT = 50;

/** Mongo collection count sources aligned to Postgres table names. */
const MONGO_COUNT_MODELS: Partial<
  Record<ExportTableName, { countDocuments: (filter?: object) => Promise<number> }>
> = {
  accounts: Account,
  developer_users: DeveloperUser,
  oauth_pending_signups: OAuthPendingSignup,
  developer_sessions: DeveloperSession,
  developer_api_tokens: DeveloperApiToken,
  account_memberships: AccountMembership,
  account_invites: AccountInvite,
  device_codes: DeviceCode,
  agents: Agent,
  permissions: Permission,
  permission_profiles: PermissionProfile,
  approval_requests: ApprovalRequest,
  webhook_endpoints: WebhookEndpoint,
  webhook_events: WebhookEvent,
  managed_profile_policies: ManagedProfilePolicy,
  cli_pause_leases: CliPauseLease,
  sites: Site,
  site_access_rules: SiteAccessRule,
  site_guard_keys: SiteGuardKey,
  stripe_webhook_events: StripeWebhookEvent,
  enterprise_inquiries: EnterpriseInquiry,
  status_components: StatusComponent,
  status_incidents: StatusIncident,
  verification_logs: VerificationLog,
  webhook_deliveries: WebhookDelivery,
  cli_audit_activities: CliAuditLog,
  site_access_logs: SiteAccessLog
};

const CHECKSUM_COLUMNS: Partial<Record<ExportTableName, readonly string[]>> = {
  accounts: ["account_id", "name", "plan", "stripe_customer_id"],
  developer_users: ["user_id", "email", "primary_account_id"],
  developer_sessions: ["session_id", "user_id", "token_hash", "last_activity_at"],
  agents: ["agent_id", "account_id", "api_key_hash", "status"],
  permissions: ["permission_id", "account_id", "agent_id", "action", "status"],
  approval_requests: ["approval_id", "request_id", "status", "argument_fingerprint"]
};

type VerifyMismatch = {
  table: string;
  kind: "count" | "checksum" | "last_activity_at";
  message: string;
};

async function countProtectedReposInMongo(): Promise<number> {
  const policies = await ManagedProfilePolicy.find({})
    .select("protectedRepos")
    .lean();
  let total = 0;
  for (const policy of policies) {
    const repos = (policy as { protectedRepos?: unknown[] }).protectedRepos;
    if (Array.isArray(repos)) total += repos.length;
  }
  return total;
}

async function mongoCount(table: ExportTableName): Promise<number | null> {
  if (table === "managed_profile_protected_repos") {
    return countProtectedReposInMongo();
  }
  const model = MONGO_COUNT_MODELS[table];
  if (!model) return null;
  return model.countDocuments({});
}

async function pgCount(sql: postgres.Sql, table: string): Promise<number> {
  const [{ count }] = await sql<{ count: string }[]>`
    select count(*)::text as count from ${sql(table)}
  `;
  return Number(count);
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return null;
}

async function verifySessionLastActivity(
  sql: postgres.Sql
): Promise<VerifyMismatch[]> {
  const mismatches: VerifyMismatch[] = [];
  const sessions = await DeveloperSession.find({})
    .select("sessionId lastActivityAt")
    .lean()
    .limit(SAMPLE_LIMIT);

  for (const session of sessions) {
    const sessionId = (session as { sessionId: string }).sessionId;
    const mongoIso = toIso((session as { lastActivityAt?: Date }).lastActivityAt);
    if (!mongoIso) continue;

    const rows = await sql<{ last_activity_at: Date | string | null }[]>`
      select last_activity_at from developer_sessions where session_id = ${sessionId} limit 1
    `;
    if (rows.length === 0) {
      mismatches.push({
        table: "developer_sessions",
        kind: "last_activity_at",
        message: `session ${sessionId} missing in Postgres`
      });
      continue;
    }
    const pgIso = toIso(rows[0].last_activity_at);
    if (pgIso !== mongoIso) {
      mismatches.push({
        table: "developer_sessions",
        kind: "last_activity_at",
        message: `session ${sessionId}: Mongo lastActivityAt=${mongoIso} vs PG last_activity_at=${pgIso}`
      });
    }
  }

  return mismatches;
}

async function verifyChecksumSample(
  sql: postgres.Sql,
  table: ExportTableName,
  columns: readonly string[]
): Promise<VerifyMismatch[]> {
  const mismatches: VerifyMismatch[] = [];
  const pkGuess = columns[0];
  if (!pkGuess) return mismatches;

  const pgRows = await sql.unsafe(
    `select ${columns.map((c) => `"${c}"`).join(", ")} from "${table}" order by "${pkGuess}" asc limit ${SAMPLE_LIMIT}`
  );

  // Build Mongo samples via transformed field names is table-specific; use accounts/agents/etc.
  // For simplicity, compare PG row checksum stability + Mongo count already checked.
  // Deep equality: load matching Mongo docs by PK when we know the mapping.
  const mongoPkCamel = pkGuess.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

  const model = MONGO_COUNT_MODELS[table];
  if (!model || !("find" in model)) {
    return mismatches;
  }

  for (const pgRow of pgRows as Record<string, unknown>[]) {
    const pkValue = pgRow[pkGuess];
    if (typeof pkValue !== "string") continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mongoDoc = await (model as any).findOne({ [mongoPkCamel]: pkValue }).lean();
    if (!mongoDoc) {
      mismatches.push({
        table,
        kind: "checksum",
        message: `Postgres ${pkGuess}=${pkValue} has no Mongo counterpart`
      });
      continue;
    }

    const mongoSnake: Record<string, unknown> = {};
    for (const col of columns) {
      const camel = col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      let value = (mongoDoc as Record<string, unknown>)[camel];
      if (value instanceof Date) value = value.toISOString();
      mongoSnake[col] = value ?? null;
    }

    const pgNorm: Record<string, unknown> = {};
    for (const col of columns) {
      let value = pgRow[col];
      if (value instanceof Date) value = value.toISOString();
      pgNorm[col] = value ?? null;
    }

    if (checksumRow(mongoSnake, columns) !== checksumRow(pgNorm, columns)) {
      mismatches.push({
        table,
        kind: "checksum",
        message: `checksum mismatch for ${pkGuess}=${pkValue}`
      });
    }
  }

  return mismatches;
}

export async function runVerify(): Promise<{
  mismatches: VerifyMismatch[];
  counts: Record<string, { mongo: number; postgres: number }>;
}> {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL (or POSTGRES_URL) environment variable.");
  }

  await connectToDatabase();
  const sql = postgres(databaseUrl, { max: 1 });
  const mismatches: VerifyMismatch[] = [];
  const counts: Record<string, { mongo: number; postgres: number }> = {};

  try {
    for (const table of POSTGRES_IMPORT_TABLES) {
      const mongo = await mongoCount(table);
      if (mongo == null) continue;
      const postgresCount = await pgCount(sql, table);
      counts[table] = { mongo, postgres: postgresCount };
      if (mongo !== postgresCount) {
        mismatches.push({
          table,
          kind: "count",
          message: `count mismatch: Mongo=${mongo} Postgres=${postgresCount}`
        });
      } else {
        console.log(`ok ${table}: ${mongo}`);
      }
    }

    for (const [table, columns] of Object.entries(CHECKSUM_COLUMNS) as [
      ExportTableName,
      readonly string[]
    ][]) {
      const sampleMismatches = await verifyChecksumSample(sql, table, columns);
      mismatches.push(...sampleMismatches);
    }

    mismatches.push(...(await verifySessionLastActivity(sql)));
  } finally {
    await sql.end({ timeout: 5 });
    await mongoose.disconnect().catch(() => undefined);
  }

  return { mismatches, counts };
}

export async function main(): Promise<number> {
  console.log("Verifying Mongo vs Postgres import");
  const { mismatches } = await runVerify();

  if (mismatches.length === 0) {
    console.log("All checks passed.");
    return 0;
  }

  console.log(`\n${mismatches.length} mismatch(es):`);
  for (const m of mismatches) {
    console.log(`  [${m.kind}] ${m.table}: ${m.message}`);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
