import type { Metadata } from "next";
import { DocsShell } from "../content";
import { CliDocsBody } from "../_shared/cliBody";

export const metadata: Metadata = {
  title: "Coding Agent Quickstart (CLI & MCP) — BehalfID",
  description: "Install BehalfID action-time hooks, advisory MCP tools, and optional Managed Profiles launch policy for Claude Code, Codex, and Cursor.",
  alternates: { canonical: "/docs/cli" }
};

export default function CliDocsPage() {
  return (
    <DocsShell
      title="Coding agent quickstart (CLI & MCP)"
      description="Install the CLI, add action-time hooks where supported, expose advisory MCP tools, and optionally apply Managed Profiles launch policy."
      previous={{ href: "/docs", label: "Overview" }}
      next={{ href: "/docs/deploy-approvals", label: "Deploy approvals" }}
    >
      <CliDocsBody />
    </DocsShell>
  );
}
