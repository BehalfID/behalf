import Link from "next/link";
import type { Metadata } from "next";
import { DocsShell } from "./content";

export const metadata: Metadata = {
  title: "Docs — BehalfID",
  description: "Stop coding agents from deploying to production, running migrations, or deleting files without your approval. CLI/MCP or Managed Profiles setup for Claude Code, Codex, and Cursor; SDK for custom agents.",
  alternates: { canonical: "/docs" }
};

const cards = [
  { href: "/docs/cli", title: "Coding agent quickstart (CLI/MCP)", body: "Install the behalf CLI, wire up MCP enforcement or Managed Profiles shims, and launch Claude Code, Codex, or Cursor with workspace policy active." },
  { href: "/docs/demo-script", title: "Demo scripts", body: "Fresh-workspace Managed Profiles smoke test plus terminal-first scripts for recording demos (2–3 min) and deploy approvals (60–90 sec)." },
  { href: "/docs/deploy-approvals", title: "Deploy approvals", body: "Full walkthrough: coding agent attempts production deploy → BehalfID blocks → you approve in the dashboard → agent retries → deploy runs." },
  { href: "/docs/quickstart", title: "SDK quickstart", body: "Create an agent, add a permission, install the SDK, call verify() before execution, and test allowed and denied requests from any Node.js app." },
  { href: "/docs/sdk", title: "SDK", body: "Install the JavaScript SDK from npm and call behalf.verify() before tool execution from Node 18+." },
  { href: "/docs/api", title: "API Reference", body: "Use public REST endpoints for agents, permissions, verification, logs, and key rotation." },
  { href: "/docs/webhooks", title: "Webhooks", body: "Receive signed events for allowed, denied, and approval-required decisions via an outbox-backed delivery system." },
  { href: "/docs/concepts", title: "Concepts", body: "Understand permission passports, fail-closed enforcement, approval-required flows, audit logs, MCP enforcement, and Managed Profiles." },
  { href: "/security", title: "Security", body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations." },
  { href: "/docs/site-guard", title: "Site Guard", body: "Design website middleware, workers, or gateways that enforce AI access rules before protected routes run." },
  { href: "/docs/action-gateway", title: "Action Gateway", body: "Route safe public web reads through BehalfID so denied actions fail before execution." },
];

export default function DocsPage() {
  return (
    <DocsShell
      title="Stop coding agents from running dangerous commands without approval."
      description="BehalfID intercepts actions from Claude Code, Codex, and Cursor before they run. Block production deploys, database migrations, git pushes to main, file deletions, and billing changes — or require human approval before they execute."
      next={{ href: "/docs/cli", label: "Coding agent quickstart" }}
    >
      <div className="docs-links">
        {cards.map((card) => (
          <Link href={card.href} key={card.href}>
            <strong>{card.title}</strong>
            <span>{card.body}</span>
          </Link>
        ))}
      </div>
    </DocsShell>
  );
}
