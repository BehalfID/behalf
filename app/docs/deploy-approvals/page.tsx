import type { Metadata } from "next";
import { CodeBlock, DocsShell } from "../content";

export const metadata: Metadata = {
  title: "Deploy Approvals — BehalfID",
  description: "Step-by-step demo: Claude Code or Codex attempts a production deploy, BehalfID blocks it, you approve in the dashboard, the agent retries and succeeds.",
  alternates: { canonical: "/docs/deploy-approvals" }
};

export default function DeployApprovalsPage() {
  return (
    <DocsShell
      title="Coding-agent deploy approvals"
      description="Step-by-step demo: Claude Code or Codex attempts a production deploy, BehalfID blocks it, you approve in the dashboard, the agent retries and succeeds."
      previous={{ href: "/docs/cli", label: "CLI & MCP" }}
      next={{ href: "/docs/api", label: "API reference" }}
    >
      <h2>Overview</h2>
      <p>
        This guide walks through the complete approval loop for a coding agent that can deploy
        to staging autonomously, but must pause for human approval before touching production.
      </p>
      <p>The full flow is:</p>
      <ol className="docs-list">
        <li>Agent calls <code>verify_action("deploy_production", "vercel.com")</code></li>
        <li>BehalfID returns <code>approvalRequired: true</code> — the agent pauses and reports the request</li>
        <li>A pending request appears in the <a href="/dashboard/approvals">Approvals dashboard</a></li>
        <li>You click <strong>Approve</strong> — a 30-minute grant window opens</li>
        <li>Agent retries <code>verify_action</code> — now <code>allowed: true</code></li>
        <li>Deploy runs. Every step is logged with a stable <code>requestId</code>.</li>
      </ol>

      <h2>Step 1 — Create permissions</h2>
      <p>
        Create two permissions for your coding agent. Staging deploys are allowed automatically;
        production deploys require human approval.
      </p>
      <CodeBlock label="terminal">{`# Staging: allowed automatically
behalf permissions create agent_xxx \\
  --action deploy \\
  --resource vercel.com \\
  --allowed "deploy to staging,create preview deployment,update environment variables on staging" \\
  --blocked "deploy to production,promote to production,delete production deployment"

# Production: pauses for approval
behalf permissions create agent_xxx \\
  --action deploy_production \\
  --resource vercel.com \\
  --allowed "promote staging to production" \\
  --blocked "rollback without approval,delete production deployment" \\
  --requires-approval`}</CodeBlock>

      <h2>Step 2 — Wire up MCP enforcement</h2>
      <p>Run this once in your project directory to register the BehalfID MCP server and write the agent context file:</p>
      <CodeBlock label="terminal">{`behalf config set agent-id agent_xxx
behalf config set api-key bhf_sk_xxx
behalf mcp init`}</CodeBlock>
      <p>
        This creates <code>.mcp.json</code> (registers the MCP server) and{" "}
        <code>.behalf/context.md</code> (tells the agent its permissions and the approval protocol).
      </p>

      <h2>Step 3 — Launch your agent with enforcement active</h2>
      <CodeBlock label="terminal">{`behalf claude      # Claude Code
behalf codex       # Codex CLI
behalf run cursor  # Cursor`}</CodeBlock>
      <p>
        The launcher refreshes the permissions cache and starts the MCP server before launching the tool.
        Every <code>verify_action</code> call during the session goes through your live BehalfID permissions.
      </p>

      <h2>Step 4 — The agent hits the approval gate</h2>
      <p>
        When the agent attempts a production deploy, it calls{" "}
        <code>verify_action("deploy_production", "vercel.com")</code>.
        BehalfID responds with <code>approvalRequired: true</code> and creates a pending request.
      </p>
      <CodeBlock label="what verify_action returns to the agent">{`{
  "requestId": "req_Abc123xyz",
  "allowed": false,
  "approvalRequired": true,
  "approvalId": "apr_Def456uvw",
  "reason": "Permission requires approval before execution.",
  "risk": "medium"
}`}</CodeBlock>
      <p>
        The MCP server formats this into a clear instruction block so the agent knows exactly what to do:
      </p>
      <CodeBlock label="what the agent sees in its context">{`APPROVAL REQUIRED — do not execute this action.

Action:      deploy_production on vercel.com
Request ID:  req_Abc123xyz
Approval ID: apr_Def456uvw

A human must approve this request before the action can proceed.
Approve at: https://behalfid.com/dashboard/approvals

Instructions:
1. Tell the user: "I need approval to run this action. Please visit the BehalfID Approvals
   dashboard and approve the pending request (apr_Def456uvw)."
2. Do not execute the action.
3. After the user confirms they have approved, call verify_action again with the same arguments.
4. If verify_action returns allowed: true, proceed. If it still returns approvalRequired, wait.`}</CodeBlock>
      <p>
        The agent then reports this to you in the chat and waits.
        A <code>verification.approval_required</code> webhook event fires to any configured
        endpoint (Slack, PagerDuty, etc.).
      </p>

      <h2>Step 5 — Approve in the dashboard</h2>
      <p>
        Open the <a href="/dashboard/approvals">Approvals page</a> in the BehalfID dashboard.
        You&apos;ll see the pending request with the agent name, action, vendor, and the{" "}
        <code>approvalId</code>.
      </p>
      <p>
        Click <strong>Approve</strong>. BehalfID opens a 30-minute grant window for that
        (agent, permission) pair. If the agent doesn&apos;t retry within 30 minutes, the grant
        expires and it must request approval again.
      </p>

      <h2>Step 6 — Agent retries and deploys</h2>
      <p>
        Tell the agent you&apos;ve approved. It calls{" "}
        <code>verify_action("deploy_production", "vercel.com")</code> again.
        BehalfID finds the active grant, marks it <code>used</code>, and returns:
      </p>
      <CodeBlock label="retry response">{`{
  "requestId": "req_Ghi789rst",
  "allowed": true,
  "approvalRequired": false,
  "reason": "Action allowed by approved permission grant.",
  "risk": "low"
}`}</CodeBlock>
      <p>
        The agent proceeds with the deploy. The grant is consumed — a second verify call
        within the same window would require another approval.
      </p>

      <h2>Step 7 — Audit trail</h2>
      <p>
        Every step is logged. Filter the{" "}
        <a href="/dashboard/logs">Logs view</a> by{" "}
        <strong>Decision → Approval required</strong> to see the approval gate, or export
        as CSV for incident reviews.
      </p>
      <CodeBlock label="terminal">{`# See recent decisions for your agent
behalf logs agent_xxx

# The full lifecycle appears in the logs:
# req_Abc123xyz → denied (approvalRequired)   ← first verify call
# req_Ghi789rst → allowed                     ← retry after approval`}</CodeBlock>

      <h2>Webhook integration (optional)</h2>
      <p>
        Configure a webhook to receive <code>verification.approval_required</code> events
        and route them to Slack, PagerDuty, or a custom approval bot.
      </p>
      <CodeBlock label="approval_required webhook payload">{`{
  "type": "verification.approval_required",
  "data": {
    "requestId": "req_Abc123xyz",
    "approvalId": "apr_Def456uvw",
    "agentId": "agent_xxx",
    "action": "deploy_production",
    "allowed": false,
    "approvalRequired": true,
    "risk": "medium",
    "permissionId": "perm_yyy"
  }
}`}</CodeBlock>
      <p>
        See the <a href="/docs/webhooks">Webhooks guide</a> for signature verification
        and retry behavior.
      </p>

      <h2>Troubleshooting</h2>
      <ul className="docs-list">
        <li>
          <strong>Grant expired before retry</strong> — the 30-minute window passed. The agent will
          get <code>approvalRequired: true</code> again and a new pending request will appear in the
          dashboard.
        </li>
        <li>
          <strong>Agent not pausing</strong> — check that <code>.behalf/context.md</code> is loaded
          by the tool. Run <code>behalf mcp init --refresh</code> to regenerate it.
        </li>
        <li>
          <strong>approval_required in logs but no pending request in dashboard</strong> — the
          request may have already been resolved. Change the status filter on the Approvals page
          to <em>All</em>.
        </li>
        <li>
          <strong>Webhook not firing</strong> — run <code>behalf doctor</code> and check the
          Webhooks delivery log in the dashboard.
        </li>
      </ul>
    </DocsShell>
  );
}
