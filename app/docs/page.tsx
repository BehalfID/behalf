import Link from "next/link";
import { DocsShell } from "./content";

const cards = [
  { href: "/docs/quickstart", title: "Quickstart", body: "Create an account, issue an agent key, add a permission, and verify an action." },
  { href: "/docs/api", title: "API Reference", body: "Use public REST endpoints for agents, permissions, verification, logs, and key rotation." },
  { href: "/docs/sdk", title: "SDK", body: "Install the JavaScript SDK from npm and call BehalfID from Node 18+." },
  { href: "/docs/webhooks", title: "Webhooks", body: "Receive signed events through an outbox-backed delivery system." },
  { href: "/docs/concepts", title: "Concepts", body: "Understand agents, permissions, verification decisions, audit logs, and delegation." }
];

export default function DocsPage() {
  return (
    <DocsShell
      title="Build authorization checks for agent actions."
      description="BehalfID gives every agent an identity, scoped permissions, verification decisions, audit logs, and signed webhook events."
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
