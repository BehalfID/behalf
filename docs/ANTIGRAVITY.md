# Google Antigravity Integration

Status as of 2026-07-13. Covers BehalfID's integration with Google Antigravity
(the Antigravity IDE / "Antigravity 2.0" and the `agy` CLI).

> **Status: enforcement candidate pending live canary validation.** The PreToolUse
> gate is implemented and unit-tested, but no live denied-action canary has
> been run against a real Antigravity install from this repository. Until the
> canary results in "Live validation" below are recorded, describe this
> integration as an *enforcement candidate*, not as enforced. The advisory
> MCP layer is available. `required` mode governs only actions that
> Antigravity actually routes through a functioning `PreToolUse` hook.

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

1. **Enforcement-candidate layer — PreToolUse gate.** A `behalfid` namespace
   entry in `~/.gemini/config/hooks.json` runs `behalf hook antigravity`
   before every tool call in the IDE and the CLI. The gate:
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
| `mcp_{server}_{tool}` (documented FQN), `mcp__{server}__{tool}` (provisional alias), or any tool with an `mcp_context` server name | `mcp_tool` | MCP server name |
| `task`, `agent`, `run_subagent`, `spawn_subagent`, `delegate_task` | `spawn_agent` | `agent` |

### Unknown tools

A tool name that does not map to a BehalfID action is **not** assumed safe:

- **`required` mode: unknown tools are denied by default.** A new, renamed,
  plugin-supplied, or undocumented tool cannot bypass the gate. The only
  exceptions are the tools below, each independently documented as a
  metadata-only local listing operation (never inferred from the name):

  | Allowlisted tool | Evidence (official Gemini CLI tool reference, the Apache-2.0 upstream of the Antigravity CLI) |
  |---|---|
  | `list_directory` | "Lists the names of files and subdirectories directly within a specified path." (docs/tools/file-system.md, read) |
  | `glob` | "Finds files matching specific glob patterns across the workspace." (docs/tools/file-system.md, read) |

  These tools still expose filesystem metadata such as names and directory
  structure, even though they do not directly return file contents.

- **`grep_search` and `search_file_content` are intentionally unmapped.** They
  search file contents and therefore must be subject to `read_file`
  permissions, `allowedPaths`, `deniedPaths`, approvals, and verification
  logging. Their path or search-root argument schemas have not been
  established by a live Antigravity payload capture. Until they are captured,
  the gate does not guess their argument fields: `required` mode denies them
  as unrecognized, while `advisory` mode warns and continues without calling
  `/api/verify`. A future mapping to `read_file` requires captured schemas.

- **`advisory` mode: unknown tools are allowed with an explicit stderr
  warning** ("unrecognized tool … — allowing without verification"), so the
  gap is visible instead of silent.

### Required binding arguments

For mapped actions, the gate requires the arguments that identify the action
before it will verify. A target-dependent verification is never sent with an
absent target and then described as evaluated:

| Action | Minimum binding argument |
|---|---|
| `execute_command` | non-empty command string |
| `write_file` / `read_file` | non-empty file path |
| `browse_web` | URL for `read_url_content` / `browser_navigate`; URL **or** prompt for `web_fetch` (its documented argument is a URL-carrying `prompt`); non-empty query for search tools; other `browser_*` interactions carry no target argument |
| `mcp_tool` | non-empty MCP server identity (from `mcp_context` or the tool-name FQN) |
| `spawn_agent` | none — the action itself is the policy target |

When a binding argument is missing, empty, or the tool arguments are not a
JSON object (including nested `toolCall.args`): `required` mode **denies
locally** without calling BehalfID; `advisory` mode warns that target policy
constraints cannot be evaluated and verifies the action-level permission
only. Note that a local deny in `required` mode produces no server-side
verification log entry — the block is visible in the Antigravity transcript.

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
| Tool arguments not a JSON object | Allowed with warning (treated as missing) | **Blocked** |
| Missing/empty binding argument (command, path, URL, MCP server) | Verified without target, with warning | **Blocked locally** |
| Unknown tool (not mapped, not allowlisted) | Allowed with warning, no verification | **Blocked** |
| Content-search tool pending payload capture (`grep_search`, `search_file_content`) | Allowed with warning, no verification | **Blocked as unrecognized** |
| Metadata-only allowlisted tool (`list_directory`, `glob`) | Allowed (no verify call) | Allowed (no verify call) |

