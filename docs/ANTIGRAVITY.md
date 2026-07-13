# Google Antigravity Integration

Status as of 2026-07-13. Covers BehalfID's integration with Google Antigravity
(the Antigravity IDE / "Antigravity 2.0" and the `agy` CLI).

## What Antigravity is (verified)

Google Antigravity is Google's agent-first development platform:

- **Antigravity IDE** — a VS Code fork with an agent manager surface.
- **Antigravity CLI** (`agy`) — terminal agent, released at Google I/O 2026
  (May 19, 2026) as the successor to Gemini CLI. Google's transition
  announcement confirms it "retains … Agent Skills, Hooks, Subagents, and
  Extensions (now Antigravity plugins)".
- **Antigravity SDK** (Python) — a library for building custom agents. Its
  in-process hooks are a separate surface and are not covered by this
  integration.

The IDE and CLI share configuration under `~/.gemini/`:

| File | Purpose |
|---|---|
| `~/.gemini/config/hooks.json` | Global hooks (shared by IDE + CLI) |
| `~/.gemini/config/mcp_config.json` | Shared MCP server config (Antigravity 2.0) |
| `~/.gemini/antigravity/mcp_config.json` | Earlier per-product MCP config path |
| `<workspace>/.agents/hooks.json` | Workspace-local hooks (only loaded for trusted folders) |

Antigravity supports **PreToolUse / PostToolUse command hooks**: before every
tool call, the harness pipes a JSON payload to the configured command on stdin
and blocks the call when the hook returns `{"decision":"deny", ...}` on stdout
or exits non-zero (exit 2 is the canonical blocking signal, inherited from the
Gemini CLI / Claude Code convention). A denied PreToolUse hook aborts the tool
call before execution. Hooks run with a **sanitized environment** — only a
whitelist of variables reaches the hook process, so BehalfID's gate reads all
configuration from `~/.behalf/config.json`, never from env vars.

Antigravity supports **MCP servers** (stdio via `command`/`args`, remote HTTP
via `serverUrl`/`headers`) in both the IDE and the CLI. MCP is advisory:
nothing in Antigravity forces the agent to consult a given MCP tool before
acting.

