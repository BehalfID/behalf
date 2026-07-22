/**
 * Export Mongo collections to NDJSON for Postgres import (PR C).
 *
 * Usage:
 *   MONGODB_URI=... npm run migration:export -- --out ./migration-data
 *
 * Transforms: drop `_id`/`__v`, Dates → ISO, ObjectIds → strings, camelCase → snake_case.
 * ManagedProfilePolicy.protectedRepos[] is split into managed_profile_protected_repos rows.
 * CliAuditLog → cli_audit_activities.ndjson.
 * PolicyDocument, IntegrationBinding, CollaborationMessageRef are exported even without PG tables.
 */

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import mongoose from "mongoose";
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
import IntegrationBinding, {
  CollaborationMessageRef
} from "@/models/IntegrationBinding";
import ManagedProfilePolicy from "@/models/ManagedProfilePolicy";
import OAuthPendingSignup from "@/models/OAuthPendingSignup";
import Permission from "@/models/Permission";
import PermissionProfile from "@/models/PermissionProfile";
import PolicyDocument from "@/models/PolicyDocument";
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
import {
  EXPORT_TABLE_ORDER,
  ndjsonPath,
  splitManagedProfileProtectedRepos,
  transformDocument,
  type ExportTableName
} from "./lib/transform";

config({ path: ".env.local" });
config();

type LeanDoc = Record<string, unknown>;

type ModelLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  find: (filter?: object) => any;
};

function parseOutDir(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--out requires a directory path.");
      }
      return path.resolve(value);
    }
  }
  throw new Error("Missing required --out <directory>.");
}

async function* leanCursor(
  model: ModelLike,
  options?: { select?: string }
): AsyncGenerator<LeanDoc> {
  let query = model.find({});
  if (options?.select) {
    query = query.select(options.select);
  }
  const cursor = query.lean().cursor();
  for await (const doc of cursor) {
    yield doc as LeanDoc;
  }
}

async function* mapDocs(
  model: ModelLike,
  options?: { select?: string }
): AsyncGenerator<LeanDoc> {
  for await (const doc of leanCursor(model, options)) {
    yield transformDocument(doc);
  }
}

async function writeNdjsonFile(
  filePath: string,
  rows: AsyncIterable<LeanDoc> | LeanDoc[]
): Promise<number> {
  let count = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(filePath, { encoding: "utf8" });
    stream.on("error", reject);
    stream.on("finish", () => resolve());

    void (async () => {
      try {
        if (Array.isArray(rows)) {
          for (const row of rows) {
            stream.write(`${JSON.stringify(row)}\n`);
            count += 1;
          }
        } else {
          for await (const row of rows) {
            stream.write(`${JSON.stringify(row)}\n`);
            count += 1;
          }
        }
        stream.end();
      } catch (error) {
        stream.destroy(error as Error);
      }
    })();
  });
  return count;
}

type RowSource = () => AsyncIterable<LeanDoc> | Promise<LeanDoc[]>;

export async function runExport(outDir: string): Promise<Record<string, number>> {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  await mkdir(outDir, { recursive: true });
  await connectToDatabase();

  const managedPolicies: LeanDoc[] = [];
  const protectedRepos: LeanDoc[] = [];
  for await (const doc of leanCursor(ManagedProfilePolicy)) {
    const split = splitManagedProfileProtectedRepos(doc);
    managedPolicies.push(split.policy);
    protectedRepos.push(...split.protectedRepos);
  }

  const sources: Record<ExportTableName, RowSource> = {
    accounts: () => mapDocs(Account),
    developer_users: () =>
      mapDocs(DeveloperUser, {
        select:
          "+passwordHash +googleSub +phone +dateOfBirth +emailVerificationTokenHash +emailVerificationTokenExpiresAt +emailVerificationCodeHash +passwordResetTokenHash +passwordResetTokenExpiresAt"
      }),
    oauth_pending_signups: () => mapDocs(OAuthPendingSignup, { select: "+tokenHash" }),
    developer_sessions: () => mapDocs(DeveloperSession),
    developer_api_tokens: () => mapDocs(DeveloperApiToken, { select: "+tokenHash" }),
    account_memberships: () => mapDocs(AccountMembership),
    account_invites: () =>
      mapDocs(AccountInvite, { select: "+inviteTokenHash +inviteTokenExpiresAt" }),
    device_codes: () => mapDocs(DeviceCode),
    agents: () => mapDocs(Agent, { select: "+apiKeyHash +publicPassportTokenHash" }),
    permissions: () => mapDocs(Permission),
    permission_profiles: () => mapDocs(PermissionProfile),
    approval_requests: () => mapDocs(ApprovalRequest),
    webhook_endpoints: () => mapDocs(WebhookEndpoint, { select: "+secretHash" }),
    webhook_events: () => mapDocs(WebhookEvent),
    managed_profile_policies: async () => managedPolicies,
    managed_profile_protected_repos: async () => protectedRepos,
    cli_pause_leases: () => mapDocs(CliPauseLease),
    sites: () => mapDocs(Site),
    site_access_rules: () => mapDocs(SiteAccessRule),
    site_guard_keys: () => mapDocs(SiteGuardKey, { select: "+keyHash" }),
    stripe_webhook_events: () => mapDocs(StripeWebhookEvent),
    enterprise_inquiries: () => mapDocs(EnterpriseInquiry),
    status_components: () => mapDocs(StatusComponent),
    status_incidents: () => mapDocs(StatusIncident),
    verification_logs: () => mapDocs(VerificationLog),
    webhook_deliveries: () => mapDocs(WebhookDelivery),
    // Mongo CliAuditLog → filename cli_audit_activities
    cli_audit_activities: () => mapDocs(CliAuditLog),
    site_access_logs: () => mapDocs(SiteAccessLog),
    policy_documents: () => mapDocs(PolicyDocument),
    integration_bindings: () =>
      mapDocs(IntegrationBinding, { select: "+botToken +signingSecret" }),
    collaboration_message_refs: () => mapDocs(CollaborationMessageRef)
  };

  const counts: Record<string, number> = {};
  for (const table of EXPORT_TABLE_ORDER) {
    const filePath = ndjsonPath(outDir, table);
    const rows = await sources[table]();
    const count = await writeNdjsonFile(filePath, rows);
    counts[table] = count;
    console.log(`${table}: ${count} rows → ${filePath}`);
  }

  return counts;
}

async function main() {
  const outDir = parseOutDir(process.argv.slice(2));
  console.log(`Exporting Mongo → NDJSON under ${outDir}`);
  try {
    const counts = await runExport(outDir);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`Done. ${total} total rows across ${Object.keys(counts).length} files.`);
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