`advisory` matches the Claude Code PreToolUse hook posture (denials block; an
outage never bricks the agent). `required` fails closed everywhere the gate
cannot produce a positive verification. The mode is stored in
`~/.behalf/config.json` (`antigravityEnforcement`) and shown by
`behalf antigravity status` and `behalf doctor`.

Do not describe the MCP layer as enforcement. Only the PreToolUse gate blocks
actions, only `required` mode fails closed on outages, and `required` mode
governs only actions that Antigravity actually routes through a functioning
PreToolUse hook — which is exactly what the live canary below verifies.

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

1. Create and configure a dedicated test agent. Give it exactly one active
   `execute_command` permission for `shell`; confirm there is no other
   applicable `execute_command` permission.
2. In Antigravity, ask the agent to run `echo ok`. Confirm the command executes
   and `behalf logs tail` shows an allowed `execute_command` verification.
3. Revoke that unrestricted permission with
   `behalf permissions revoke <permission_id>`. Confirm it is no longer active.
4. Only after revocation, create its constrained replacement:
   `behalf permissions create <agent_id> --action execute_command -r shell --denied-commands behalfid-canary`.
5. Confirm the replacement is the dedicated agent's only applicable active
   `execute_command` permission and contains the denied marker.
6. In Antigravity, ask the agent to run `echo behalfid-canary`.
7. Expected: the tool call is blocked, the command produces no output, and
   `behalf logs tail` shows the denied `execute_command` verification.
8. If the command executes, the hook is not being invoked — see
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

## Payload formats and provenance

The gate parses several payload shapes defensively. They are **not** equally
trustworthy. Three tiers (mirrored in `test/fixtures/antigravity/`):

| Tier | Shapes | Basis |
|---|---|---|
| **Documented** | snake_case envelope (`tool_name`, `tool_input`, `session_id`, `cwd`, `mcp_context`); Gemini-heritage tool names (`run_shell_command` + `command`, `write_file` + `file_path`, `read_file` + `absolute_path`, `web_fetch` + `prompt`, `google_web_search` + `query`); MCP FQN `mcp_{server}_{tool}` | Official Gemini CLI hooks + tool references (the Apache-2.0 upstream of the Antigravity CLI) |
| **Captured** | none yet | Live `agy` / IDE sessions via `behalf hook capture-schema` — **no captures exist in this repo yet** |
| **Provisional** | camelCase variants (`toolName`, `toolInput`), nested `toolCall.args`, Windsurf-heritage IDE tool names (`write_to_file`, `run_command`, `view_file`, `TargetFile`/`CommandLine` argument aliases), `mcp__{server}__{tool}`, `browser_*` | Compatibility guesses inherited from Gemini/Claude/Windsurf conventions and secondary write-ups. Tolerated so shape drift degrades to the documented fail-open/fail-closed behavior instead of a misread — but never treat provisional coverage as evidence of live compatibility |

### Capturing real hook payloads

`behalf hook capture-schema` is a diagnostic hook that records only the
payload **schema** — event name, top-level field names, the tool name, and
argument field names with their JSON types. Argument values, prompts, file
contents, paths, and credentials are never written. It always allows the call
and never verifies anything; remove it when done.

1. Temporarily add a capture entry alongside the gate in
   `~/.gemini/config/hooks.json`:

   ```json
   "behalfid-capture": {
     "PreToolUse": [
       { "matcher": ".*",
         "hooks": [ { "type": "command", "command": "behalf hook capture-schema" } ] }
     ]
   }
   ```

2. Restart Antigravity, run a short session exercising the tools you care
   about (a file write, a shell command, a browser action, a subagent task,
   an MCP tool).
3. Inspect `~/.behalf/antigravity-captures.jsonl` (one JSON line per tool
   call).
4. Remove the `behalfid-capture` entry and restart.
5. Turn interesting schemas into fixtures under
   `test/fixtures/antigravity/captured/` following the sanitization rules in
   `test/fixtures/antigravity/README.md`, and promote the corresponding tool
   names/aliases from provisional to captured.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Canary command executes unblocked | Antigravity session started before install (restart it); hook file location changed in a newer Antigravity release (re-verify against current docs); workspace not trusted. |
