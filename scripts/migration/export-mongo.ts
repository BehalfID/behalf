/**
 * PR C — Mongo export scaffold (NDJSON per collection).
 *
 * Usage:
 *   MONGODB_URI=... tsx scripts/migration/export-mongo.ts --out ./migration-export
 *
 * Writes one `.ndjson` file per collection under --out. Does not mutate Mongo.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mongoose from "mongoose";
import {
  EXPORT_COLLECTION_ORDER,
  dropMongoId,
  splitManagedProfilePolicy,
  toSnakeCaseRow,
  transformAccount,
  transformAgent,
  transformApprovalRequest,
  transformPermission,
  transformTimestamps,
  transformVerificationLog,
  type ExportCollectionName,
  type JsonObject
} from "./transform";

function parseOutDir(argv: string[]): string {
  const idx = argv.indexOf("--out");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]!;
  return join(process.cwd(), "migration-export");
}

function modelNameForCollection(collection: ExportCollectionName): string | null {
  const map: Partial<Record<ExportCollectionName, string>> = {
    accounts: "Account",
    developer_users: "DeveloperUser",
    oauth_pending_signups: "OAuthPendingSignup",
    developer_sessions: "DeveloperSession",
    developer_api_tokens: "DeveloperApiToken",
    account_memberships: "AccountMembership",
    account_invites: "AccountInvite",
    device_codes: "DeviceCode",
    agents: "Agent",
    permissions: "Permission",
    permission_profiles: "PermissionProfile",
    approval_requests: "ApprovalRequest",
    webhook_endpoints: "WebhookEndpoint",
    webhook_events: "WebhookEvent",
    webhook_deliveries: "WebhookDelivery",
    stripe_webhook_events: "StripeWebhookEvent",
    enterprise_inquiries: "EnterpriseInquiry",
    managed_profile_policies: "ManagedProfilePolicy",
    cli_pause_leases: "CliPauseLease",
    cli_audit_activities: "CliAuditLog",
    sites: "Site",
    site_access_rules: "SiteAccessRule",
    site_guard_keys: "SiteGuardKey",
    status_components: "StatusComponent",
    status_incidents: "StatusIncident",
    verification_logs: "VerificationLog",
    site_access_logs: "SiteAccessLog"
  };
  return map[collection] ?? null;
}

function transformGeneric(doc: JsonObject): JsonObject {
  return toSnakeCaseRow(transformTimestamps(dropMongoId(doc)));
}

async function exportCollection(collection: ExportCollectionName, outDir: string): Promise<number> {
  if (collection === "managed_profile_protected_repos") {
    return 0;
  }

  const modelName = modelNameForCollection(collection);
  if (!modelName) {
    writeFileSync(join(outDir, `${collection}.ndjson`), "");
    return 0;
  }

  await import(`../../models/${modelName}`);
  const model = mongoose.models[modelName];
  if (!model) {
    writeFileSync(join(outDir, `${collection}.ndjson`), "");
    return 0;
  }

  const cursor = model.find({}).lean().cursor();
  const lines: string[] = [];
  const protectedRepoLines: string[] = [];

  for await (const doc of cursor) {
    const raw = doc as JsonObject;
    if (collection === "managed_profile_policies") {
      const split = splitManagedProfilePolicy(raw);
      lines.push(JSON.stringify(split.policy));
      for (const repo of split.protectedRepos) {
        protectedRepoLines.push(JSON.stringify(repo));
      }
      continue;
    }

    let transformed: JsonObject;
    switch (collection) {
      case "accounts":
        transformed = transformAccount(raw);
        break;
      case "agents":
        transformed = transformAgent(raw);
        break;
      case "permissions":
        transformed = transformPermission(raw);
        break;
      case "approval_requests":
        transformed = transformApprovalRequest(raw);
        break;
      case "verification_logs":
        transformed = transformVerificationLog(raw);
        break;
      default:
        transformed = transformGeneric(raw);
    }
    lines.push(JSON.stringify(transformed));
  }

  writeFileSync(join(outDir, `${collection}.ndjson`), lines.length ? `${lines.join("\n")}\n` : "");
  if (collection === "managed_profile_policies") {
    writeFileSync(
      join(outDir, "managed_profile_protected_repos.ndjson"),
      protectedRepoLines.length ? `${protectedRepoLines.join("\n")}\n` : ""
    );
  }
  return lines.length;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required for export-mongo.ts");
  }

  const outDir = parseOutDir(process.argv.slice(2));
  mkdirSync(outDir, { recursive: true });
  await mongoose.connect(uri, { bufferCommands: false });

  const summary: Array<{ collection: string; rows: number }> = [];
  for (const collection of EXPORT_COLLECTION_ORDER) {
    if (collection === "managed_profile_protected_repos") continue;
    const rows = await exportCollection(collection, outDir);
    summary.push({ collection, rows });
  }

  writeFileSync(join(outDir, "export-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Exported ${summary.length} collections to ${outDir}`);
  await mongoose.disconnect();
}

const isDirectRun = process.argv[1]?.includes("export-mongo");
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { exportCollection, parseOutDir };
