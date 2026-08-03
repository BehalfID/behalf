import { randomBytes } from "node:crypto";
import { connectToDatabase } from "@/lib/db";
import {
  auditMcpConfig,
  buildInventory,
  emptyOverview,
  type McpEcosystemOverview,
  type McpInventory,
} from "@/lib/mcpEcosystem";
import { findCatalogEntry } from "@/lib/mcpEcosystemCatalog";
import {
  findMcpEcosystemSnapshotByAccountId,
  upsertMcpEcosystemSnapshot,
} from "@/lib/repositories/mcpEcosystem";
import type { McpAuditReport } from "@behalfid/mcp-audit";

function newSnapshotId() {
  return `mcp_snap_${randomBytes(10).toString("hex")}`;
}

function hydrateInventory(raw: unknown): McpInventory | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const inv = raw as Record<string, unknown>;
  const serversRaw = Array.isArray(inv.servers) ? inv.servers : [];
  const servers = serversRaw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => {
      const name = String(s.name ?? "");
      const catalogId = typeof s.catalogId === "string" ? s.catalogId : name;
      return {
        name,
        wrapStatus: (s.wrapStatus as McpInventory["servers"][number]["wrapStatus"]) ?? "unknown",
        command: typeof s.command === "string" ? s.command : undefined,
        url: typeof s.url === "string" ? s.url : undefined,
        catalog: findCatalogEntry(catalogId) ?? findCatalogEntry(name),
        downstreamCommand:
          typeof s.downstreamCommand === "string" ? s.downstreamCommand : null,
      };
    });

  return {
    sourcePath: typeof inv.sourcePath === "string" ? inv.sourcePath : ".mcp.json",
    servers,
    wrappedCount: typeof inv.wrappedCount === "number" ? inv.wrappedCount : servers.filter((s) => s.wrapStatus === "wrapped").length,
    wrappableCount:
      typeof inv.wrappableCount === "number"
        ? inv.wrappableCount
        : servers.filter((s) => s.wrapStatus === "wrappable").length,
    urlOnlyCount:
      typeof inv.urlOnlyCount === "number"
        ? inv.urlOnlyCount
        : servers.filter((s) => s.wrapStatus === "url-only").length,
    hasAdvisoryBehalfid:
      typeof inv.hasAdvisoryBehalfid === "boolean"
        ? inv.hasAdvisoryBehalfid
        : servers.some((s) => s.wrapStatus === "advisory-behalfid"),
  };
}

function serializeSnapshot(doc: Record<string, unknown> | null): McpEcosystemOverview["snapshot"] {
  if (!doc) return null;
  return {
    accountId: String(doc.accountId ?? ""),
    sourcePath: typeof doc.sourcePath === "string" ? doc.sourcePath : null,
    securityScore: typeof doc.securityScore === "number" ? doc.securityScore : null,
    inventory: hydrateInventory(doc.inventory),
    reportSummary: (doc.reportSummary as McpAuditReport["summary"] | null) ?? null,
    findings: (doc.findings as McpAuditReport["findings"] | null) ?? null,
    updatedAt:
      doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : typeof doc.updatedAt === "string"
          ? doc.updatedAt
          : null,
    syncSource: doc.syncSource === "cli" || doc.syncSource === "dashboard" ? doc.syncSource : null,
  };
}

export async function getMcpEcosystemOverview(accountId: string): Promise<McpEcosystemOverview> {
  await connectToDatabase();
  const doc = await findMcpEcosystemSnapshotByAccountId(accountId);
  return {
    ...emptyOverview(),
    snapshot: serializeSnapshot(doc as Record<string, unknown> | null),
  };
}

export async function saveMcpAuditSnapshot(input: {
  accountId: string;
  rawConfig: unknown;
  sourcePath?: string;
  syncSource: "cli" | "dashboard";
  trustedServers?: string[];
}) {
  await connectToDatabase();
  const { report, inventory } = await auditMcpConfig(input.rawConfig, {
    sourcePath: input.sourcePath,
    trustedServers: input.trustedServers,
  });

  const existing = await findMcpEcosystemSnapshotByAccountId(input.accountId);
  const snapshotId =
    existing && typeof (existing as { snapshotId?: string }).snapshotId === "string"
      ? (existing as { snapshotId: string }).snapshotId
      : newSnapshotId();

  const saved = await upsertMcpEcosystemSnapshot(input.accountId, snapshotId, {
    sourcePath: input.sourcePath ?? inventory.sourcePath,
    syncSource: input.syncSource,
    securityScore: report.summary.securityScore,
    inventory: {
      sourcePath: inventory.sourcePath,
      servers: inventory.servers.map((s) => ({
        name: s.name,
        wrapStatus: s.wrapStatus,
        command: s.command,
        url: s.url,
        catalogId: s.catalog?.id,
        downstreamCommand: s.downstreamCommand ?? undefined,
      })),
      wrappedCount: inventory.wrappedCount,
      wrappableCount: inventory.wrappableCount,
      urlOnlyCount: inventory.urlOnlyCount,
      hasAdvisoryBehalfid: inventory.hasAdvisoryBehalfid,
    },
    reportSummary: report.summary,
    findings: report.findings.slice(0, 100),
  });

  return {
    report,
    inventory,
    snapshot: serializeSnapshot(saved as Record<string, unknown>),
  };
}

export async function saveInventoryOnlySnapshot(input: {
  accountId: string;
  rawConfig: unknown;
  sourcePath?: string;
  syncSource: "cli" | "dashboard";
  report?: McpAuditReport;
}) {
  await connectToDatabase();
  const inventory = buildInventory(input.rawConfig, input.sourcePath ?? ".mcp.json");
  const existing = await findMcpEcosystemSnapshotByAccountId(input.accountId);
  const snapshotId =
    existing && typeof (existing as { snapshotId?: string }).snapshotId === "string"
      ? (existing as { snapshotId: string }).snapshotId
      : newSnapshotId();

  const saved = await upsertMcpEcosystemSnapshot(input.accountId, snapshotId, {
    sourcePath: input.sourcePath ?? inventory.sourcePath,
    syncSource: input.syncSource,
    securityScore: input.report?.summary.securityScore ?? existing?.securityScore ?? null,
    inventory: {
      sourcePath: inventory.sourcePath,
      servers: inventory.servers.map((s) => ({
        name: s.name,
        wrapStatus: s.wrapStatus,
        command: s.command,
        url: s.url,
        catalogId: s.catalog?.id,
        downstreamCommand: s.downstreamCommand ?? undefined,
      })),
      wrappedCount: inventory.wrappedCount,
      wrappableCount: inventory.wrappableCount,
      urlOnlyCount: inventory.urlOnlyCount,
      hasAdvisoryBehalfid: inventory.hasAdvisoryBehalfid,
    },
    reportSummary: input.report?.summary ?? existing?.reportSummary ?? null,
    findings: input.report?.findings?.slice(0, 100) ?? existing?.findings ?? [],
  });

  return {
    inventory,
    snapshot: serializeSnapshot(saved as Record<string, unknown>),
  };
}
