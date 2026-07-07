import type { Metadata } from "next";
import { CLI_NPM_INSTALL_COMMAND } from "@/lib/cliInstallCommands";
import { CodeBlock, DocsShell } from "../content";

export const metadata: Metadata = {
  title: "Demo Script — BehalfID",
  description:
    "Fresh-workspace Managed Profiles smoke test, terminal-first demo scripts for recording (2–3 minutes), and deploy-approval demos (60–90 seconds).",
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
      <h2>Managed Profiles — fresh-workspace smoke test</h2>
      <p>
        Run this checklist from a <strong>clean terminal</strong> in a git repo before recording a demo or
        onboarding a new developer. Assumptions: no prior <code>~/.behalf</code> session (or you have cleared
        it), a supported tool (<code>claude</code>, <code>codex</code>, or <code>cursor</code>) is installed,
        and Managed Profiles policy is enabled in the{" "}
        <a href="/dashboard/managed-profiles">dashboard</a>.
      </p>

      <h3>Smoke path</h3>
      <p>Execute each step in order. Mark pass or fail in the checklist below.</p>
      <CodeBlock label="terminal">{MANAGED_PROFILE_COMMANDS.join("\n")}</CodeBlock>

      <ol className="docs-list">
        <li>
          <strong>Install CLI</strong> — <code>{CLI_NPM_INSTALL_COMMAND}</code>. Confirm{" "}
          <code>behalf --version</code> prints a version.
        </li>
        <li>
          <strong>Login</strong> — <code>behalf login</code>, then <code>behalf whoami</code> shows your
          account.
        </li>
        <li>
          <strong>Install shims</strong> — <code>behalf profile install</code>. Shims land in{" "}
          <code>~/.behalf/bin</code>.
        </li>
        <li>
          <strong>Verify PATH order</strong> — <code>~/.behalf/bin</code> must appear <em>before</em> the real
          tool binary. If install printed a PATH hint, add{" "}
          <code>export PATH=&quot;$HOME/.behalf/bin:$PATH&quot;</code> to your shell config and open a new
          terminal.
        </li>
        <li>
          <strong>Status</strong> — <code>behalf profile status --tool claude</code>. Confirm tool, repo
          root, branch (<code>main</code>), and <strong>policy repo hash</strong> (for example{" "}
          <code>0123456789abcdef</code>). Raw git remotes are not shown.
        </li>
        <li>
          <strong>Simulate</strong> — <code>behalf profile simulate --tool claude</code>. Confirm{" "}
          <code>mode</code> (<code>unmanaged</code>, <code>managed</code>, or <code>required</code>) and{" "}
          <code>reason</code>.
        </li>
        <li>
          <strong>Launch through shim</strong> — <code>claude</code> (not <code>behalf claude</code>). Let the
          tool open briefly, then exit.
        </li>
        <li>
          <strong>Confirm activity</strong> — Open{" "}
          <a href="/dashboard/managed-profiles/activity">Managed Profile Activity</a>. A row should show tool,{" "}
          branch, repo hash, and device id (for example <code>devmac_example</code>) — not raw paths or git
          remotes.
        </li>
        <li>
          <strong>Enroll protected repo</strong> — From Activity or{" "}
          <a href="/dashboard/managed-profiles">Managed profiles</a>, enroll the repo hash. Set mode to{" "}
          <code>required</code> if your workspace supports it.
        </li>
        <li>
          <strong>Simulate required mode</strong> — Run <code>behalf profile simulate --tool claude</code>{" "}
          again in the same repo. Confirm <code>required</code> mode and an understandable policy reason. In
          required mode the CLI <strong>fails closed</strong> when policy cannot be verified.
        </li>
        <li>
          <strong>Request pause approval</strong> —{" "}
          <code>behalf pause --duration 30m --reason &quot;smoke test pause&quot; --tool claude</code>. Note
          the approval id (for example <code>apr_example</code>) and dashboard link.
        </li>
        <li>
          <strong>Approve in dashboard</strong> — Open{" "}
          <a href="/dashboard/approvals">Approvals</a> or{" "}
          <a href="/dashboard/inbox">Needs attention</a>. Approve the pause request.
        </li>
        <li>
          <strong>Retry or check status</strong> — Run the same <code>behalf pause</code> command again, or{" "}
          <code>behalf pause status apr_example</code>, until the lease is granted.
        </li>
        <li>
          <strong>Privacy check</strong> — Activity and approvals show repo hashes and safe metadata only. No
          raw git remotes, local source paths, or home directories appear in CLI or dashboard output.
        </li>
      </ol>

      <p>
        If any step fails, run <code>behalf profile doctor</code> and see{" "}
        <a href="/docs/cli#managed-profiles-troubleshooting">CLI troubleshooting</a>.
      </p>

      <h3>Launch checklist (pass / fail)</h3>
      <table className="docs-checklist">
        <thead>
          <tr>
            <th>Check</th>
            <th>Pass</th>
            <th>Fail</th>
            <th>How to verify</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CLI install works</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf --version</code></td>
          </tr>
          <tr>
            <td>Login works</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf whoami</code></td>
          </tr>
          <tr>
            <td>Shim install works</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf profile install</code> → files in <code>~/.behalf/bin</code></td>
          </tr>
          <tr>
            <td>PATH order correct</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf profile status</code> — shim path before real binary</td>
          </tr>
          <tr>
            <td>Status detects tool/repo/branch</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf profile status --tool claude</code></td>
          </tr>
          <tr>
            <td>Simulate returns mode/reason</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf profile simulate --tool claude</code></td>
          </tr>
          <tr>
            <td>Launch records activity</td>
            <td>☐</td>
            <td>☐</td>
            <td>Launch <code>claude</code> → Activity dashboard</td>
          </tr>
          <tr>
            <td>Activity shows repo hash only</td>
            <td>☐</td>
            <td>☐</td>
            <td>No raw paths or git remotes in activity rows</td>
          </tr>
          <tr>
            <td>Protected repo enrollment works</td>
            <td>☐</td>
            <td>☐</td>
            <td>Enroll hash from Activity or Managed profiles</td>
          </tr>
          <tr>
            <td>Required-mode behavior is understandable</td>
            <td>☐</td>
            <td>☐</td>
            <td>Simulate shows <code>required</code> + clear reason; fails closed when unverified</td>
          </tr>
          <tr>
            <td>Pause approval works</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf pause …</code> → approve → retry or <code>behalf pause status</code></td>
          </tr>
          <tr>
            <td>Doctor output is actionable</td>
            <td>☐</td>
            <td>☐</td>
            <td><code>behalf profile doctor</code> — each warn/error includes a fix line</td>
          </tr>
        </tbody>
      </table>

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
