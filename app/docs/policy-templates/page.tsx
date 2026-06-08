import type { Metadata } from "next";
import { CodeBlock, DocsShell } from "../content";

export const metadata: Metadata = {
  title: "Policy Templates — BehalfID",
  description: "Pre-built permission policies for real developer and coding-agent workflows. Choose a template and apply it in one click.",
  alternates: { canonical: "/docs/policy-templates" }
};

export default function PolicyTemplatesPage() {
  return (
    <DocsShell
      title="Policy Templates"
      description="Pre-built permission policies for real developer and coding-agent workflows. Templates generate concrete allowed/blocked actions and constraints — no manual invention required."
      previous={{ href: "/docs/quickstart", label: "Quickstart" }}
      next={{ href: "/docs/cli", label: "CLI" }}
    >
      <h2>What policy templates are</h2>
      <p>
        Policy templates are opinionated starting points for common agentic workflows.
        Each template maps to one or more BehalfID permissions with concrete <code>action</code>,
        <code>resource</code>, <code>allowedActions</code>, <code>blockedActions</code>,
        and <code>requiresApproval</code> values already filled in.
      </p>
      <p>
        You can apply a template from the dashboard or onboarding wizard, edit the pre-filled fields
        before saving, and revoke individual permissions at any time. Templates do not create
        any integration beyond what BehalfID&apos;s permission model already supports.
      </p>

      <h2>Coding agent: safe local dev</h2>
      <p>
        For coding agents that read and write project files but must never push to a remote
        or deploy to any environment. A single permission is created with <code>create_content</code>
        on <code>local-filesystem</code>.
      </p>
      <p><strong>Blocks:</strong> recursive directory deletion, remote pushes, any deployment, .env and credential file access.</p>
      <CodeBlock label="generated permission">{`{
  "action": "create_content",
  "resource": "local-filesystem",
  "allowedActions": [
    "read files",
    "write files",
    "run tests",
    "run linter",
    "install packages"
  ],
  "blockedActions": [
    "delete directories recursively",
    "push to remote repository",
    "deploy to any environment",
    "read .env files",
    "read credentials files"
  ],
  "requiresApproval": false
}`}</CodeBlock>

      <h2>Coding agent: staging free, production gated</h2>
      <p>
        Creates two permissions. The agent may deploy to staging and preview environments
        automatically. Any promotion to production triggers an approval request in BehalfID
        that must be approved before execution continues.
      </p>
      <p><strong>Blocks:</strong> unapproved production deploys, production rollbacks without approval, production env var changes.</p>
      <CodeBlock label="staging permission (auto-allowed)">{`{
  "action": "deploy",
  "resource": "staging",
  "allowedActions": ["deploy to staging", "create preview deployment"],
  "blockedActions": ["deploy to production", "promote to production"],
  "requiresApproval": false
}`}</CodeBlock>
      <CodeBlock label="production permission (gated)">{`{
  "action": "deploy_production",
  "resource": "production",
  "allowedActions": ["promote staging build to production"],
  "blockedActions": ["rollback without approval", "delete production deployment"],
  "requiresApproval": true
}`}</CodeBlock>

      <h2>GitHub: read issues, no merge</h2>
      <p>
        Grants read-only access to a GitHub repository. The agent can read issues, pull requests,
        comments, and CI status, but cannot push code, merge PRs, delete branches, or change
        repository settings.
      </p>
      <p><strong>Blocks:</strong> PR merges, code pushes, branch deletion, repository settings changes, release creation.</p>
      <CodeBlock label="generated permission">{`{
  "action": "access_data",
  "resource": "github.com",
  "allowedActions": [
    "read issues",
    "read pull requests",
    "read comments",
    "search repository",
    "check CI status"
  ],
  "blockedActions": [
    "merge pull requests",
    "push code",
    "delete branches",
    "create releases",
    "modify repository settings"
  ],
  "requiresApproval": false
}`}</CodeBlock>

      <h2>Filesystem: read/write, no recursive delete</h2>
      <p>
        Allows the agent to read and write files within the project directory. Explicitly blocks
        <code>rm -rf</code> and any recursive directory removal, as well as deletion outside
        the project root.
      </p>
      <p><strong>Blocks:</strong> recursive directory deletion (rm -rf), deletion outside project root, node_modules wipe.</p>
      <CodeBlock label="generated permission">{`{
  "action": "create_content",
  "resource": "local-filesystem",
  "allowedActions": [
    "read files",
    "write files",
    "create directories",
    "rename files",
    "move files within project"
  ],
  "blockedActions": [
    "delete directories recursively",
    "rm -rf",
    "delete outside project root",
    "remove node_modules recursively"
  ],
  "requiresApproval": false
}`}</CodeBlock>

      <h2>Database: read queries, migrations gated</h2>
      <p>
        Creates two permissions. The agent may run SELECT queries and read from the database
        freely. Any migration, schema change, or ALTER TABLE requires explicit human approval.
        DROP and TRUNCATE are always blocked regardless.
      </p>
      <p><strong>Blocks:</strong> unapproved schema migrations, DROP TABLE, TRUNCATE, DELETE without WHERE.</p>
      <CodeBlock label="read permission (auto-allowed)">{`{
  "action": "access_data",
  "resource": "database",
  "allowedActions": ["run SELECT queries", "read records", "view schema"],
  "blockedActions": ["run migrations", "ALTER TABLE", "DROP TABLE", "TRUNCATE"],
  "requiresApproval": false
}`}</CodeBlock>
      <CodeBlock label="migration permission (gated)">{`{
  "action": "deploy",
  "resource": "database",
  "allowedActions": ["run migration", "apply schema change"],
  "blockedActions": ["DROP DATABASE", "DELETE all records", "TRUNCATE without approval"],
  "requiresApproval": true
}`}</CodeBlock>

      <h2>Stripe: test mode free, live mode gated</h2>
      <p>
        Creates two permissions. The agent may use Stripe test-mode keys and create test charges
        without approval. Any operation using live-mode keys — including charges, refunds, and
        subscription changes — requires human sign-off.
      </p>
      <p><strong>Blocks:</strong> unapproved live charges, unapproved refunds, live subscription changes, bulk billing.</p>
      <CodeBlock label="test permission (auto-allowed)">{`{
  "action": "access_data",
  "resource": "stripe.com/test",
  "allowedActions": ["create test charges", "create test customers", "list test transactions"],
  "blockedActions": ["use live API key", "charge real payment methods", "issue live refunds"],
  "requiresApproval": false
}`}</CodeBlock>
      <CodeBlock label="live permission (gated)">{`{
  "action": "purchase",
  "resource": "stripe.com/live",
  "allowedActions": ["create live charge", "issue refund", "modify subscription"],
  "blockedActions": ["bulk charge customers", "delete payment methods"],
  "requiresApproval": true
}`}</CodeBlock>

      <h2>Email: draft free, send gated</h2>
      <p>
        Creates two permissions. The agent may draft emails and read the inbox without approval.
        Actually sending any email — including replies and forwards — requires explicit human
        sign-off before delivery.
      </p>
      <p><strong>Blocks:</strong> unsupervised email sending, bulk email, external forwarding without approval.</p>
      <CodeBlock label="draft permission (auto-allowed)">{`{
  "action": "create_content",
  "resource": "email",
  "allowedActions": ["draft email", "save draft", "read inbox", "search email"],
  "blockedActions": ["send email", "forward email", "delete messages"],
  "requiresApproval": false
}`}</CodeBlock>
      <CodeBlock label="send permission (gated)">{`{
  "action": "send_email",
  "resource": "email",
  "allowedActions": ["send email", "reply to thread", "forward message"],
  "blockedActions": ["send to external mailing list", "bulk email"],
  "requiresApproval": true
}`}</CodeBlock>

      <h2>Browser: browse free, purchases gated</h2>
      <p>
        Creates two permissions. The agent may browse websites and extract content freely.
        Any purchase — including adding to cart and checkout — requires approval, with an
        optional spending cap (default $25).
      </p>
      <p><strong>Blocks:</strong> unsupervised purchases, payment form submissions, account logins, purchases above threshold.</p>
      <CodeBlock label="browse permission (auto-allowed)">{`{
  "action": "browse_web",
  "resource": "web",
  "allowedActions": ["browse websites", "read public pages", "search web"],
  "blockedActions": ["submit payment forms", "make purchases", "log into accounts"],
  "requiresApproval": false
}`}</CodeBlock>
      <CodeBlock label="purchase permission (gated)">{`{
  "action": "purchase",
  "resource": "web",
  "allowedActions": ["add to cart", "checkout", "confirm purchase"],
  "blockedActions": ["save new payment method", "purchase from unapproved vendor"],
  "requiresApproval": true,
  "constraints": { "maxAmount": 25 }
}`}</CodeBlock>

      <h2>Applying templates via the API</h2>
      <p>
        Templates are a dashboard convenience only. The underlying API is the same standard
        permission creation endpoint — templates just pre-fill the fields. You can replicate any
        template by posting the generated permission object directly.
      </p>
      <CodeBlock label="create-permission.sh">{`curl -X POST https://behalfid.com/api/permissions \\
  -H "Authorization: Bearer $BEHALFID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "agt_xxx",
    "action": "access_data",
    "resource": "github.com",
    "allowedActions": ["read issues", "read pull requests", "check CI status"],
    "blockedActions": ["merge pull requests", "push code", "delete branches"],
    "requiresApproval": false
  }'`}</CodeBlock>

      <h2>Editing before save</h2>
      <p>
        Single-permission templates pre-fill the form fields in the dashboard. You can change
        any field before clicking <strong>Create permission</strong>. Multi-permission templates
        (those that create two permissions at once) show a preview panel with a single
        <strong>Apply N permissions</strong> button — these are created immediately and can be
        revoked individually from the Permissions list.
      </p>

      <h2>What templates do not do</h2>
      <ul>
        <li>Templates do not install integrations or connect external services. BehalfID only enforces the permission — your code must still call <code>verify()</code> before the tool runs.</li>
        <li>Templates do not automatically detect which tool the agent used. Enforcement is call-site responsibility.</li>
        <li>The <code>resource</code> field is a label BehalfID matches against the <code>vendor</code> or <code>resource</code> you pass to <code>verify()</code>. Ensure your integration passes the correct value.</li>
      </ul>
    </DocsShell>
  );
}