Sources: [Gemini CLI → Antigravity CLI transition (official)](https://github.com/google-gemini/gemini-cli/discussions/27274),
[antigravity-cli releases + CHANGELOG (official)](https://github.com/google-antigravity/antigravity-cli),
[Gemini CLI hooks reference (Apache-2.0 upstream of the Antigravity CLI)](https://github.com/google-gemini/gemini-cli/tree/main/docs/hooks),
[GitHub MCP server Antigravity install guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-antigravity.md),
[Antigravity hooks documentation](https://antigravity.google/docs/hooks),
plus real-world hook integrations validated against the shipping product
(e.g. [manaflow-ai/cmux#4768](https://github.com/manaflow-ai/cmux/issues/4768),
which demonstrates that a non-zero PreToolUse hook exit blocks all tool calls).

## What BehalfID installs

`behalf antigravity install` sets up two layers:

1. **Enforced layer — PreToolUse gate.** A `behalfid` namespace entry in
   `~/.gemini/config/hooks.json` runs `behalf hook antigravity` before every
   tool call in the IDE and the CLI. The gate:
   - normalizes the Antigravity tool call to a BehalfID action
     (see mapping below),
   - builds a sanitized `policyContext` containing only the file path or
     command string plus `cwd`/`home` — file contents, edit bodies, and
     prompts are never forwarded,
   - calls `POST /api/verify`, which evaluates permissions,
     `allowedPaths`/`deniedPaths`/`deniedCommands` constraints, and the
     approval gate, and writes a verification log entry,
   - allows with `{}` (an explicit no-opinion — the gate never emits
     `{"decision":"allow"}`, so Antigravity's own review prompts are never
     suppressed), or
   - denies with `{"decision":"deny","reason":…}` on stdout **and** exit
     code 2, so the block holds under both of Antigravity's decision
     conventions.
2. **Advisory layer — MCP server.** A `behalfid` entry
   (`behalf mcp start`, stdio) in Antigravity's MCP config exposing
   `verify_action` and `get_permissions` so agents can check permissions and
   surface approval instructions conversationally. This layer is context
   only; it enforces nothing.

### Tool → action mapping

Antigravity's harness exposes Windsurf-heritage tool names in the IDE and
Gemini-heritage names in the CLI. Both are mapped:

| Antigravity tools | BehalfID action | Resource |
|---|---|---|
| `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `write_file`, `replace`, `edit_file`, `create_file`, `delete_file`, `remove_file` | `write_file` | `filesystem` |
| `view_file`, `read_file`, `read_many_files`, `view_code_item` | `read_file` | `filesystem` |
| `run_command`, `run_shell_command` | `execute_command` | `shell` |
| `web_fetch`, `google_web_search`, `search_web`, `read_url_content`, `browser_*` | `browse_web` | request hostname, or `web` |
| `mcp__<server>__<tool>`, or any tool with an `mcp_context` server name | `mcp_tool` | MCP server name |
| `task`, `agent`, `run_subagent`, `spawn_subagent`, `delegate_task` | `spawn_agent` | `agent` |

Unmapped tools (`list_directory`, `glob`, `search_file_content`, …) pass
through without a verify round-trip in both enforcement modes.

## Installation

```bash
npm install -g @behalfid/cli     # provides the `behalf` binary
behalf init                      # configure agent ID + API key (~/.behalf/config.json)
behalf antigravity install       # advisory-outage mode (default)
# or
behalf antigravity install --enforce   # required mode: fail closed on outages
```

Restart the Antigravity IDE and any running `agy` sessions afterwards — hooks
are loaded at session start.

Other commands:

```bash
behalf antigravity status        # hook / MCP / enforcement status
behalf antigravity install --dry-run
behalf antigravity install --skip-mcp
behalf antigravity uninstall
behalf doctor                    # includes Antigravity hook + MCP checks
```

## Authentication

The gate authenticates to BehalfID with the agent API key (`bhf_sk_…`) from
`~/.behalf/config.json` (written by `behalf init` or
`behalf config set api-key …`). Environment variables are **not** a supported
credential path for the Antigravity gate: Antigravity executes hooks with a
sanitized environment, so `BEHALFID_API_KEY` would silently never arrive.
The config file is written with mode `0600`.

Identity sent with every verification: the configured `agentId` (account and
workspace resolution happens server-side from the API key). Repository and
workspace identity travel as `cwd` inside the sanitized policy context; the
server canonicalizes paths against it.

## Advisory vs. required (enforced) mode

| Condition | `advisory` (default) | `required` (`--enforce`) |
|---|---|---|
| BehalfID denies the action | **Blocked** | **Blocked** |
| Approval required, not yet granted | **Blocked** (retry after approving) | **Blocked** (retry after approving) |
| Oversized policy context (> 16 KB path/command) | **Blocked** | **Blocked** |
| BehalfID unreachable / API timeout (10 s) | Allowed with warning | **Blocked** |
| Invalid or missing credentials | Allowed with warning | **Blocked** |
| Malformed or oversized hook payload | Allowed with warning | **Blocked** |
| Payload missing a tool name | Allowed with warning | **Blocked** |
| Tool with no BehalfID-gated equivalent | Allowed (no verify call) | Allowed (no verify call) |

`advisory` matches the Claude Code PreToolUse hook posture (denials block; an
outage never bricks the agent). `required` satisfies fail-closed enterprise
enforcement. The mode is stored in `~/.behalf/config.json`
(`antigravityEnforcement`) and shown by `behalf antigravity status` and
`behalf doctor`.

Do not describe the MCP layer as enforcement. Only the PreToolUse gate blocks
actions, and only `required` mode fails closed on outages.

## Example policy

Gate shell commands and file writes for an agent, requiring approval for
writes outside `src/`:

```bash
behalf permissions create agent_xxx --action execute_command -r shell
behalf permissions create agent_xxx --action write_file -r filesystem \
  --allowed-paths 'src/**' --requires-approval
behalf permissions create agent_xxx --action read_file -r filesystem
```

Any Antigravity tool call that maps to an action with no active permission is
denied.

## How approvals work

1. The agent attempts a gated action; the gate blocks it with
   "approval required. Visit your BehalfID Action Inbox to approve, then retry
   the action."
2. A pending approval request appears in the Action Inbox, **bound to the
   exact canonical target** — the complete command string or the lexically
   canonicalized file path (SHA-256 fingerprint).
3. A human approves it in the dashboard. Self-approval restrictions and
   authority levels apply server-side.
4. The agent retries the same action. The server atomically consumes the
   grant (single-use) and allows exactly that target once.
5. A retry with a different command/path does not match the fingerprint and
   creates a new pending request. A second identical retry after consumption
   requires a new approval.

## How to verify enforcement (canary test)

Run this after every install or Antigravity upgrade — config file locations
and hook semantics are controlled by Google and can change between releases:

1. `behalf antigravity status` → gate installed, credentials configured.
2. Ensure the agent has **no** `execute_command` permission (or add a
   `deniedCommands` entry for a marker like `behalfid-canary`).
3. In Antigravity, ask the agent to run `echo behalfid-canary`.
4. Expected: the tool call is blocked and the agent reports the BehalfID
   denial reason. `behalf logs tail` shows the denied `execute_command`
   verification.
5. If the command executes, the hook is not being invoked — see
   Troubleshooting. **Do not treat the integration as enforced until the
   canary blocks.**

For `required` mode, additionally verify fail-closed: stop or firewall the
BehalfID API, retry the canary, and confirm the call is blocked with a
"failing closed" reason.

## Inspecting activity

Every gated tool call (allowed or denied) produces a verification log entry:

```bash
behalf logs tail            # live stream
behalf logs list --limit 50
```

or the dashboard's Activity view. Approval decisions appear in the Action
Inbox with the bound command/path preview (secrets redacted server-side).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Canary command executes unblocked | Antigravity session started before install (restart it); hook file location changed in a newer Antigravity release (re-verify against current docs); workspace not trusted. |
| Every tool call blocked with a BehalfID reason | `required` mode with BehalfID unreachable or credentials invalid. Fix connectivity/credentials, or `behalf antigravity install --advisory`. |
| "not configured (agent ID or API key missing)" warnings | Run `behalf init` — the gate reads `~/.behalf/config.json`, not env vars. |
| Install fails with "not valid JSON" | Repair or back up the reported file; BehalfID never overwrites malformed config. |
| Hook works in CLI but not IDE (or vice versa) | Both read `~/.gemini/config/hooks.json`, but only for trusted folders; restart the surface that misses the hook and re-run the canary on it. |
| Debug tracing | Run the gate manually: `echo '{"tool_name":"run_command","tool_input":{"command":"ls"}}' | BEHALFID_DEBUG=1 behalf hook antigravity`. (The env var does not propagate through Antigravity's sanitized hook environment.) |

## Removal / rollback

```bash
behalf antigravity uninstall
```

Removes the `behalfid` hooks namespace and the `behalfid` MCP entries, leaves
every other entry untouched, and clears the stored enforcement mode. Restart
Antigravity sessions to drop the hook. Manual rollback: delete the `behalfid`
keys from `~/.gemini/config/hooks.json` and the `mcpServers.behalfid` entries
from the MCP config files.

## Known limitations

- **The gate governs tool calls that Antigravity routes through PreToolUse
  hooks.** Anything Antigravity executes without firing PreToolUse is not
  seen. Hook coverage of IDE browser actions, background agents, and internal
  tools has not been independently verified — run the canary on each surface
  you rely on.
- **A user with local file access can remove the hook** (edit
  `~/.gemini/config/hooks.json`). Antigravity has no documented org-managed,
  tamper-proof hook deployment. This is the same trust boundary as the Claude
  Code integration: enforcement binds the agent, not a hostile human on the
  same machine.
- **Workspace-local hooks are not managed.** BehalfID installs globally;
  `<workspace>/.agents/hooks.json` is left to the user.
- **No post-execution outcome recording.** Audit evidence is decision-time
  (the verification log). A PostToolUse audit event needs a server-side
  ingestion endpoint that does not exist yet.
- **No Antigravity plugin package.** Plugins exist ("Extensions, now
  Antigravity plugins") and can reportedly carry hooks, but Google has not
  published a stable public manifest spec; shipping one would mean inventing
  undocumented fields. The CLI installer is the supported distribution path.
- **Subagents:** Antigravity documents subagents and nested tool
  confirmations; whether every subagent tool call fires PreToolUse is not
  officially documented. Validate with the canary inside a subagent task.
- **Hosted/cloud execution** (Google-hosted agent runs, if/where offered) has
  no local hooks file; it is out of scope for this integration.
- Antigravity's own permission system (`settings.json` `permission.allow`,
  "Always Approve", execution modes) is independent of and complementary to
  BehalfID; the gate never modifies it.

## Validation matrix

Populated only with facts verified during this integration (2026-07-13).
"Needs canary" = supported by the shared config architecture but not yet
validated end-to-end against a live Antigravity install from this repo.

| Surface | MCP available | Pre-action enforcement | Post-action audit | Fail-closed possible | Status |
|---|---|---|---|---|---|
| Desktop (Antigravity IDE) | Yes (documented) | PreToolUse hooks (documented; shared hooks.json) | Decision-time verification log only | Yes — deny on hook error + `required` mode | Implemented; needs canary |
| IDE (editor agent panel) | Yes (documented) | Same shared hooks.json | Decision-time verification log only | Yes | Implemented; needs canary |
| CLI (`agy`) | Yes (documented) | PreToolUse hooks (verified in the wild: non-zero exit blocks tool calls) | Decision-time verification log only | Yes | Implemented; needs canary |
| Hosted/API | Unverified | No local hook surface | No | No | Not supported |
| Background agents | Shares config | Not officially documented | Decision-time log if hooks fire | Unknown | Unverified — canary required |
| Subagents | Shares config | Nested tool confirmations documented; hook firing not documented | Decision-time log if hooks fire | Unknown | Unverified — canary required |

## Manual validation guide

On a machine with Antigravity installed:

1. `behalf init` with a test agent; create an `execute_command` permission
   with `deniedCommands: ["behalfid-canary"]`.
2. `behalf antigravity install` → restart Antigravity.
3. Allowed path: ask the agent to run `ls`. Expect execution and an allowed
   `execute_command` entry in `behalf logs tail`.
4. Denied path: ask it to run `echo behalfid-canary`. Expect a block.
5. Approval path: mark `write_file` `--requires-approval`, ask the agent to
   write a file, approve in the Action Inbox, ask it to retry. Expect block →
   approve → allowed once → blocked again on a third attempt.
6. `behalf antigravity install --enforce`, stop the BehalfID API, retry `ls`.
   Expect a "failing closed" block. Restart the API, expect allow.
7. Repeat step 4 inside a subagent task and (IDE) with a browser action to
   record actual coverage for the matrix above.
8. `behalf antigravity uninstall` → restart → confirm the canary executes
   again (hook fully removed).
