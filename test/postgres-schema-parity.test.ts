import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  approvalRequests,
  coreTables,
  developerSessions,
  deviceCodes,
  sites,
  siteGuardKeys
} from "@/lib/db/postgres/schema";

describe("postgres schema parity (static, Phase B′)", () => {
  it("developer sessions require lastActivityAt with default", () => {
    const columns = getTableColumns(developerSessions);
    expect(columns.lastActivityAt).toBeDefined();
    expect(columns.lastActivityAt.notNull).toBe(true);
    expect(columns.lastActivityAt.hasDefault).toBe(true);
  });

  it("approval requests include argument binding and usedAt columns", () => {
    const columns = getTableColumns(approvalRequests);
    for (const col of [
      "argumentKind",
      "argumentFingerprint",
      "argumentPreview",
      "argumentPreviewTruncated",
      "usedAt"
    ]) {
      expect(columns, col).toHaveProperty(col);
    }
  });

  it("SQL pending-approval unique index includes argument_fingerprint", () => {
    const sql = readFileSync(
      join(process.cwd(), "drizzle/0003_schema_parity.sql"),
      "utf8"
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "approval_requests_agent_action_pending_uq"[\s\S]*argument_fingerprint[\s\S]*WHERE "status" = 'pending' AND "kind" = 'agent_action'/
    );
    expect(sql).toMatch(/NULLS NOT DISTINCT/);
  });

  it("exports every previously-missing Mongo model as a table", () => {
    const expected = [
      "deviceCodes",
      "permissionProfiles",
      "webhookDeliveries",
      "stripeWebhookEvents",
      "enterpriseInquiries",
      "cliPauseLeases",
      "sites",
      "siteAccessRules",
      "siteAccessLogs",
      "siteGuardKeys",
      "statusComponents",
      "statusIncidents",
      "oauthPendingSignups",
      "policyDocuments",
      "integrationBindings",
      "collaborationMessageRefs"
    ];
    for (const key of expected) {
      expect(coreTables, key).toHaveProperty(key);
    }
  });

  it("sites enforce unique (accountId, domain)", () => {
    const config = getTableConfig(sites);
    const unique = config.indexes.find((entry) => entry.config.name === "sites_account_domain_uq");
    expect(unique?.config.unique).toBe(true);
    expect(
      unique?.config.columns.map((column) => ("name" in column ? column.name : null))
    ).toEqual(["account_id", "domain"]);
  });

  it("site guard keys enforce unique keyHash", () => {
    const columns = getTableColumns(siteGuardKeys);
    expect(columns.keyHash.notNull).toBe(true);
    expect(columns.keyHash.isUnique).toBe(true);
  });

  it("device codes enforce unique device and user codes", () => {
    const columns = getTableColumns(deviceCodes);
    expect(columns.deviceCode.isUnique).toBe(true);
    expect(columns.userCode.isUnique).toBe(true);
    expect(columns.expiresAt.notNull).toBe(true);
  });

  it("migration journal includes 0003_schema_parity", () => {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")
    ) as { entries: Array<{ tag: string }> };
    expect(journal.entries.map((entry) => entry.tag)).toContain("0003_schema_parity");
  });

  it("migration journal registers 0004_managed_profile_pause_index_parity", () => {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")
    ) as { entries: Array<{ tag: string }> };
    expect(journal.entries.map((entry) => entry.tag)).toContain(
      "0004_managed_profile_pause_index_parity"
    );
  });

  it("migration journal registers 0005_policy_and_integrations", () => {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")
    ) as { entries: Array<{ tag: string }> };
    expect(journal.entries.map((entry) => entry.tag)).toContain(
      "0005_policy_and_integrations"
    );
  });

  it("0005 creates policy and integration tables with RLS", () => {
    const sql = readFileSync(
      join(process.cwd(), "drizzle/0005_policy_and_integrations.sql"),
      "utf8"
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "policy_documents"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "integration_bindings"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "collaboration_message_refs"');
    expect(sql).toContain('ALTER TABLE "policy_documents" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "integration_bindings" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'ALTER TABLE "collaboration_message_refs" ENABLE ROW LEVEL SECURITY'
    );
  });

  it("policy documents enforce unique accountId", () => {
    const columns = getTableColumns(coreTables.policyDocuments);
    expect(columns.accountId.isUnique).toBe(true);
    expect(columns.accountId.notNull).toBe(true);
  });

  it("integration bindings enforce unique account+provider+team+channel", () => {
    const config = getTableConfig(coreTables.integrationBindings);
    const unique = config.indexes.find(
      (entry) => entry.config.name === "integration_bindings_account_provider_team_channel_uq"
    );
    expect(unique?.config.unique).toBe(true);
    expect(
      unique?.config.columns.map((column) => ("name" in column ? column.name : null))
    ).toEqual(["account_id", "provider", "team_id", "channel_id"]);
  });

  it("0004 drops the stricter managed_profile_pause unique index and keeps the non-unique lookup", () => {
    const sql = readFileSync(
      join(process.cwd(), "drizzle/0004_managed_profile_pause_index_parity.sql"),
      "utf8"
    );
    // Drops the Postgres-only stricter unique index shipped in 0000.
    expect(sql).toMatch(
      /DROP INDEX IF EXISTS "approval_requests_managed_profile_pause_pending_uq"/
    );
    // Adds/ensures the Mongo-equivalent NON-unique compound lookup index.
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS "approval_requests_pause_pending_lookup_idx"[\s\S]*"account_id"[\s\S]*"developer_user_id"[\s\S]*"kind"[\s\S]*"pause_tool"[\s\S]*"pause_scope"[\s\S]*"pause_repo"[\s\S]*"pause_device_id"[\s\S]*"status"/
    );
    // Non-unique: must not recreate a UNIQUE index for this tuple.
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX[^;]*managed_profile_pause/);
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX[^;]*pause_pending_lookup/);
  });

  it("Drizzle schema declares managed_profile_pause pending lookup as NON-unique", () => {
    const config = getTableConfig(approvalRequests);
    const lookup = config.indexes.find(
      (entry) => entry.config.name === "approval_requests_pause_pending_lookup_idx"
    );
    expect(lookup).toBeDefined();
    expect(lookup?.config.unique).toBe(false);
    expect(
      lookup?.config.columns.map((column) => ("name" in column ? column.name : null))
    ).toEqual([
      "account_id",
      "developer_user_id",
      "kind",
      "pause_tool",
      "pause_scope",
      "pause_repo",
      "pause_device_id",
      "status"
    ]);
  });

  it("no migration retains a UNIQUE managed_profile_pause pending index after 0004", () => {
    const initial = readFileSync(
      join(process.cwd(), "drizzle/0000_initial_behalf_schema.sql"),
      "utf8"
    );
    // 0000 (unchanged) still ships the stricter unique index...
    expect(initial).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_managed_profile_pause_pending_uq"/
    );
    // ...but the latest migration drops it, so the final state is non-unique.
    const latest = readFileSync(
      join(process.cwd(), "drizzle/0004_managed_profile_pause_index_parity.sql"),
      "utf8"
    );
    expect(latest).toMatch(
      /DROP INDEX IF EXISTS "approval_requests_managed_profile_pause_pending_uq"/
    );
  });

  it("TTL cleanup SQL covers all three Mongo TTL collections", () => {
    const sql = readFileSync(
      join(process.cwd(), "drizzle/0003_schema_parity.sql"),
      "utf8"
    );
    expect(sql).toContain("behalf_purge_expired_developer_sessions");
    expect(sql).toContain("behalf_purge_expired_device_codes");
    expect(sql).toContain("behalf_purge_expired_oauth_pending_signups");
    expect(sql).toContain("behalf_schedule_ttl_cleanup");
  });
});
