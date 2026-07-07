import type { Metadata } from "next";
import { CLI_NPM_INSTALL_COMMAND } from "@/lib/cliInstallCommands";
import { CodeBlock, DocsShell } from "../content";

export const metadata: Metadata = {
  title: "Demo Script — BehalfID",
  description:
    "Terminal-first scripts for recording short demos: Managed Profiles (2–3 minutes) and coding-agent deploy approvals (60–90 seconds).",
  alternates: { canonical: "/docs/demo-script" },
};

const MANAGED_PROFILE_COMMANDS = [
  CLI_NPM_INSTALL_COMMAND,
  "behalf login",
  "behalf profile install",
  "behalf profile status --tool claude",
  "behalf profile simulate --tool claude",
  "claude",
] as const;

export default function DemoScriptPage() {
  return (
    <DocsShell
      title="Demo scripts"
      description="Terminal-first scripts for recording short product demos. Pre-setup takes a few minutes off-camera; each recording is 2–3 minutes (Managed Profiles) or 60–90 seconds (deploy approvals)."
      previous={{ href: "/docs/deploy-approvals", label: "Deploy approvals" }}
      next={{ href: "/docs/api", label: "API reference" }}
    >
      <h2>Managed Profiles — 2–3 minute recording</h2>
      <p>
        <strong>Primary message:</strong> Control what coding agents can do before they touch protected repos.
      </p>
      <p>
        Managed Profiles let teams put coding-agent CLIs behind a workspace policy checkpoint,
        install local shims, resolve policy before the real tool starts, and record safe activity
        for review.
      </p>
      <ul className="docs-list">
        <li>Enforce managed or required mode for protected repos</li>
        <li>Simulate policy before launching a tool</li>
        <li>Approve required-mode pause requests</li>
        <li>Review activity without exposing raw paths or git remotes</li>
      </ul>

      <h3>Before you record</h3>
      <p>Do all of this off-camera. The recording starts at step 1 below.</p>
      <ol className="docs-list">
        <li>
          Install the CLI: <code>{CLI_NPM_INSTALL_COMMAND}</code>
        </li>
        <li>Log in: <code>behalf login</code></li>
        <li>Install shims: <code>behalf profile install</code> — confirm <code>~/.behalf/bin</code> is early in PATH</li>
        <li>
          Enable Managed Profiles policy in the{" "}
          <a href="/dashboard/managed-profiles">Managed profiles dashboard</a>
        </li>
        <li>
          Open two browser tabs:{" "}
          <a href="/dashboard/managed-profiles">Managed profiles</a> and{" "}
          <a href="/dashboard/managed-profiles/activity">Managed Profile Activity</a>
        </li>
        <li>Use a large font size (18–20pt) and a clean terminal theme</li>
      </ol>

      <h3>The recording — 2–3 minutes</h3>
      <p>Read each step aloud or use on-screen title cards. Times are approximate.</p>

      <h4>[0:00] Problem</h4>
      <p>
        Say: <em>&ldquo;Coding agents can touch sensitive repos without a team checkpoint. Managed Profiles
        intercept supported CLIs through local shims and resolve workspace policy before the real tool
        starts.&rdquo;</em>
      </p>

      <h4>[0:15] Setup — install CLI and shims</h4>
      <p>Type or show the canonical first-run sequence:</p>
      <CodeBlock label="terminal">{MANAGED_PROFILE_COMMANDS.slice(0, 3).join("\n")}</CodeBlock>
      <p>
        Say: <em>&ldquo;Install local shims for supported coding-agent CLIs. The shim resolves policy
        before launching the real binary.&rdquo;</em>
      </p>

      <h4>[0:35] Verify — status and simulate</h4>
      <CodeBlock label="terminal">{MANAGED_PROFILE_COMMANDS.slice(3, 5).join("\n")}</CodeBlock>
      <p>
        Point out mode (<code>unmanaged</code>, <code>managed</code>, or <code>required</code>), reason,
        and the <strong>policy repo hash</strong> (for example <code>0123456789abcdef</code>) — not a raw
        git remote or local path.
      </p>
      <p>
        Say: <em>&ldquo;Resolve workspace policy before launching the real tool. Simulate is a dry-run —
        no tool launch, no pause lease.&rdquo;</em>
      </p>

      <h4>[0:55] Run — launch through the shim</h4>
      <CodeBlock label="terminal — type this">{MANAGED_PROFILE_COMMANDS[5]}</CodeBlock>
      <p>
        Say: <em>&ldquo;Launching <code>claude</code> through the shim records session policy and activity
        on the server.&rdquo;</em>
      </p>
      <p>Let Claude Code open briefly, then exit.</p>

      <h4>[1:10] Observe — Managed Profile Activity</h4>
      <p>
        Switch to the browser. Open{" "}
        <a href="/dashboard/managed-profiles/activity">Managed Profile Activity</a>.
      </p>
      <p>
        Point out tool (<code>claude</code>), branch (<code>main</code>), repo hash, and device id
        (for example <code>devmac_example</code>). Note that raw git remotes, local source paths, and home
        directories are <strong>not</strong> shown.
      </p>
      <p>
        Say: <em>&ldquo;See every managed CLI decision without leaking raw source paths or git
        remotes.&rdquo;</em>
      </p>

      <h4>[1:30] Protect — enroll a protected repo</h4>
      <p>
        In Activity or on the{" "}
        <a href="/dashboard/managed-profiles">Managed profiles</a> page, enroll the repo hash from the
        activity row. Set mode to <code>required</code> if your workspace supports it.
      </p>
      <p>
        Say: <em>&ldquo;Teams use repo hashes for protected repo identity instead of raw remotes or local
        paths.&rdquo;</em>
      </p>

      <h4>[1:50] Enforce — required mode</h4>
      <p>Back in the terminal, run simulate again in the same repo:</p>
      <CodeBlock label="terminal">{`behalf profile simulate --tool claude`}</CodeBlock>
      <p>
        Show <code>required</code> mode and the policy reason. Say: <em>&ldquo;In required mode, the CLI
        fails closed when policy cannot be verified.&rdquo;</em>
      </p>

      <h4>[2:10] Approval — pause request</h4>
      <CodeBlock label="terminal">{`behalf pause --duration 30m --reason "demo pause" --tool claude`}</CodeBlock>
      <p>
        When pause approval is required, the CLI prints an approval id (for example{" "}
        <code>apr_example</code>) and a dashboard link.
      </p>
      <p>
        Switch to <a href="/dashboard/approvals">Approvals</a> or{" "}
        <a href="/dashboard/inbox">Needs attention</a>. Show requester, tool, repo hash, branch, device
        id, duration, and pause reason. Approve the request.
      </p>
      <p>
        Say: <em>&ldquo;Require approval before a developer can pause enforcement in protected
        contexts.&rdquo;</em>
      </p>

      <h4>[2:35] Privacy recap</h4>
      <p>
        Say: <em>&ldquo;Activity and approvals show repo hashes and safe metadata — never raw git remotes,
        local source paths, or secrets.&rdquo;</em>
      </p>

      <h3>Launch readiness checklist</h3>
      <p>Use this before recording or shipping a public demo:</p>
      <ul className="docs-list">
        <li>CLI install command confirmed: <code>{CLI_NPM_INSTALL_COMMAND}</code></li>
        <li><code>behalf login</code> works</li>
        <li><code>behalf profile install</code> creates shims</li>
        <li>PATH order verified (<code>~/.behalf/bin</code> before real tool binaries)</li>
        <li><code>behalf profile status --tool claude</code> returns expected policy</li>
        <li><code>behalf profile simulate --tool claude</code> returns expected mode and reason</li>
        <li>Launching <code>claude</code> records activity in the dashboard</li>
        <li>Protected repo enrollment works from Activity or Managed profiles</li>
        <li>Required-mode pause approval works end-to-end</li>
        <li>Activity does not expose raw paths or git remotes</li>
      </ul>

      <h3>Sharing</h3>
      <p>
        Link viewers to <a href="/docs/cli">/docs/cli</a> (Managed Profiles quickstart) and{" "}
        <a href="/dashboard/managed-profiles">/dashboard/managed-profiles</a> to follow along.
      </p>

      <h2>Deploy approvals — 60–90 second recording</h2>
      <p>
        A terminal-first script for the coding-agent deploy approval workflow. Pre-setup takes ~5
        minutes; the recording is 60–90 seconds.
      </p>

      <h3>Before you record</h3>
      <p>
        Do all of this off-camera. The recording starts at step 1 below.
      </p>
      <ol className="docs-list">
        <li>Install the CLI: <code>{CLI_NPM_INSTALL_COMMAND}</code></li>
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

      <h3>The recording — 60–90 seconds</h3>
      <p>
        Read each step aloud or use on-screen title cards. Times are approximate.
      </p>

      <h4>[0:00] Wire up enforcement</h4>
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

      <h4>[0:20] Launch the agent</h4>
      <CodeBlock label="terminal — type this">{`behalf claude`}</CodeBlock>
      <p>
        Say: <em>&ldquo;This launches Claude Code with enforcement active. Every <code>verify_action</code> call goes through BehalfID.&rdquo;</em>
      </p>
      <p>
        In the Claude Code prompt, type:
      </p>
      <CodeBlock label="claude code prompt">{`Deploy the current branch to production on vercel.com`}</CodeBlock>

      <h4>[0:35] Approval gate fires</h4>
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

      <h4>[0:50] Approve in the dashboard</h4>
      <p>
        Switch to the browser tab. Show the BehalfID <a href="/dashboard/approvals">Approvals page</a>.
        The pending request appears: <strong>deploy production → vercel.com</strong> with the agent name.
        Click <strong>Approve</strong>.
      </p>
      <p>
        Say: <em>&ldquo;One click. A 30-minute grant window opens. The agent can now retry.&rdquo;</em>
      </p>

      <h4>[1:00] Agent retries — allowed</h4>
      <p>
        Back in the terminal, tell Claude: <em>&ldquo;I&apos;ve approved the request in the dashboard. Please retry.&rdquo;</em>
      </p>
      <p>
        Claude calls <code>verify_action</code> again. This time: <code>allowed: true</code>. The deploy runs.
      </p>
      <p>
        Say: <em>&ldquo;BehalfID found the approved grant, marked it used, and let the deploy through. Every step — the block, the approval, and the allow — is in the audit log.&rdquo;</em>
      </p>

      <h4>[1:15] (Optional) Show the audit trail</h4>
      <CodeBlock label="terminal">{`behalf logs $(behalf config get agent-id)`}</CodeBlock>
      <p>
        Point out the two log entries: the <code>approval_required</code> decision and the subsequent <code>allowed</code> decision, both with their <code>requestId</code>s.
      </p>

      <h3>Cut points</h3>
      <p>
        For a tighter 60-second version, skip the <code>cat .behalf/context.md</code> step
        and the audit trail at the end. The core arc — wire, launch, block, approve, allow — fits
        in 55 seconds.
      </p>

      <h3>Narration notes</h3>
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

      <h3>Sharing</h3>
      <p>
        After recording, link to <a href="/docs/deploy-approvals">/docs/deploy-approvals</a> for
        viewers who want to follow along. The full guide covers permission setup, MCP wiring,
        the approval lifecycle, and webhook integration.
      </p>
    </DocsShell>
  );
}
