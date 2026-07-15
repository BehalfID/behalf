import { describe, expect, it } from "vitest";
import { getTableName, getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { coreTables, type CoreTableName } from "@/lib/db/postgres/schema";
import { isPostgresConfigured } from "@/lib/db/postgres";

const EXPECTED_CORE_TABLES: CoreTableName[] = [
  "accounts",
  "developerUsers",
  "developerSessions",
  "developerApiTokens",
  "accountMemberships",
  "accountInvites",
  "agents",
  "permissions",
  "approvalRequests",
  "verificationLogs",
  "webhookEndpoints",
  "webhookEvents",
  "managedProfilePolicies",
  "managedProfileProtectedRepos",
  "cliAuditActivities"
];

const EXPECTED_SQL_TABLE_NAMES = [
  "accounts",
  "developer_users",
  "developer_sessions",
  "developer_api_tokens",
  "account_memberships",
  "account_invites",
  "agents",
  "permissions",
  "approval_requests",
  "verification_logs",
  "webhook_endpoints",
  "webhook_events",
  "managed_profile_policies",
  "managed_profile_protected_repos",
  "cli_audit_activities"
];

const CRITICAL_COLUMNS: Record<string, string[]> = {
  accounts: ["accountId", "slug", "plan", "verificationCount"],
  developerUsers: ["userId", "email", "passwordHash"],
  developerSessions: ["sessionId", "userId", "tokenHash", "expiresAt"],
  developerApiTokens: ["tokenId", "userId", "accountId", "tokenHash"],
  accountMemberships: ["membershipId", "accountId", "userId", "role"],
  accountInvites: ["inviteId", "accountId", "email", "status"],
  agents: ["agentId", "accountId", "apiKeyHash", "status"],
  permissions: ["permissionId", "accountId", "agentId", "action", "constraints", "status"],
  approvalRequests: ["approvalId", "requestId", "accountId", "status", "kind"],
  verificationLogs: ["logId", "requestId", "accountId", "agentId", "allowed", "metadata"],
  webhookEndpoints: ["webhookId", "accountId", "url", "secretHash", "events", "status"],
  webhookEvents: ["eventId", "accountId", "payload", "status", "attempts"],
  managedProfilePolicies: ["policyId", "accountId", "workHours", "toolModes", "pausePolicy"],
  managedProfileProtectedRepos: ["policyId", "accountId", "repoHash", "mode"],
  cliAuditActivities: ["auditId", "accountId", "eventType", "reason", "metadata"]
};

const TENANT_SCOPED_TABLES: CoreTableName[] = [
  "developerApiTokens",
  "accountMemberships",
  "accountInvites",
  "agents",
  "permissions",
  "approvalRequests",
  "verificationLogs",
  "webhookEndpoints",
  "webhookEvents",
  "managedProfilePolicies",
  "managedProfileProtectedRepos",
  "cliAuditActivities"
];

describe("postgres schema (static)", () => {
  it("exports all core tables", () => {
    expect(Object.keys(coreTables).sort()).toEqual([...EXPECTED_CORE_TABLES].sort());
  });

  it("maps core tables to expected SQL table names", () => {
    const sqlNames = EXPECTED_CORE_TABLES.map((key) => getTableName(coreTables[key]));
    expect(sqlNames.sort()).toEqual([...EXPECTED_SQL_TABLE_NAMES].sort());
  });

  it.each(EXPECTED_CORE_TABLES)("table %s has critical columns", (tableKey) => {
    const table = coreTables[tableKey];
    const columnNames = Object.keys(getTableColumns(table));
    for (const col of CRITICAL_COLUMNS[tableKey]) {
      expect(columnNames, `${tableKey}.${col}`).toContain(col);
    }
  });

  it("tenant-scoped tables include accountId", () => {
    for (const tableKey of TENANT_SCOPED_TABLES) {
      const columns = Object.keys(getTableColumns(coreTables[tableKey]));
      expect(columns, tableKey).toContain("accountId");
    }
  });

  it("uses TEXT primary keys (no serial/uuid defaults on id columns)", () => {
    const idColumns = [
      { table: coreTables.accounts, col: "accountId" },
      { table: coreTables.developerUsers, col: "userId" },
      { table: coreTables.agents, col: "agentId" },
      { table: coreTables.permissions, col: "permissionId" }
    ];

    for (const { table, col } of idColumns) {
      const columns = getTableColumns(table);
      const column = columns[col as keyof typeof columns];
      expect(column.columnType).toBe("PgText");
      expect(column.primary).toBe(true);
    }
  });

  it("models verification log partition keys as composite constraints", () => {
    const config = getTableConfig(coreTables.verificationLogs);
    const primaryKeyColumns = config.primaryKeys.flatMap((key) =>
      key.columns.map((column) => column.name)
    );
    const requestCreatedIndex = config.indexes.find(
      (entry) => entry.config.name === "verification_logs_request_created_uq"
    );

    expect(primaryKeyColumns).toEqual(["log_id", "created_at"]);
    expect(requestCreatedIndex?.config.unique).toBe(true);
    expect(
      requestCreatedIndex?.config.columns.map((column) =>
        "name" in column ? column.name : null
      )
    ).toEqual(["request_id", "created_at"]);
  });

  it("isPostgresConfigured is false without env vars in test", () => {
    expect(isPostgresConfigured()).toBe(false);
  });
});

describe("postgres runtime isolation (static)", () => {
  const RUNTIME_GLOB_DIRS = ["app", "lib/repositories", "lib/quota.ts", "lib/verify.ts", "lib/db.ts"];

  it("app routes do not import lib/db/postgres", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");

    const offenders: string[] = [];

    function scanDir(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".next") continue;
          scanDir(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        const content = readFileSync(full, "utf8");
        if (
          content.includes("@/lib/db/postgres") ||
          content.includes("lib/db/postgres") ||
          content.includes("drizzle-orm") ||
          content.includes("getPostgresDb")
        ) {
          offenders.push(relative(process.cwd(), full));
        }
      }
    }

    scanDir(join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  });

  it("app routes do not import lib/repositories/postgres", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");

    const offenders: string[] = [];

    function scanDir(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".next") continue;
          scanDir(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        const content = readFileSync(full, "utf8");
        if (
          content.includes("@/lib/repositories/postgres") ||
          content.includes("lib/repositories/postgres")
        ) {
          offenders.push(relative(process.cwd(), full));
        }
      }
    }

    scanDir(join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  });

  it("lib/repositories/index.ts does not export postgres adapters", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const content = readFileSync(join(process.cwd(), "lib/repositories/index.ts"), "utf8");

    expect(content).not.toMatch(/repositories\/postgres/);
  });

  it("mongo repository modules do not import postgres client", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const repoDir = join(process.cwd(), "lib/repositories");

    function scanRepoFiles(dir: string): string[] {
      const files: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "postgres") continue;
          files.push(...scanRepoFiles(full));
          continue;
        }
        if (entry.endsWith(".ts")) {
          files.push(full);
        }
      }
      return files;
    }

    for (const file of scanRepoFiles(repoDir)) {
      const content = readFileSync(file, "utf8");
      expect(content, file).not.toMatch(/lib\/db\/postgres|drizzle-orm|getPostgresDb/);
    }
  });
});
