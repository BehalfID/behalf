import { CodeBlock, DocsShell } from "../content";

export default function CliDocsPage() {
  return (
    <DocsShell
      title="behalf CLI"
      description="Install the BehalfID CLI to manage agents, verify actions, enforce permissions via MCP, and launch AI tools with enforcement active."
      previous={{ href: "/docs/quickstart", label: "Quickstart" }}
      next={{ href: "/docs/api", label: "API reference" }}
    >
      <h2>Install</h2>
      <p>The CLI ships as a self-contained binary. No Node.js required after install.</p>
      <CodeBlock label="curl (macOS / Linux)">{`curl -fsSL https://behalfid.com/install.sh | sh`}</CodeBlock>
      <CodeBlock label="Homebrew">{`brew install potatobeyonddefeat/tap/behalf`}</CodeBlock>
      <CodeBlock label="npm">{`npm install -g @behalfid/cli`}</CodeBlock>
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
      <CodeBlock label="terminal">{`behalf permissions create agent_xxx \\
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