| Every tool call blocked with a BehalfID reason | `required` mode with BehalfID unreachable or credentials invalid. Fix connectivity/credentials, or `behalf antigravity install --advisory`. |
| "not configured (agent ID or API key missing)" warnings | Run `behalf init` — the gate reads `~/.behalf/config.json`, not env vars. |
| Install fails with "not valid JSON" | Repair or back up the reported file; BehalfID never overwrites malformed config. |
| Hook works in CLI but not IDE (or vice versa) | Both read `~/.gemini/config/hooks.json`, but only for trusted folders; restart the surface that misses the hook and re-run the canary on it. |
| Debug tracing | Run the gate manually: `echo '{"tool_name":"run_command","tool_input":{"command":"ls"}}' | BEHALFID_DEBUG=1 behalf hook antigravity`. (The env var does not propagate through Antigravity's sanitized hook environment.) |

Windows follow-up: one live device-login run printed
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c`
immediately after authorization. The login browser launcher uses a detached,
unreferenced `cmd /c start` child, but the assertion has not been reproduced in
the CLI test harness and is not conclusively attributable to that child. The
launcher remains unchanged pending a minimal reproduction with recorded Node
and CLI versions.

## Removal / rollback

```bash
behalf antigravity uninstall
```

Removes the `behalfid` hooks namespace and the `behalfid` MCP entries, leaves
every other entry untouched, and clears the stored enforcement mode. Restart
Antigravity sessions to drop the hook.

All config writes are atomic (temp file + rename — an interruption can never
leave a truncated file), preserve the target file's permissions, and write a
pre-change backup to `<file>.behalfid.bak` before modifying an existing file.
Full manual rollback: `mv <file>.behalfid.bak <file>` for each modified file,
or delete the `behalfid` keys from `~/.gemini/config/hooks.json` and the
`mcpServers.behalfid` entries from the MCP config files.

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

Populated only with facts verified as of 2026-07-13. "Enforced" is reserved
for a surface on which a live denied-action canary has demonstrated that
execution did not occur — **no surface qualifies yet**.

| Capability / surface | Status |
|---|---|
| Advisory MCP | **Available** (config layer implemented; stdio server is the existing `behalf mcp start`) |
| PreToolUse enforcement candidate | **Implemented** (gate + installer + unit tests; decision protocol per documented conventions and real-world hook evidence) |
| CLI (`agy`) enforcement | **Pending live canary** |
| IDE enforcement | **Pending live canary** |
| Browser tools | **Unverified** (hook coverage of IDE browser actions unknown) |
| Background tasks | **Unverified** (hook firing not officially documented) |
| Subagents | **Unverified** (nested tool confirmations documented; hook firing not documented) |
| Plugins | **Unverified** (no public manifest spec; plugin-supplied tools are denied by default in `required` mode) |
| Hosted/API agents | **Unsupported** (no local hook surface) |

Detail per surface:

| Surface | MCP available | Pre-action gate | Post-action audit | Fail-closed possible |
|---|---|---|---|---|
| Desktop/IDE (Antigravity) | Yes (documented) | PreToolUse hooks (documented; shared hooks.json) — pending canary | Decision-time verification log only | Yes — deny on hook error + `required` mode — pending canary |
| CLI (`agy`) | Yes (documented) | PreToolUse hooks (real-world evidence: non-zero hook exit blocks tool calls) — pending canary | Decision-time verification log only | Yes — pending canary |
| Hosted/API | Unverified | No local hook surface | No | No |
| Background agents | Shares config | Unknown — canary required | Decision-time log if hooks fire | Unknown |
| Subagents | Shares config | Unknown — canary required | Decision-time log if hooks fire | Unknown |

## Live validation (required before any enforcement claim)

Run on a machine with Antigravity installed. Prerequisites once:

```bash
npm install -g @behalfid/cli
behalf agents create --name "Antigravity Canary" --save
behalf permissions create <agent_id> --action execute_command -r shell
behalf antigravity install
# restart the Antigravity IDE and any running `agy` sessions
behalf antigravity status
```

Use this dedicated agent only for validation. Before proceeding, confirm it
has exactly one applicable active `execute_command` permission: the permission
created above. Record that permission's ID, then execute each step and record
it in the results template below.

1. **Capture a sanitized PreToolUse payload from `agy`.** Add the
   `behalfid-capture` entry from "Capturing real hook payloads" above to
   `~/.gemini/config/hooks.json`, restart, then in `agy` ask the agent to run
   `echo capture-test` and to write a scratch file. Verify schema lines in
   `~/.behalf/antigravity-captures.jsonl` contain field names/types only.
   Remove the capture entry afterwards.
2. **Allowed command executes.** In `agy`: ask the agent to run `echo ok`.
   Expect execution, and an allowed `execute_command` entry in
   `behalf logs tail`.
3. **Denied command does not execute.** Revoke the permission used in step 2:
   `behalf permissions revoke <permission_id>`. Confirm it is inactive before
   creating the constrained replacement:
   `behalf permissions create <agent_id> --action execute_command -r shell --denied-commands behalfid-canary`.
   Confirm the replacement is the only applicable active `execute_command`
   permission, then ask the agent to run `echo behalfid-canary`. Expect: the
   tool call is blocked, no command output is produced, and a denied entry
   appears in `behalf logs tail`.
4. **Required mode fails closed when BehalfID is unreachable.**
   `behalf antigravity install --enforce`, then make the API unreachable
   (stop the local instance, or `behalf config set base-url http://127.0.0.1:9`).
   Ask the agent to run `echo ok`. Expect a block with a "failing closed"
   reason and no execution. Restore the base URL afterwards.
5. **Unknown tool blocks in required mode.** With `--enforce` active, ask the
   agent to use a memory/save operation or any tool outside the mapped set
   (e.g. "save a memory that my favorite color is blue" → `save_memory`).
   Expect a block naming the unrecognized tool. (In advisory mode the same
   call should warn and proceed.)
6. **Repeat steps 2–5 in the Antigravity IDE** (editor agent panel and the
   agent manager surface).
7. **Repeat step 3 inside a subagent.** Ask the agent to delegate the canary
   command to a subagent task. Record whether the hook fired at the subagent
   depth.
8. **Repeat step 3 inside a background task.** Ask the agent to run the
   canary as a background/async task. Record whether the hook fired.
9. **Test at least one browser action.** Ask the IDE agent to open a page in
   the browser surface. Record whether a PreToolUse event fired (check
   `behalf logs tail` for a `browse_web` verification, or use the capture
   hook), and whether a denied `browse_web` permission blocks it.
10. **MCP server starts independently of the hook.** Start from a normal
    `behalf antigravity install`, with both the hook and MCP registration
    present. Back up the hook configuration:

    ```bash
    cp ~/.gemini/config/hooks.json ~/.gemini/config/hooks.json.mcp-canary.bak
    ```

    Manually edit `~/.gemini/config/hooks.json` as valid JSON and remove only
    its top-level `behalfid` hook namespace. Do not change the MCP config;
    confirm `mcpServers.behalfid` remains in the active Antigravity MCP
    configuration. Restart Antigravity and confirm `verify_action` and
    `get_permissions` remain available and respond. Restore the exact hook
    configuration and restart again:

    ```bash
    cp ~/.gemini/config/hooks.json.mcp-canary.bak ~/.gemini/config/hooks.json
    ```

    Do **not** use `behalf antigravity uninstall` for this test: that command
    removes both the hook and the BehalfID MCP registration.

Finally: `behalf antigravity uninstall`, restart, and confirm the canary
command executes again (hook fully removed, rollback verified).

### Validation results template

Copy one row per test run. Only after the denied-action rows show
"hook fired: yes / executed: no" on a surface may that surface be labeled
enforced.

```
Antigravity version: ................ (agy --version / IDE About)
Operating system:    ................
BehalfID CLI:        ................ (behalf --version)
Date:                ................
Canary agent ID:     ................ (dedicated test agent)
Allowed permission:  ................ (step 2; revoked before step 3)
Denied permission:   ................ (step 3; the sole active replacement)
```

| # | Surface (CLI/IDE/subagent/background/browser) | Tool name | Hook fired? | BehalfID received verification? (`behalf logs`) | Execution occurred? | Expected | Actual | Pass? |
|---|---|---|---|---|---|---|---|---|
| 2 | CLI | run_shell_command (single unrestricted permission) | | | | allowed + executed | | |
| 3 | CLI | run_shell_command (sole constrained replacement permission) | | | | blocked, not executed | | |
| 4 | CLI, required, API down | run_shell_command | | | | blocked locally, not executed | | |
| 5 | CLI, required | (unknown tool) | | | | blocked, not executed | | |
| 6a | IDE | (repeat 2) | | | | allowed + executed | | |
| 6b | IDE | (repeat 3) | | | | blocked, not executed | | |
| 7 | Subagent | (canary) | | | | blocked, not executed | | |
| 8 | Background task | (canary) | | | | blocked, not executed | | |
| 9 | Browser | (browser action) | | | | verification logged | | |
| 10 | MCP | verify_action | n/a | | n/a | tools respond without hook | | |
