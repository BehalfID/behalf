import Link from "next/link";
import { DocsShell } from "./content";

const cards = [
  { href: "/docs/quickstart", title: "Quickstart", body: "Create an agent, add a permission, install the SDK, verify before execution, and test allowed and denied requests." },
  { href: "/docs/cli", title: "CLI & MCP", body: "Install the behalf CLI, wire up the MCP server, and launch Claude Code or Codex with BehalfID enforcement active." },
  { href: "/docs/deploy-approvals", title: "Deploy approvals", body: "Full demo: coding agent attempts production deploy → BehalfID blocks → you approve in the dashboard → agent retries → deploy runs." },
  { href: "/docs/sdk", title: "SDK", body: "Install the JavaScript SDK from npm and call behalf.verify() before tool execution from Node 18+." },
  { href: "/docs/api", title: "API Reference", body: "Use public REST endpoints for agents, permissions, verification, logs, and key rotation." },
  { href: "/docs/webhooks", title: "Webhooks", body: "Receive signed events for allowed, denied, and approval-required decisions via an outbox-backed delivery system." },
  { href: "/docs/concepts", title: "Concepts", body: "Understand permission passports, fail-closed enforcement, approval-required flows, audit logs, and MCP enforcement." },
  { href: "/security", title: "Security", body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations." },
  { href: "/docs/site-guard", title: "Site Guard", body: "Design website middleware, workers, or gateways that enforce AI access rules before protected routes run." },
  { href: "/docs/action-gateway", title: "Action Gateway", body: "Route safe public web reads through BehalfID so denied actions fail before execution." },
];

export default function DocsPage() {
  return (
    <DocsShell
      title="Runtime action authorization for AI agents."
      description="BehalfID verifies every agent action against a permission passport before it runs. Define boundaries, fail closed on denial, require approval before high-risk actions, and audit every decision."
      next={{ href: "/docs/quickstart", label: "Quickstart" }}
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
