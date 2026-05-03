import { DocsShell } from "../content";

export default function ConceptsPage() {
  return (
    <DocsShell title="Concepts">
      <dl className="docs-definition">
        <div><dt>Agents</dt><dd>Software actors with a BehalfID identity and API key.</dd></div>
        <div><dt>Permissions</dt><dd>Rules that scope actions by amount, vendor, expiration, and status.</dd></div>
        <div><dt>Verification</dt><dd>A decision made before the agent acts.</dd></div>
        <div><dt>Delegation</dt><dd>The user-approved boundary that says what an agent may do.</dd></div>
        <div><dt>Audit logs</dt><dd>Records of every authenticated verification decision.</dd></div>
        <div><dt>Webhooks</dt><dd>Signed events for downstream systems, retries, and replay.</dd></div>
      </dl>
    </DocsShell>
  );
}
