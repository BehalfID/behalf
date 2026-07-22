/**
 * Pre-flight data-quality report before Mongo → Postgres import (PR C / risk #5).
 *
 * Reports issues that would violate Postgres unique / NOT NULL constraints:
 * - duplicate stripe_customer_id
 * - duplicate emails (case-insensitive)
 * - null/missing account_id on agents / permissions
 * - approval pending uniqueness collisions
 * - duplicate account slug, google_sub, api_key_hash, etc.
 *
 * Usage:
 *   MONGODB_URI=... npm run migration:preflight
 *
 * Exit code 1 when any blocking issue is found.
 */

import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import DeveloperUser from "@/models/DeveloperUser";
import Permission from "@/models/Permission";

config({ path: ".env.local" });
config();

export type PreflightIssue = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  count: number;
  samples?: string[];
};

function sampleIds(ids: unknown[], limit = 5): string[] {
  return ids
    .map((id) => (typeof id === "string" ? id : String(id)))
    .filter(Boolean)
    .slice(0, limit);
}

async function findDuplicateStripeCustomerIds(): Promise<PreflightIssue | null> {
  const rows = await Account.aggregate<{
    _id: string;
    count: number;
    accountIds: string[];
  }>([
    { $match: { stripeCustomerId: { $exists: true, $nin: [null, ""] } } },
    {
      $group: {
        _id: "$stripeCustomerId",
        count: { $sum: 1 },
        accountIds: { $push: "$accountId" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (rows.length === 0) return null;
  return {
    code: "duplicate_stripe_customer_id",
    severity: "blocking",
    message: `Duplicate stripe_customer_id values (${rows.length} groups) — Postgres accounts_stripe_customer_id_uq will reject import.`,
    count: rows.length,
    samples: rows.flatMap((r) => sampleIds(r.accountIds, 3))
  };
}

async function findDuplicateEmails(): Promise<PreflightIssue | null> {
  const rows = await DeveloperUser.aggregate<{
    _id: string;
    count: number;
    userIds: string[];
    emails: string[];
  }>([
    { $match: { email: { $exists: true, $type: "string" } } },
    {
      $group: {
        _id: { $toLower: "$email" },
        count: { $sum: 1 },
        userIds: { $push: "$userId" },
        emails: { $push: "$email" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (rows.length === 0) return null;
  return {
    code: "duplicate_email_case",
    severity: "blocking",
    message: `Duplicate emails ignoring case (${rows.length} groups) — developer_users_email_lower_uq will reject import.`,
    count: rows.length,
    samples: rows.flatMap((r) => sampleIds(r.emails, 3))
  };
}

async function findMissingAccountIds(
  model: typeof Agent | typeof Permission,
  label: "agents" | "permissions"
): Promise<PreflightIssue | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = model as any;
  const missing = await query
    .find({
      $or: [{ accountId: null }, { accountId: { $exists: false } }, { accountId: "" }]
    })
    .select(label === "agents" ? "agentId" : "permissionId")
    .lean()
    .limit(50);

  if (missing.length === 0) return null;

  const total = await query.countDocuments({
    $or: [{ accountId: null }, { accountId: { $exists: false } }, { accountId: "" }]
  });

  return {
    code: `missing_account_id_${label}`,
    severity: "blocking",
    message: `${total} ${label} row(s) with null/missing account_id (risk #4) — backfill before cutover; import allows NULL but FK/tenant assumptions break.`,
    count: total,
    samples: sampleIds(
      missing.map((row: { agentId?: string; permissionId?: string }) =>
        label === "agents" ? row.agentId : row.permissionId
      )
    )
  };
}

async function findApprovalPendingCollisions(): Promise<PreflightIssue | null> {
  const rows = await ApprovalRequest.aggregate<{
    _id: {
      agentId: string | null;
      permissionId: string | null;
      action: string;
      vendor: string | null;
      amount: number | null;
      argumentFingerprint: string | null;
    };
    count: number;
    approvalIds: string[];
  }>([
    { $match: { status: "pending", kind: "agent_action" } },
    {
      $group: {
        _id: {
          agentId: "$agentId",
          permissionId: "$permissionId",
          action: "$action",
          vendor: "$vendor",
          amount: "$amount",
          argumentFingerprint: "$argumentFingerprint"
        },
        count: { $sum: 1 },
        approvalIds: { $push: "$approvalId" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (rows.length === 0) return null;
  return {
    code: "approval_pending_uniqueness_collision",
    severity: "blocking",
    message: `Pending agent_action approval tuple collisions (${rows.length} groups) — approval_requests pending unique (NULLS NOT DISTINCT + argument_fingerprint) will reject import.`,
    count: rows.length,
    samples: rows.flatMap((r) => sampleIds(r.approvalIds, 3))
  };
}

async function findDuplicateSlugs(): Promise<PreflightIssue | null> {
  const rows = await Account.aggregate<{
    _id: string;
    count: number;
    accountIds: string[];
  }>([
    { $match: { slug: { $exists: true, $nin: [null, ""] } } },
    {
      $group: {
        _id: "$slug",
        count: { $sum: 1 },
        accountIds: { $push: "$accountId" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (rows.length === 0) return null;
  return {
    code: "duplicate_account_slug",
    severity: "blocking",
    message: `Duplicate account slug values (${rows.length} groups).`,
    count: rows.length,
    samples: rows.flatMap((r) => sampleIds(r.accountIds, 3))
  };
}

async function findDuplicateGoogleSubs(): Promise<PreflightIssue | null> {
  const rows = await DeveloperUser.aggregate<{
    _id: string;
    count: number;
    userIds: string[];
  }>([
    { $match: { googleSub: { $exists: true, $nin: [null, ""] } } },
    {
      $group: {
        _id: "$googleSub",
        count: { $sum: 1 },
        userIds: { $push: "$userId" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (rows.length === 0) return null;
  return {
    code: "duplicate_google_sub",
    severity: "blocking",
    message: `Duplicate google_sub values (${rows.length} groups).`,
    count: rows.length,
    samples: rows.flatMap((r) => sampleIds(r.userIds, 3))
  };
}

export async function runPreflight(): Promise<{
  issues: PreflightIssue[];
  blocking: number;
}> {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  await connectToDatabase();

  const checks = await Promise.all([
    findDuplicateStripeCustomerIds(),
    findDuplicateEmails(),
    findMissingAccountIds(Agent, "agents"),
    findMissingAccountIds(Permission, "permissions"),
    findApprovalPendingCollisions(),
    findDuplicateSlugs(),
    findDuplicateGoogleSubs()
  ]);

  const issues = checks.filter((issue): issue is PreflightIssue => issue != null);
  const blocking = issues.filter((i) => i.severity === "blocking").length;
  return { issues, blocking };
}

export async function main(): Promise<number> {
  console.log("Mongo → Postgres preflight data-quality report");
  try {
    const { issues, blocking } = await runPreflight();

    if (issues.length === 0) {
      console.log("No data-quality issues found.");
      return 0;
    }

    for (const issue of issues) {
      const tag = issue.severity === "blocking" ? "BLOCKING" : "WARNING";
      console.log(`\n[${tag}] ${issue.code} (count=${issue.count})`);
      console.log(`  ${issue.message}`);
      if (issue.samples && issue.samples.length > 0) {
        console.log(`  samples: ${issue.samples.join(", ")}`);
      }
    }

    console.log(
      `\nSummary: ${issues.length} issue group(s), ${blocking} blocking.`
    );
    return blocking > 0 ? 1 : 0;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
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
