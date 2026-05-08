import Link from "next/link";
import { DocsShell } from "./content";

const cards = [
  { href: "/docs/quickstart", title: "Quickstart", body: "Add a native or connected agent, define a permission passport, and verify an action." },
  { href: "/docs/api", title: "API Reference", body: "Use public REST endpoints for connected agents, permissions, verification, logs, and key rotation." },
  { href: "/docs/sdk", title: "SDK", body: "Install the JavaScript SDK from npm and call BehalfID from Node 18+." },
  { href: "/docs/webhooks", title: "Webhooks", body: "Receive signed events through an outbox-backed delivery system." },
  { href: "/docs/site-guard", title: "Site Guard", body: "Design website middleware, workers, or gateways that enforce AI access rules before protected workflows run." },
  { href: "/docs/concepts", title: "Concepts", body: "Understand native agents, connected agents, permission passports, providers, and audit logs." },
  { href: "/security", title: "Security", body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations." }
];

export default function DocsPage() {
  return (
    <DocsShell
      title="Build permission passports for AI agents."
      description="BehalfID connects external agents and native custom agents to scoped permissions, verification decisions, audit logs, and signed webhook events."
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
