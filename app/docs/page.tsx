import Link from "next/link";
import { DocsShell } from "./content";

export default function DocsPage() {
  return (
    <DocsShell title="Build authorization checks for agent actions.">
      <p>BehalfID gives every agent an identity, a scoped permission set, a verification API, audit logs, and signed webhook events.</p>
      <div className="docs-links">
        <Link href="/docs/quickstart">Quickstart</Link>
        <Link href="/docs/sdk">JavaScript SDK</Link>
        <Link href="/docs/webhooks">Webhooks</Link>
      </div>
    </DocsShell>
  );
}
