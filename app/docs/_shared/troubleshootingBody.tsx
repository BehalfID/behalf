import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock as SharedCodeBlock } from "@/components/ui";

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <SharedCodeBlock className="docs-code" label={label}>
      {children}
    </SharedCodeBlock>
  );
}

/**
 * Shared troubleshooting body for EN and locale docs routes.
 * Reasons and error codes are taken from runtime sources (verify, auth, CLI doctor, install).
 */
export function TroubleshootingBody() {
  return (
    <>
      <DocsCallout tone="tip" title="Start here">
        <p>
          Run <code>behalf doctor</code> (or <code>behalf --json doctor</code>) before chasing symptoms.
          Each non-ok check prints a <code>fix:</code> line. For the installer package, use{" "}
          <code>npx @behalfid/install doctor --json</code>.
        </p>
      </DocsCallout>

      <h2 id="quick-diagnosis">Quick diagnosis</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Symptom</th>
              <th>First command</th>
              <th>What to look for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CLI or MCP feels broken</td>
              <td><code>behalf doctor</code></td>
              <td>Any <code>error</code> / <code>warn</code> rows and their <code>fix:</code> lines</td>
            </tr>
            <tr>
              <td>verify always denied</td>
              <td><code>behalf --json verify …</code> or Logs</td>
              <td>Exact <code>reason</code> string (see table below)</td>
            </tr>
            <tr>
              <td>401 / auth failures</td>
              <td><code>behalf whoami</code> + <code>behalf config list</code></td>
              <td>API key format <code>bhf_sk_…</code>, agent id, base URL</td>
            </tr>
            <tr>
              <td>Webhooks not arriving</td>
              <td>Dashboard → Webhooks detail</td>
              <td><code>lastError</code>, dead-letter flag, attempt count</td>
            </tr>
            <tr>
              <td>Managed Profiles bypass</td>
              <td><code>behalf profile doctor</code></td>
              <td>PATH order, shim vs real binary, required-mode prerequisites</td>
            </tr>
            <tr>
              <td>Install / MCP registration</td>
              <td><code>npx @behalfid/install doctor --json</code></td>
              <td><code>healthy</code>, <code>errors[].code</code>, <code>remediation</code></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="cli-doctor">CLI doctor</h2>
      <p>
        <code>behalf doctor</code> checks config directory, session, agent id, API key shape, base URL,
        API health, project <code>.mcp.json</code>, context file, and supported action-time hooks
        (Claude PreToolUse, Codex PreToolUse, Cursor beforeShellExecution).
      </p>
      <CodeBlock label="terminal">{`behalf doctor
behalf --json doctor`}</CodeBlock>
      <p>Common fixes the doctor suggests:</p>
      <ul className="docs-list">
        <li>
          <strong>Not logged in</strong> — <code>behalf login</code> for dashboard-scoped commands
          (permissions, some logs). Agent API keys alone are enough for <code>verify</code>.
        </li>
        <li>
          <strong>API key / agent id missing</strong> —{" "}
          <code>behalf config set api-key bhf_sk_…</code> and{" "}
          <code>behalf config set agent-id agent_…</code>. Keys are shown once at agent creation.
        </li>
        <li>
          <strong>API health error</strong> — check{" "}
          <code>behalf config get base-url</code> (default <code>https://behalfid.com</code>) and network.
        </li>
        <li>
          <strong>Missing MCP / hook</strong> — <code>behalf mcp init</code>, then{" "}
          <code>behalf claude</code> / <code>behalf codex</code> / <code>behalf cursor</code>.
        </li>
        <li>
          <strong>Cursor CLI not in PATH</strong> — in Cursor, run “Install cursor command in PATH”, then
          re-run <code>behalf cursor</code>.
        </li>
      </ul>
      <DocsCallout tone="note">
        <p>
          Doctor proves local config and hook files exist. Enterprise Claude Code with{" "}
          <code>allowManagedHooksOnly</code> can still ignore a user-level hook — confirm the effective
          hook in Claude&apos;s <code>/hooks</code> view, then prove with a denied canary.
        </p>
      </DocsCallout>

      <h2 id="verify-failures">Diagnosing verify failures</h2>
      <p>
        A verify response always includes <code>allowed</code>, <code>reason</code>, <code>risk</code>, and{" "}
        <code>requestId</code>. Prefer the exact <code>reason</code> over guessing. Fail closed: if{" "}
        <code>allowed</code> is false, or verify is unavailable, do not run the tool.
      </p>
      <CodeBlock label="terminal">{`behalf --json verify agent_xxx --action deploy --vendor vercel.com
behalf logs agent_xxx --denied`}</CodeBlock>

      <h3>Common decision reasons</h3>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Reason</th>
              <th>Meaning</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>No active permission exists for this action.</code></td>
              <td>No matching active permission for the agent/action</td>
              <td>Create a permission for that action (and vendor/resource if scoped)</td>
            </tr>
            <tr>
              <td><code>Permission requires approval before execution.</code></td>
              <td>Permission has <code>requiresApproval</code>; not yet granted</td>
              <td>Approve in <Link href="/dashboard/approvals">Approvals</Link> / Inbox, then retry with the same context</td>
            </tr>
            <tr>
              <td><code>Agent is disabled.</code></td>
              <td>Agent record disabled</td>
              <td>Re-enable the agent in the dashboard</td>
            </tr>
            <tr>
              <td><code>Permission has been revoked.</code> / <code>Permission has expired.</code></td>
              <td>Permission no longer active</td>
              <td>Create a new permission or extend expiry</td>
            </tr>
            <tr>
              <td><code>Action is blocked by this permission.</code></td>
              <td>Matched <code>blockedActions</code></td>
              <td>Remove the block or use a different action string</td>
            </tr>
            <tr>
              <td><code>Action is not included in allowedActions.</code></td>
              <td>Permission narrowed to an allow-list that excludes this action</td>
              <td>Add the action to <code>allowedActions</code> or verify the exact string</td>
            </tr>
            <tr>
              <td><code>Resource does not match permission resource.</code></td>
              <td>Vendor/resource mismatch</td>
              <td>Pass the same resource/vendor the permission was created with</td>
            </tr>
            <tr>
              <td><code>Amount exceeds maxAmount constraint.</code></td>
              <td>Amount above limit</td>
              <td>Lower the amount or raise <code>maxAmount</code></td>
            </tr>
            <tr>
              <td><code>amount is required for permissions with a maxAmount constraint.</code></td>
              <td>Constraint present but amount omitted</td>
              <td>Pass <code>amount</code> on verify</td>
            </tr>
            <tr>
              <td><code>Vendor is not included in allowedVendors constraint.</code></td>
              <td>Vendor allow-list miss</td>
              <td>Use an allowed vendor or update the constraint</td>
            </tr>
            <tr>
              <td><code>Branch is blocked by deniedBranches constraint.</code> / not in allowedBranches</td>
              <td>Git branch context failed</td>
              <td>Pass correct <code>branch</code> auth context or adjust constraints</td>
            </tr>
            <tr>
              <td><code>Environment is blocked by deniedEnvironments…</code></td>
              <td>Environment context failed</td>
              <td>Pass <code>environment</code> (e.g. staging vs production) correctly</td>
            </tr>
            <tr>
              <td><code>path_not_permitted</code> / <code>command_blocked</code></td>
              <td>File path or execute_command blocked by constraints</td>
              <td>Adjust <code>allowedPaths</code> / <code>deniedPaths</code> / <code>deniedCommands</code></td>
            </tr>
            <tr>
              <td><code>Verification failed closed during permission lookup.</code></td>
              <td>Internal lookup failure — fail closed</td>
              <td>Retry; check API health and logs. Do not execute.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocsCallout tone="danger" title="Fail closed">
        <p>
          Network errors, timeouts, and unexpected verify failures must stop the executor. Never treat
          “could not reach BehalfID” as allow.
        </p>
      </DocsCallout>

      <h2 id="auth">Auth and API key issues</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>API / CLI message</th>
              <th>Cause</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>Missing or invalid API key.</code></td>
              <td>No Bearer token, wrong scheme, or key not starting with <code>bhf_sk_</code></td>
              <td>Send <code>Authorization: Bearer bhf_sk_…</code>; regenerate key if lost</td>
            </tr>
            <tr>
              <td><code>Unknown agent.</code></td>
              <td>agentId does not exist</td>
              <td>Confirm id from dashboard / <code>behalf agents list</code></td>
            </tr>
            <tr>
              <td><code>API key does not match this agent.</code></td>
              <td>Key belongs to a different agent or was rotated</td>
              <td>Use the current key for that agent; rotate creates a new one-time secret</td>
            </tr>
            <tr>
              <td>Permission create rejected</td>
              <td>Agent API keys cannot grant permissions</td>
              <td>Run <code>behalf login</code> or pass <code>--developer-token</code> (<code>bhf_dev_…</code>)</td>
            </tr>
            <tr>
              <td><code>Invalid email or password.</code></td>
              <td>Bad credentials or Google-only account</td>
              <td>Use Google sign-in when the account is Google-linked</td>
            </tr>
          </tbody>
        </table>
      </div>
      <CodeBlock label="terminal">{`behalf whoami
behalf config list
behalf login`}</CodeBlock>

      <h2 id="webhooks">Webhook delivery failures</h2>
      <p>
        Events land in an outbox before the API returns. Delivery is asynchronous via{" "}
        <code>/api/webhooks/process</code>. A down receiver does not block <code>verify()</code>.
      </p>
      <ul className="docs-list">
        <li>
          <strong>Signature verification fails (401 on your side)</strong> — verify against the{" "}
          <em>raw</em> body; do not re-serialize JSON. Check{" "}
          <code>BehalfID-Timestamp</code> skew (default 300s) and the current{" "}
          <code>whsec_…</code> secret. Rotating the secret invalidates the previous one immediately.
        </li>
        <li>
          <strong>Redirects</strong> — delivery does not follow redirects. Error:{" "}
          <code>Endpoint returned a redirect, which is not followed for webhook delivery.</code>
        </li>
        <li>
          <strong>Timeouts / 5xx</strong> — retries use bounded exponential backoff (immediate → 5s → 30s →
          2m → 10m). After five failures the event is dead-lettered.
        </li>
        <li>
          <strong>Dead letter</strong> — fix the receiver, then replay from the webhook detail page
          (resets attempts and clears <code>lastError</code>). Pending/processing/completed events cannot
          be replayed.
        </li>
        <li>
          <strong>Localhost</strong> — <code>http://localhost</code> only in development; production
          endpoints require <code>https://</code>.
        </li>
        <li>
          <strong>Plan / quota</strong> — webhook delivery may require Pro. Check billing if endpoints
          never leave pending.
        </li>
      </ul>
      <p>
        Full payload and signature details: <Link href="/docs/webhooks">Webhooks</Link>.
      </p>

      <h2 id="install">Installer errors (@behalfid/install)</h2>
      <p>
        Prefer JSON output. Codes match the installer&apos;s stable{" "}
        <code>InstallerErrorCode</code> set:
      </p>
      <CodeBlock label="terminal">{`npx @behalfid/install doctor --json
npx @behalfid/install status --json
npx @behalfid/install install --force --json`}</CodeBlock>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Typical cause</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>DETECTION_FAILED</code></td>
              <td>No usable AI clients found</td>
              <td>Install/launch a supported client; pass <code>--clients</code></td>
            </tr>
            <tr>
              <td><code>CONFIG_INVALID</code> / <code>CONFIG_READ_FAILED</code></td>
              <td>Broken MCP JSON/TOML</td>
              <td>Fix syntax at the reported path; installer will not overwrite unreadable files</td>
            </tr>
            <tr>
              <td><code>CONFIG_WRITE_FAILED</code></td>
              <td>Permissions or file lock</td>
              <td>Close locking apps; fix permissions; retry</td>
            </tr>
            <tr>
              <td><code>RUNTIME_REGISTRATION_FAILED</code></td>
              <td>MCP register step failed</td>
              <td>Read nested error; re-run with <code>--force</code> after fix</td>
            </tr>
            <tr>
              <td><code>NOT_INSTALLED</code></td>
              <td>Operation requires prior install</td>
              <td><code>npx @behalfid/install install --json</code></td>
            </tr>
            <tr>
              <td><code>VERIFY_FAILED</code></td>
              <td>Verify endpoint probe failed</td>
              <td>
                Override with{" "}
                <code>--verify-endpoint https://your-host/api/verify</code>
              </td>
            </tr>
            <tr>
              <td><code>STATE_INVALID</code> / state errors</td>
              <td>Corrupt <code>~/.behalfid/install-state.json</code></td>
              <td>Repair or remove state, then reinstall</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Operator-depth guide (scenarios, warnings, platform notes):{" "}
        <code>packages/install/docs/TROUBLESHOOTING.md</code> in the repo — keep that file as the
        install-package source of truth; this page surfaces the same codes for product docs.
      </p>

      <h2 id="managed-profiles">Managed Profiles</h2>
      <p>
        Run <code>behalf profile doctor</code> first. Frequent issues:{" "}
        <code>~/.behalf/bin</code> not first on PATH, missing real tool binaries, unauthenticated CLI,
        required-mode prerequisites, and server-down cache behavior. Full checklist:{" "}
        <Link href="/docs/cli#managed-profiles-troubleshooting">CLI → Troubleshooting first-run failures</Link>.
      </p>

      <h2 id="still-stuck">Still stuck?</h2>
      <ol className="docs-steps">
        <li>Capture <code>behalf --json doctor</code> (redact secrets if sharing).</li>
        <li>Note the verify <code>requestId</code> and <code>reason</code> from Logs.</li>
        <li>
          For webhooks, copy <code>eventId</code>, attempt count, and sanitized{" "}
          <code>lastError</code>.
        </li>
        <li>
          Confirm fail-closed behavior in your executor — denied and unavailable must not execute.
        </li>
      </ol>
      <p>
        Related: <Link href="/docs/cli">CLI</Link>, <Link href="/docs/sdk">SDK</Link>,{" "}
        <Link href="/docs/concepts">Concepts</Link>, <Link href="/security">Security</Link>.
      </p>
    </>
  );
}
