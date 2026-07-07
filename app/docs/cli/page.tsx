import type { Metadata } from "next";
import { CLI_NPM_INSTALL_COMMAND } from "@/lib/cliInstallCommands";
import { CodeBlock, DocsShell } from "../content";

export const metadata: Metadata = {
  title: "Coding Agent Quickstart (CLI & MCP) — BehalfID",
  description: "Stop Claude Code, Codex, and Cursor from running dangerous commands without approval. Install the behalf CLI, wire up MCP enforcement or Managed Profiles shims, and launch coding agents with workspace policy active.",
  alternates: { canonical: "/docs/cli" }
};

export default function CliDocsPage() {
  return (
    <DocsShell
      title="Coding agent quickstart (CLI & MCP)"
      description="Stop Claude Code, Codex, and Cursor from deploying to production, deleting files, or pushing to main without your approval. Install the CLI, wire up MCP enforcement or Managed Profiles shims, and launch your agent with workspace policy active — all in under five minutes."
      previous={{ href: "/docs", label: "Overview" }}
      next={{ href: "/docs/deploy-approvals", label: "Deploy approvals" }}
    >
      <h2>Install</h2>
      <p>The CLI ships as a self-contained binary. No Node.js required after install.</p>
      <CodeBlock label="curl (macOS / Linux)">{`curl -fsSL https://behalfid.com/install.sh | sh`}</CodeBlock>
      <CodeBlock label="Homebrew">{`brew install behalfid/tap/behalf`}</CodeBlock>
      <CodeBlock label="npm">{CLI_NPM_INSTALL_COMMAND}</CodeBlock>
      <p>Verify the install:</p>
      <CodeBlock label="terminal">{`behalf --version`}</CodeBlock>

      <h2>Setup wizard</h2>
      <p>Run <code>behalf init</code> to walk through base URL, authentication, and API key configuration interactively.</p>
      <CodeBlock label="terminal">{`behalf init`}</CodeBlock>
      <p>The wizard stores config at <code>~/.behalf/config.json</code> and session at <code>~/.behalf/session</code>.</p>

      <h2>Auth</h2>
      <CodeBlock label="terminal">{`behalf login         # log in with email and password
behalf whoami        # show current authenticated user
behalf logout        # clear the session`}</CodeBlock>

      <h2>Agents</h2>
      <CodeBlock label="terminal">{`behalf agents list
behalf agents create --name "My Bot"
behalf agents create --name "Ollie" --type connected --provider ollie --save`}</CodeBlock>
      <p>
        Pass <code>--save</code> to write the new agent ID and API key directly to
        <code> ~/.behalf/config.json</code>. The API key is only returned once.
      </p>

      <h2>Permissions</h2>
      <p>
        Permission grants require human authentication. Run <code>behalf login</code> or pass
        <code>--developer-token</code> with a <code>bhf_dev_...</code> developer token.
        Agent API keys are for verification only and cannot create or revoke permissions.
      </p>
      <CodeBlock label="terminal">{`behalf login
behalf permissions create agent_xxx \\
  --action access_data \\
  --resource gmail.com \\
  --allowed "read labels,summarize messages" \\
  --blocked "send email,delete messages" \\
  --requires-approval

behalf permissions create agent_xxx \\
  --action purchase \\
  --resource amazon.com \\
  --max-amount 50 \\
  --template purchase`}</CodeBlock>

      <h2>Verify an action</h2>
      <p>
        Use <code>behalf verify</code> to run a one-off action check. The command exits with
        code <code>0</code> on allow and <code>1</code> on deny — safe to use in scripts.
      </p>
      <CodeBlock label="terminal">{`behalf verify agent_xxx --action browse_web --vendor web
behalf verify agent_xxx --action purchase --vendor amazon.com --amount 25`}</CodeBlock>
      <p>
        Pass <code>--json</code> to get machine-readable output. The exit code still reflects
        the allow/deny decision.
      </p>
      <CodeBlock label="terminal">{`behalf --json verify agent_xxx --action purchase --vendor amazon.com --amount 100`}</CodeBlock>
      <CodeBlock label="denied response">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "Amount exceeds the maximum permitted for this permission.",
  "risk": "high"
}`}</CodeBlock>

      <h2>Logs</h2>
      <CodeBlock label="terminal">{`behalf logs agent_xxx`}</CodeBlock>

      <h2>MCP enforcement</h2>
      <p>
        BehalfID ships a Model Context Protocol (MCP) server that makes real-time
        <code> verify_action</code> and <code> get_permissions</code> available to any AI tool that supports MCP. Run{" "}
        <code>behalf mcp init</code> once per project to wire it in.
      </p>
      <CodeBlock label="terminal">{`behalf config set agent-id agent_xxx
behalf config set api-key bhf_sk_xxx
behalf mcp init`}</CodeBlock>
      <p>
        <code>mcp init</code> writes two files to the current directory:
      </p>
      <ul className="docs-list">
        <li><code>.mcp.json</code> — registers the <code>behalfid</code> MCP server (merged with any existing config)</li>
        <li><code>.behalf/context.md</code> — a markdown brief of the agent&apos;s active permissions</li>
      </ul>
      <p>
        If a <code>CLAUDE.md</code> or <code>AGENTS.md</code> file is present, the CLI
        offers to append <code>@.behalf/context.md</code> so the AI tool loads the context
        automatically on startup.
      </p>
      <CodeBlock label=".mcp.json">{`{
  "mcpServers": {
    "behalfid": {
      "type": "stdio",
      "command": "behalf",
      "args": ["mcp", "start"]
    }
  }
}`}</CodeBlock>
      <p>
        The MCP server exposes <code>get_permissions</code> for inspection and
        <code> verify_action</code> for enforcement. The context file instructs the AI to call
        <code> verify_action</code> before risky or permissioned actions, stop on denied decisions,
        fail closed if verification is unavailable, and pause when approval is required.
      </p>
      <CodeBlock label="terminal">{`behalf mcp status           # show config and cached permissions for this directory
behalf mcp init --refresh   # force-refresh the permissions cache from the server
behalf mcp init --dry-run   # preview what would be written without writing
behalf doctor               # diagnose CLI and MCP setup`}</CodeBlock>

      <h2>Launch AI tools with enforcement</h2>
      <p>
        The <code>behalf claude</code>, <code>behalf codex</code>, and <code>behalf run</code> commands
        fetch the latest permissions, write <code>.behalf/context.md</code> and <code>.mcp.json</code>,
        and then launch the tool — so enforcement is always current when the session starts.
        The launcher prints the agent, base URL, context file, MCP config, and command it is
        about to run. It does not print API keys.
      </p>
      <CodeBlock label="terminal">{`behalf claude              # launch Claude Code with enforcement active
behalf codex               # launch Codex CLI with enforcement active
behalf run cursor          # launch Cursor with enforcement active
behalf claude --resume     # pass extra flags straight through to the tool`}</CodeBlock>

      <p>
        For a runnable local walkthrough with allowed, denied, and approval-required examples,
        see <code>docs/MCP_DEMO.md</code>.
      </p>

      <h2>Managed Profiles</h2>
      <p>
        <strong>Control what coding agents can do before they touch protected repos.</strong>
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

      <h3>First-run quickstart</h3>
      <CodeBlock label="terminal">{`${CLI_NPM_INSTALL_COMMAND}
behalf login
behalf profile install
behalf profile status --tool claude
behalf profile simulate --tool claude
claude`}</CodeBlock>
      <p>
        Ensure <code>~/.behalf/bin</code> is early in PATH. Enable Managed Profiles policy in the{" "}
        <a href="/dashboard/managed-profiles">dashboard</a> before expecting enforcement.
      </p>

      <h3>Dashboard setup</h3>
      <p>
        The <a href="/dashboard/managed-profiles">Managed profiles</a> onboarding card walks through
        the same install → status → simulate → launch flow. After your first shim launch, enroll
        protected repos from <a href="/dashboard/managed-profiles/activity">Managed Profile Activity</a>{" "}
        using repo hashes — not raw git remotes or local paths.
      </p>

      <h3>Policy simulation</h3>
      <CodeBlock label="terminal">{`behalf profile simulate --tool claude
behalf profile simulate --tool codex --repo 0123456789abcdef --branch main`}</CodeBlock>
      <p>
        Dry-runs policy resolution without launching a tool. The dashboard simulator uses the same API.
      </p>

      <h3>Protected repos and required mode</h3>
      <p>
        Enroll repos by policy repo hash (for example <code>0123456789abcdef</code>). Set mode to{" "}
        <code>managed</code> or <code>required</code>. In required mode, the CLI fails closed when
        policy cannot be verified.
      </p>

      <h3>Required-mode pause approval</h3>
      <CodeBlock label="terminal">{`behalf pause --duration 30m --reason "incident response" --tool claude
behalf pause status apr_example`}</CodeBlock>
      <p>
        When pause approval is required, the CLI prints an approval id and dashboard link. Approvers
        review at <a href="/dashboard/approvals">Approvals</a> or{" "}
        <a href="/dashboard/inbox">Needs attention</a>.
      </p>

      <h3>Privacy</h3>
      <p>
        Activity and approvals show repo hashes, tool, branch, and device id — not raw git remotes,
        local source paths, home directories, or secrets. See{" "}
        <a href="/docs/demo-script">Demo script</a> for a 2–3 minute recording walkthrough and launch
        checklist.
      </p>
      <p>
        Full CLI reference: <code>packages/cli/README.md</code>.
      </p>

      <h3 id="managed-profiles-troubleshooting">Troubleshooting first-run failures</h3>
      <p>
        Run <code>behalf profile doctor</code> first. Each warning or error includes a <code>fix:</code> line.
        Common issues:
      </p>
      <ul className="docs-list">
        <li>
          <strong><code>~/.behalf/bin</code> not first in PATH</strong> — Managed tools resolve the real binary
          instead of the shim. Add <code>export PATH=&quot;$HOME/.behalf/bin:$PATH&quot;</code> to your shell
          config, restart the terminal, and confirm with <code>behalf profile status</code> (PATH ordering:
          ok).
        </li>
        <li>
          <strong>Real <code>claude</code>/<code>codex</code>/<code>cursor</code> binary not found</strong> —
          Install the tool first. <code>behalf profile install</code> skips tools whose binaries are missing.
          Doctor shows which real binary could not be resolved.
        </li>
        <li>
          <strong>Unauthenticated CLI</strong> — Run <code>behalf login</code>. Status and simulate need a
          session; required-mode launches fail closed without credentials.
        </li>
        <li>
          <strong>Server unavailable</strong> — Unmanaged contexts may continue with a warning. Required
          contexts fail closed unless a valid cached policy allows continuity. Check base URL with{" "}
          <code>behalf config get base-url</code> and network access to the API.
        </li>
        <li>
          <strong>Required mode fail-closed</strong> — When mode is <code>required</code> and policy cannot be
          verified (server down, no cache, missing agent credentials), the shim refuses to launch. Fix auth and
          connectivity, then re-run <code>behalf profile simulate --tool claude</code>.
        </li>
        <li>
          <strong>Protected repo hash not appearing</strong> — Run from inside a git repo. Status shows{" "}
          <code>policy repo hash</code>; if <code>(none)</code>, confirm git remote or local root detection.
          Enroll only after a shim launch records activity.
        </li>
        <li>
          <strong>Activity not appearing after launch</strong> — Confirm PATH order (shim, not real binary),
          authentication, and that Managed Profiles policy is enabled in the dashboard. Wait a few seconds and
          refresh <a href="/dashboard/managed-profiles/activity">Activity</a>.
        </li>
      </ul>
      <p>
        For a printable pass/fail checklist, see the{" "}
        <a href="/docs/demo-script">fresh-workspace smoke test</a>.
      </p>

      <h2>Deploy approval workflow</h2>
      <p>
        The most common first use case: an AI coding agent (Claude Code, Codex, Cursor) that
        can deploy to staging autonomously but must pause for human approval before touching
        production.
      </p>

      <h3>1. Set up permissions</h3>
      <p>
        Create two permissions for your coding agent — one that allows staging deploys
        without approval, and one that requires approval for production.
      </p>
      <CodeBlock label="terminal">{`# Allow staging deploys — no approval required
behalf permissions create agent_xxx \\
  --action deploy \\
  --resource vercel.com \\
  --allowed "deploy to staging, create preview deployment" \\
  --blocked "deploy to production, promote to production"

# Production deploy requires human approval
behalf permissions create agent_xxx \\
  --action deploy_production \\
  --resource vercel.com \\
  --allowed "promote staging to production" \\
  --requires-approval`}</CodeBlock>

      <h3>2. Launch your AI tool with enforcement active</h3>
      <CodeBlock label="terminal">{`behalf config set agent-id agent_xxx
behalf config set api-key bhf_sk_xxx
behalf mcp init
behalf claude       # or: behalf codex`}</CodeBlock>

      <h3>3. The approval flow in practice</h3>
      <p>
        When the agent attempts a production deploy, the MCP server calls{" "}
        <code>verify_action(action: "deploy_production", vendor: "vercel.com")</code>.
        BehalfID returns <code>{`"allowed": false, "reason": "Permission requires approval before execution."`}</code>.
        The agent pauses and reports the <code>requestId</code>. You approve in the dashboard
        or via webhook, then the agent retries — now allowed.
      </p>
      <CodeBlock label="what the agent sees">{`verify_action("deploy_production", "vercel.com")

{
  "requestId": "req_Abc123xyz",
  "allowed": false,
  "reason": "Permission requires approval before execution.",
  "risk": "medium"
}

→ Agent pauses: "Deployment to production requires approval (req_Abc123xyz)."
→ Webhook fires to your configured endpoint (Slack, PagerDuty, etc.)
→ You approve in the BehalfID dashboard
→ Agent calls verify_action again → allowed → deploy runs`}</CodeBlock>

      <h3>4. Audit the decisions</h3>
      <p>
        Every verify call — allowed, denied, and approval-required — is logged with a stable{" "}
        <code>requestId</code>. Filter by decision type in the{" "}
        <a href="/dashboard/logs">Logs view</a> or export as CSV for post-mortems.
      </p>
      <CodeBlock label="terminal">{`behalf logs agent_xxx          # tail recent verification decisions`}</CodeBlock>

      <h2>Config</h2>
      <CodeBlock label="terminal">{`behalf config set api-key bhf_sk_xxx
behalf config set agent-id agent_xxx
behalf config set base-url https://behalfid.com
behalf config get api-key
behalf config list`}</CodeBlock>

      <h2>Global --json flag</h2>
      <p>
        Add <code>--json</code> before any subcommand to get machine-readable output.
        Errors are also emitted as JSON. Works with every command.
      </p>
      <CodeBlock label="terminal">{`behalf --json agents list
behalf --json verify agent_xxx --action purchase -v amazon.com`}</CodeBlock>
    </DocsShell>
  );
}
