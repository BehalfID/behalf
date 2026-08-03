"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoadingState,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import { haptic } from "@/lib/haptic";
import type { McpCatalogEntry } from "@/lib/mcpEcosystemCatalog";
import type { McpInventory } from "@/lib/mcpEcosystem";

type Layer = {
  id: string;
  title: string;
  summary: string;
  command: string;
};

type Finding = {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  serverName?: string;
  remediation?: string;
};

type Snapshot = {
  accountId: string;
  sourcePath: string | null;
  securityScore: number | null;
  inventory: McpInventory | null;
  reportSummary: {
    securityScore: number;
    totalFindings: number;
    bySeverity: Record<string, number>;
    serverCount: number;
  } | null;
  findings: Finding[] | null;
  updatedAt: string | null;
  syncSource: "cli" | "dashboard" | null;
};

type OverviewResponse = {
  layers: Layer[];
  catalog: McpCatalogEntry[];
  snapshot: Snapshot | null;
  wrapDefaults: {
    installCommand: string;
    auditCommand: string;
    statusCommand: string;
  };
  guidance: {
    wrapAllCommand: string;
    wrapSelectedCommand: string | null;
    serversToWrap: string[];
  };
  canEdit: boolean;
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

function scoreTone(score: number | null) {
  if (score === null) return "neutral";
  if (score >= 85) return "good";
  if (score >= 60) return "warn";
  return "bad";
}

function wrapLabel(status: string) {
  switch (status) {
    case "wrapped":
      return "Wrapped";
    case "wrappable":
      return "Needs wrap";
    case "url-only":
      return "URL / SSE";
    case "advisory-behalfid":
      return "Advisory";
    default:
      return status;
  }
}

export function McpEcosystemView() {
  const { apiJson, href } = useDashboardApi();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configText, setConfigText] = useState('{\n  "mcpServers": {}\n}');
  const [auditing, setAuditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<OverviewResponse>("/api/dashboard/mcp");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MCP ecosystem.");
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      haptic("light");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function onAudit(event: FormEvent) {
    event.preventDefault();
    if (!data?.canEdit) return;
    setAuditing(true);
    setError(null);
    try {
      const parsed = JSON.parse(configText) as unknown;
      const res = await apiJson<OverviewResponse & { ok?: boolean }>("/api/dashboard/mcp", {
        method: "POST",
        body: JSON.stringify({ config: parsed, sourcePath: ".mcp.json", syncSource: "dashboard" }),
      });
      setData(res);
      haptic("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed. Check that the JSON is valid.");
      haptic("error");
    } finally {
      setAuditing(false);
    }
  }

  if (loading && !data) {
    return <PageLoadingState label="Loading MCP control plane…" />;
  }

  const score = data?.snapshot?.securityScore ?? null;
  const inventory = data?.snapshot?.inventory ?? null;
  const findings = data?.snapshot?.findings ?? [];

  return (
    <div className="mcp-ecosystem-page">
      <PageHeader
        eyebrow="Control plane"
        title="MCP ecosystem"
        description="Audit local MCP configs, wrap third-party servers for hard enforcement, and apply mcp_tool permissions."
        action={
          <Button type="button" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error ? <Alert tone="destructive">{error}</Alert> : null}

      <div className="mcp-dashboard-grid-2">
        <Card>
          <div className="mcp-score-block">
            <p className="mcp-eyebrow">Security score</p>
            <p className={`mcp-score mcp-score--${scoreTone(score)}`}>
              {score === null ? "—" : score}
              {score !== null ? <span className="mcp-score-unit">/100</span> : null}
            </p>
            <p className="muted">
              {data?.snapshot?.updatedAt
                ? `Last sync ${new Date(data.snapshot.updatedAt).toLocaleString()} via ${data.snapshot.syncSource ?? "unknown"}`
                : "No audit synced yet. Paste a config below or run `behalf mcp audit --push`."}
            </p>
          </div>
        </Card>
        <Card>
          <p className="mcp-eyebrow">Quick commands</p>
          <ul className="mcp-command-list">
            <li>
              <code>{data?.wrapDefaults.auditCommand ?? "behalf mcp audit"}</code>
              <Button
                type="button"
                size="small"
                variant="outline"
                onClick={() => void copyText("audit", data?.wrapDefaults.auditCommand ?? "behalf mcp audit")}
              >
                {copied === "audit" ? "Copied" : "Copy"}
              </Button>
            </li>
            <li>
              <code>{data?.guidance.wrapSelectedCommand ?? data?.guidance.wrapAllCommand}</code>
              <Button
                type="button"
                size="small"
                variant="outline"
                onClick={() =>
                  void copyText(
                    "wrap",
                    data?.guidance.wrapSelectedCommand ?? data?.guidance.wrapAllCommand ?? ""
                  )
                }
              >
                {copied === "wrap" ? "Copied" : "Copy"}
              </Button>
            </li>
            <li>
              <code>{data?.wrapDefaults.statusCommand}</code>
              <Button
                type="button"
                size="small"
                variant="outline"
                onClick={() => void copyText("status", data?.wrapDefaults.statusCommand ?? "")}
              >
                {copied === "status" ? "Copied" : "Copy"}
              </Button>
            </li>
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mcp-card-title">Three enforcement layers</h2>
        <p className="muted">
          Advisory MCP alone does not intercept other tools. Use wrap for MCP tool calls and hooks for local shell/file actions.
        </p>
        <div className="mcp-layer-grid">
          {(data?.layers ?? []).map((layer) => (
            <div key={layer.id} className="mcp-layer">
              <h3>{layer.title}</h3>
              <p>{layer.summary}</p>
              <code>{layer.command}</code>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mcp-card-title">Server inventory</h2>
        {!inventory || inventory.servers.length === 0 ? (
          <EmptyState
            title="No servers synced"
            description="Audit a local .mcp.json to populate inventory and wrap status."
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Server</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Catalog</TableHeader>
                  <TableHeader>Command / URL</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {inventory.servers.map((server) => (
                  <TableRow key={server.name}>
                    <TableCell>
                      <strong>{server.name}</strong>
                    </TableCell>
                    <TableCell>
                      <span className={`mcp-wrap-pill mcp-wrap-pill--${server.wrapStatus}`}>
                        {wrapLabel(server.wrapStatus)}
                      </span>
                    </TableCell>
                    <TableCell>{server.catalog?.name ?? "—"}</TableCell>
                    <TableCell className="muted">
                      {server.downstreamCommand || server.command || server.url || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Card>
        <h2 className="mcp-card-title">Audit MCP config</h2>
        <p className="muted">
          Paste your host MCP JSON (<code>mcpServers</code> or VS Code <code>servers</code>). Secrets in env values are never required — redact them first.
        </p>
        <form className="mcp-audit-form" onSubmit={onAudit}>
          <textarea
            className="mcp-config-input"
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            rows={12}
            spellCheck={false}
            disabled={!data?.canEdit || auditing}
            aria-label="MCP configuration JSON"
          />
          <div className="mcp-form-actions">
            <Button type="submit" disabled={!data?.canEdit || auditing}>
              {auditing ? "Auditing…" : "Audit & save"}
            </Button>
            {!data?.canEdit ? (
              <span className="muted">Viewers cannot save audits.</span>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mcp-card-title">Findings</h2>
        {!findings.length ? (
          <EmptyState title="No findings" description="Run an audit to see remediation guidance." />
        ) : (
          <ul className="mcp-findings">
            {[...findings]
              .sort(
                (a, b) =>
                  SEVERITY_ORDER.indexOf(a.severity as (typeof SEVERITY_ORDER)[number]) -
                  SEVERITY_ORDER.indexOf(b.severity as (typeof SEVERITY_ORDER)[number])
              )
              .map((finding) => (
                <li key={finding.id} className={`mcp-finding mcp-finding--${finding.severity}`}>
                  <div className="mcp-finding-head">
                    <span className="mcp-finding-sev">{finding.severity}</span>
                    <strong>{finding.title}</strong>
                    {finding.serverName ? <span className="muted">{finding.serverName}</span> : null}
                  </div>
                  <p>{finding.description}</p>
                  {finding.remediation ? <p className="muted">→ {finding.remediation}</p> : null}
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mcp-card-title">Recommended servers</h2>
        <p className="muted">
          Catalog entries map to <code>mcp_tool</code> permissions with resource{" "}
          <code>mcp:{"{server}"}:*</code>. Apply templates from an agent&apos;s permission page.
        </p>
        <div className="mcp-catalog-grid">
          {(data?.catalog ?? []).map((entry) => (
            <div key={entry.id} className="mcp-catalog-card">
              <div className="mcp-catalog-head">
                <h3>{entry.name}</h3>
                <span className={`mcp-risk mcp-risk--${entry.risk}`}>{entry.risk}</span>
              </div>
              <p>{entry.tagline}</p>
              <p className="muted">{entry.description}</p>
              <code>{entry.resourcePattern}</code>
              {!entry.wrapSupported ? (
                <p className="muted">URL/SSE wrap not available yet.</p>
              ) : null}
            </div>
          ))}
        </div>
        <p className="muted mcp-next-step">
          Next: create permissions with the{" "}
          <Link href={href("/agents")}>MCP tool templates</Link> on an agent, then wrap with{" "}
          <code>behalf mcp wrap --run</code>.
        </p>
      </Card>
    </div>
  );
}
