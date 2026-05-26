import { CodeBlock, DocsShell } from "../content";

export default function DemoScriptPage() {
  return (
    <DocsShell
      title="Demo script — 60-second deploy approval"
      description="A terminal-first script for recording a short demo of the coding-agent deploy approval workflow. Pre-setup takes ~5 minutes; the recording is 60–90 seconds."
      previous={{ href: "/docs/deploy-approvals", label: "Deploy approvals" }}
      next={{ href: "/docs/api", label: "API reference" }}
    >
      <h2>Before you record</h2>
      <p>
        Do all of this off-camera. The recording starts at step 1 below.
      </p>
      <ol className="docs-list">
        <li>Install the CLI: <code>npm install -g @behalfid/cli</code></li>
        <li>Log in: <code>behalf login</code></li>
        <li>Create a demo agent: <code>behalf agents create --name "Claude Code Demo" --save</code> — the <code>--save</code> flag writes the agent ID and API key to config</li>
        <li>
          Create the two deploy permissions:
          <CodeBlock label="terminal">{`behalf permissions create $(behalf config get agent-id) \\
  --action deploy \\
  --resource vercel.com \\
  --allowed "deploy to staging,create preview deployment" \\
  --blocked "deploy to production,promote to production"

behalf permissions create $(behalf config get agent-id) \\
  --action deploy_production \\
  --resource vercel.com \\
  --allowed "promote staging to production" \\
  --requires-approval`}</CodeBlock>
        </li>
        <li>Open a terminal in a scratch project directory</li>
        <li>Open the BehalfID dashboard <a href="/dashboard/approvals">Approvals page</a> in a browser tab — you&apos;ll switch to it during the recording</li>
        <li>Use a large font size (18–20pt) and a clean terminal theme for legibility</li>
      </ol>

      <h2>The recording — 60–90 seconds</h2>
      <p>
        Read each step aloud or use on-screen title cards. Times are approximate.
      </p>

      <h3>[0:00] Wire up enforcement</h3>
      <p>Type this live:</p>
      <CodeBlock label="terminal — type this">{`behalf mcp init`}</CodeBlock>
      <p>
        Say: <em>&ldquo;This registers the BehalfID MCP server and writes the agent&apos;s permission context to the project.&rdquo;</em>
      </p>
      <p>Show the two files created: <code>.mcp.json</code> and <code>.behalf/context.md</code>.</p>
      <CodeBlock label="terminal">{`cat .behalf/context.md`}</CodeBlock>
      <p>
        Point out the <strong>Approval-Required Actions</strong> section and the numbered retry protocol.
      </p>

      <h3>[0:20] Launch the agent</h3>
      <CodeBlock label="terminal — type this">{`behalf claude`}</CodeBlock>
      <p>
        Say: <em>&ldquo;This launches Claude Code with enforcement active. Every <code>verify_action</code> call goes through BehalfID.&rdquo;</em>
      </p>
      <p>
        In the Claude Code prompt, type:
      </p>
      <CodeBlock label="claude code prompt">{`Deploy the current branch to production on vercel.com`}</CodeBlock>

      <h3>[0:35] Approval gate fires</h3>
      <p>
        Claude Code calls <code>verify_action("deploy_production", "vercel.com")</code>.
        The MCP server returns the approval-required block. Claude pauses and shows:
      </p>
      <CodeBlock label="what Claude reports">{`APPROVAL REQUIRED — do not execute this action.

Action:      deploy_production on vercel.com
Approval ID: apr_xxxxxxxx

A human must approve this request before the action can proceed.
Approve at: https://behalfid.com/dashboard/approvals`}</CodeBlock>
      <p>
        Say: <em>&ldquo;BehalfID blocked the production deploy. Claude is pausing and showing me the approval ID and where to go.&rdquo;</em>
      </p>

      <h3>[0:50] Approve in the dashboard</h3>
      <p>
        Switch to the browser tab. Show the BehalfID <a href="/dashboard/approvals">Approvals page</a>.
        The pending request appears: <strong>deploy production → vercel.com</strong> with the agent name.
        Click <strong>Approve</strong>.
      </p>
      <p>
        Say: <em>&ldquo;One click. A 30-minute grant window opens. The agent can now retry.&rdquo;</em>
      </p>

      <h3>[1:00] Agent retries — allowed</h3>
      <p>
        Back in the terminal, tell Claude: <em>&ldquo;I&apos;ve approved the request in the dashboard. Please retry.&rdquo;</em>
      </p>
      <p>
        Claude calls <code>verify_action</code> again. This time: <code>allowed: true</code>. The deploy runs.
      </p>
      <p>
        Say: <em>&ldquo;BehalfID found the approved grant, marked it used, and let the deploy through. Every step — the block, the approval, and the allow — is in the audit log.&rdquo;</em>
      </p>

      <h3>[1:15] (Optional) Show the audit trail</h3>
      <CodeBlock label="terminal">{`behalf logs $(behalf config get agent-id)`}</CodeBlock>
      <p>
        Point out the two log entries: the <code>approval_required</code> decision and the subsequent <code>allowed</code> decision, both with their <code>requestId</code>s.
      </p>

      <h2>Cut points</h2>
      <p>
        For a tighter 60-second version, skip the <code>cat .behalf/context.md</code> step
        and the audit trail at the end. The core arc — wire, launch, block, approve, allow — fits
        in 55 seconds.
      </p>

      <h2>Narration notes</h2>
      <ul className="docs-list">
        <li>
          Be honest about scope: <em>&ldquo;BehalfID enforces at the MCP boundary. The check lives in the tool call, not in the model&apos;s memory — so it&apos;s not bypassed by prompt injection or jailbreaks that only affect the model&apos;s reasoning.&rdquo;</em>
        </li>
        <li>
          Don&apos;t claim agents &ldquo;can&apos;t&rdquo; bypass it in all scenarios — the enforcement works where the integration is wired. An agent that calls <code>vercel deploy</code> directly without going through the MCP tool would not be caught.
        </li>
        <li>
          The value prop: <em>&ldquo;For teams that want a human in the loop before production changes, this is a five-minute integration.&rdquo;</em>
        </li>
      </ul>

      <h2>Sharing</h2>
      <p>
        After recording, link to <a href="/docs/deploy-approvals">/docs/deploy-approvals</a> for
        viewers who want to follow along. The full guide covers permission setup, MCP wiring,
        the approval lifecycle, and webhook integration.
      </p>
    </DocsShell>
  );
}
